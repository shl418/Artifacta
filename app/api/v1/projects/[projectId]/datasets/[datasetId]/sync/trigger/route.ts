import { requireRequestAuth } from "@/lib/server/auth"
import { canEditProject } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { rateLimitResponse } from "@/lib/server/rate-limit"
import { apiError } from "@/lib/server/responses"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; datasetId: string }> }

// Dataset-level sync was replaced by project sync scripts; this endpoint always
// returns 410. It mutates nothing, so it must not take the global write lock.
export async function POST(request: Request, context: RouteContext) {
  const limited = rateLimitResponse(request, "sync-trigger", 60)
  if (limited) return limited

  const { projectId, datasetId } = await context.params
  const auth = await requireRequestAuth(request, "sync:run")
  if (auth instanceof Response) return auth

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const dataset = database.datasets.find((candidate) => candidate.id === datasetId && candidate.projectId === projectId)

  if (!project || !dataset) return apiError(404, "NOT_FOUND", "数据集不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权触发同步。")

  return apiError(410, "SYNC_REMOVED", "数据集外部动态更新已移除，请使用项目同步脚本并手动触发。")
}
