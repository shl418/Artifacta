import { authenticateRequest } from "@/lib/server/auth"
import { canEditProject } from "@/lib/server/access"
import { addActivity, now, readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"
import { serializeProjectDetail } from "@/lib/server/serializers"
import { saveProjectArtifact } from "@/lib/server/storage"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string }> }

export async function PUT(request: Request, context: RouteContext) {
  const { projectId } = await context.params
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)

  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权更新该项目。")

  const form = await request.formData().catch(() => null)
  const file = form?.get("html_file")
  const htmlFile = file && typeof file === "object" && "arrayBuffer" in file ? (file as File) : null

  if (!htmlFile) return apiError(400, "INVALID_REQUEST", "请上传 html_file。", { field: "html_file" })

  const artifact = await saveProjectArtifact(projectId, htmlFile).catch((error) => {
    if (error instanceof Error) return error
    return new Error("看板文件保存失败。")
  })
  if (artifact instanceof Error) return apiError(400, "INVALID_ARTIFACT", artifact.message, { field: "html_file" })

  const updated = await updateDatabase((mutable) => {
    const record = mutable.projects.find((candidate) => candidate.id === projectId)!
    record.htmlArtifact = artifact
    record.updatedAt = now()
    addActivity(mutable, {
      organizationId: auth.user.organizationId,
      type: "dashboard",
      userId: auth.user.id,
      action: "更新了看板文件",
      target: record.name,
    })
    return record
  })

  const refreshed = await readDatabase()
  return ok(serializeProjectDetail(refreshed, updated))
}
