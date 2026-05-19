import { authenticateRequest } from "@/lib/server/auth"
import { canEditProject } from "@/lib/server/access"
import { annotateFileTreeWithExistingDatasets, cleanExpiredSessions, createUploadSession } from "@/lib/server/artifacts/upload-session"
import { readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, created } from "@/lib/server/responses"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

  const form = await request.formData().catch(() => null)
  if (!form) return apiError(400, "INVALID_REQUEST", "请求体必须是 multipart/form-data。")

  const file = form.get("file")
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return apiError(400, "INVALID_REQUEST", "请上传 ZIP 文件。", { field: "file" })
  }

  const projectIdInput = String(form.get("project_id") ?? "").trim() || null

  const database = await readDatabase()
  if (projectIdInput) {
    const project = database.projects.find((item) => item.id === projectIdInput && item.organizationId === auth.user.organizationId)
    if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
    if (!canEditProject(database, auth.user, project)) {
      return apiError(403, "FORBIDDEN", "你没有权限更新该项目。")
    }
  }

  try {
    const payload = await updateDatabase(async (nextDatabase) => {
      cleanExpiredSessions(nextDatabase)
      const { session, fileTree } = await createUploadSession({
        file: file as File,
        userId: auth.user.id,
        organizationId: auth.user.organizationId,
        projectId: projectIdInput,
      })
      nextDatabase.uploadSessions.push(session)
      const annotatedTree = projectIdInput
        ? annotateFileTreeWithExistingDatasets(nextDatabase, projectIdInput, fileTree)
        : fileTree
      return { session, fileTree: annotatedTree }
    })

    return created({
      session_id: payload.session.id,
      file_tree: payload.fileTree,
      expires_at: payload.session.expiresAt,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法创建上传会话。"
    return apiError(400, "INVALID_ARTIFACT", message, { field: "file" })
  }
}
