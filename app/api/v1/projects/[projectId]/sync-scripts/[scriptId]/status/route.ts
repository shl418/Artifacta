import { authenticateRequest } from "@/lib/server/auth"
import { canEditProject, canViewProject } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"
import { findProjectSyncScript } from "@/lib/server/sync/sync-scripts"
import { serializeProjectSyncScript } from "@/lib/server/serializers"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; scriptId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { projectId, scriptId } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const script = findProjectSyncScript(database, projectId, scriptId)

  if (!project || !script) return apiError(404, "NOT_FOUND", "同步脚本不存在。")
  if (!canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问同步状态。")

  const latest = (database.scriptSyncHistory ?? []).find((history) => history.scriptId === scriptId)
  const activeJob = (database.scriptSyncJobs ?? []).find(
    (job) => job.scriptId === scriptId && (job.status === "queued" || job.status === "running")
  )

  const includeSecrets = auth ? canEditProject(database, auth.user, project) : false
  return ok({
    script: serializeProjectSyncScript(script, includeSecrets),
    last_run: latest
      ? {
          history_id: latest.id,
          status: latest.status,
          started_at: latest.startedAt,
          completed_at: latest.completedAt,
          error: latest.error,
        }
      : null,
    active_job: activeJob
      ? {
          job_id: activeJob.id,
          status: activeJob.status,
          created_at: activeJob.createdAt,
          started_at: activeJob.startedAt,
          error: activeJob.error,
        }
      : null,
  })
}
