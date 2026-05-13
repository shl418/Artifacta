import { authenticateRequest } from "@/lib/server/auth"
import { canEditProject } from "@/lib/server/access"
import { readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, created } from "@/lib/server/responses"
import { runDatasetSync } from "@/lib/server/sync-runner"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; datasetId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const { projectId, datasetId } = await context.params
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const dataset = database.datasets.find((candidate) => candidate.id === datasetId && candidate.projectId === projectId)

  if (!project || !dataset) return apiError(404, "NOT_FOUND", "数据集不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权触发同步。")

  const history = await updateDatabase((mutable) => runDatasetSync(mutable, { projectId, datasetId, userId: auth.user.id }))

  return created({
    sync_id: history.id,
    status: history.status,
    started_at: history.startedAt,
    completed_at: history.completedAt,
    rows_synced: history.rowsSynced,
  })
}
