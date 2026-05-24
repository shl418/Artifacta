import { authenticateRequest } from "@/lib/server/auth"
import { canViewProject } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { apiError, ok, paginate, parsePagination } from "@/lib/server/responses"
import { findProjectSyncScript } from "@/lib/server/sync/sync-scripts"
import { serializeScriptSyncHistory } from "@/lib/server/serializers"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; scriptId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { projectId, scriptId } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const script = findProjectSyncScript(database, projectId, scriptId)

  if (!project || !script) return apiError(404, "NOT_FOUND", "同步脚本不存在。")
  if (!canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问同步历史。")

  const url = new URL(request.url)
  const { page, perPage } = parsePagination(url)
  const result = paginate(
    (database.scriptSyncHistory ?? []).filter((history) => history.scriptId === scriptId),
    page,
    perPage
  )

  return ok({
    data: result.data.map(serializeScriptSyncHistory),
    pagination: result.pagination,
  })
}
