import { requireRequestAuth } from "@/lib/server/auth"
import { canEditProject } from "@/lib/server/access"
import { updateDatabase } from "@/lib/server/db"
import { rateLimitResponse } from "@/lib/server/rate-limit"
import { apiError, ok } from "@/lib/server/responses"
import { enqueueSyncJob } from "@/lib/server/sync/jobs"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; datasetId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const limited = rateLimitResponse(request, "sync-trigger", 60)
  if (limited) return limited

  const { projectId, datasetId } = await context.params
  const auth = await requireRequestAuth(request, "sync:run")
  if (auth instanceof Response) return auth

  const result = await updateDatabase((mutable) => {
    const project = mutable.projects.find((candidate) => candidate.id === projectId)
    const dataset = mutable.datasets.find((candidate) => candidate.id === datasetId && candidate.projectId === projectId)

    if (!project || !dataset) return { status: "not_found" as const }
    if (!canEditProject(mutable, auth.user, project)) return { status: "forbidden" as const }

    const job = enqueueSyncJob(mutable, {
      projectId,
      datasetId,
      organizationId: project.organizationId,
      trigger: "manual",
      requestedBy: auth.user.id,
    })
    return { status: "queued" as const, job }
  })

  if (result.status === "not_found") return apiError(404, "NOT_FOUND", "数据集不存在。")
  if (result.status === "forbidden") return apiError(403, "FORBIDDEN", "无权触发同步。")

  return ok(
    {
      job_id: result.job.id,
      status: result.job.status,
    },
    { status: 202 }
  )
}
