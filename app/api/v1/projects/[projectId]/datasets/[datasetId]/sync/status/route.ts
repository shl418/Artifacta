import { authenticateRequest } from "@/lib/server/auth"
import { canViewProject } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; datasetId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { projectId, datasetId } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const dataset = database.datasets.find((candidate) => candidate.id === datasetId && candidate.projectId === projectId)

  if (!project || !dataset) return apiError(404, "NOT_FOUND", "数据集不存在。")
  if (!canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问同步状态。")

  const latest = database.syncHistory.find((history) => history.datasetId === datasetId)

  return ok({
    sync_id: latest?.id ?? null,
    status: latest?.status ?? dataset.syncConfig.lastSyncStatus ?? "pending",
    started_at: latest?.startedAt ?? null,
    completed_at: latest?.completedAt ?? null,
    rows_synced: latest?.rowsSynced ?? 0,
    error: latest?.error ?? null,
  })
}
