import { authenticateRequest } from "@/lib/server/auth"
import { canEditProject } from "@/lib/server/access"
import { now, readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"
import { serializeProjectDetail } from "@/lib/server/serializers"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

  const body = await request.json().catch(() => null)
  const folderId = body?.folder_id === null || body?.folder_id === "root" ? null : String(body?.folder_id ?? "").trim()
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)

  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权移动该项目。")
  if (folderId && !database.folders.some((folder) => folder.id === folderId && folder.organizationId === auth.user.organizationId)) {
    return apiError(404, "NOT_FOUND", "文件夹不存在。")
  }

  const updated = await updateDatabase((mutable) => {
    const record = mutable.projects.find((candidate) => candidate.id === projectId)!
    record.folderId = folderId || null
    record.updatedAt = now()
    return record
  })

  const refreshed = await readDatabase()
  return ok(serializeProjectDetail(refreshed, updated))
}
