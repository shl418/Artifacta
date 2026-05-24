import { canEditProject } from "@/lib/server/access"
import { requireRequestAuth } from "@/lib/server/auth"
import { updateDatabase } from "@/lib/server/db"
import { rateLimitResponse } from "@/lib/server/rate-limit"
import { apiError, ok } from "@/lib/server/responses"
import { enqueueScriptSyncJob } from "@/lib/server/sync/script-jobs"
import { findProjectSyncScript } from "@/lib/server/sync/sync-scripts"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; scriptId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const limited = rateLimitResponse(request, "script-sync-trigger", 60)
  if (limited) return limited

  const { projectId, scriptId } = await context.params
  const auth = await requireRequestAuth(request, "sync:run")
  if (auth instanceof Response) return auth

  const result = await updateDatabase((mutable) => {
    const project = mutable.projects.find((candidate) => candidate.id === projectId)
    const script = findProjectSyncScript(mutable, projectId, scriptId)

    if (!project || !script) return { status: "not_found" as const }
    if (!canEditProject(mutable, auth.user, project)) return { status: "forbidden" as const }
    if (!script.enabled) return { status: "disabled" as const }

    const job = enqueueScriptSyncJob(mutable, {
      projectId,
      scriptId: script.id,
      organizationId: project.organizationId,
      trigger: "manual",
      requestedBy: auth.user.id,
    })
    return { status: "queued" as const, job }
  })

  if (result.status === "not_found") return apiError(404, "NOT_FOUND", "同步脚本不存在。")
  if (result.status === "forbidden") return apiError(403, "FORBIDDEN", "无权触发脚本同步。")
  if (result.status === "disabled") return apiError(400, "INVALID_REQUEST", "同步脚本已禁用。")

  return ok({ job_id: result.job.id, status: result.job.status }, { status: 202 })
}
