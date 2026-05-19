import { authenticateRequest } from "@/lib/server/auth"
import { canViewProject } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { apiError, ok, paginate, parsePagination } from "@/lib/server/responses"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; datasetId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { projectId, datasetId } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const dataset = database.datasets.find((candidate) => candidate.id === datasetId && candidate.projectId === projectId)

  if (!project || !dataset) return apiError(404, "NOT_FOUND", "数据集不存在。")
  if (!canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问同步历史。")

  const url = new URL(request.url)
  const { page, perPage } = parsePagination(url)
  const result = paginate(
    database.syncHistory.filter((history) => history.datasetId === datasetId),
    page,
    perPage
  )

  return ok({
    data: result.data.map((history) => ({
      sync_id: history.id,
      status: history.status,
      started_at: history.startedAt,
      completed_at: history.completedAt,
      rows_synced: history.rowsSynced,
      update_mode: history.updateMode,
      error: history.error,
    })),
    pagination: result.pagination,
    jobs: database.syncJobs
      .filter((job) => job.projectId === projectId && job.datasetId === datasetId)
      .map((job) => ({
        job_id: job.id,
        status: job.status,
        trigger: job.trigger,
        created_at: job.createdAt,
        started_at: job.startedAt,
        completed_at: job.completedAt,
        error: job.error,
      })),
  })
}
