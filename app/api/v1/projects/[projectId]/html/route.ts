import { requireRequestAuth } from "@/lib/server/auth"
import { canEditProject } from "@/lib/server/access"
import { now, readDatabase, updateDatabase } from "@/lib/server/db"
import { dispatch } from "@/lib/server/dispatch"
import { rateLimitResponse } from "@/lib/server/rate-limit"
import { requestPayloadTooLarge } from "@/lib/server/request-size"
import { apiError, ok } from "@/lib/server/responses"
import { serializeProjectDetail } from "@/lib/server/serializers"
import { saveProjectArtifact } from "@/lib/server/storage"
import { recordDashboardVersion } from "@/lib/server/versions"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string }> }

export async function PUT(request: Request, context: RouteContext) {
  const limited = rateLimitResponse(request, "html-upload", 30)
  if (limited) return limited

  const tooLarge = requestPayloadTooLarge(request)
  if (tooLarge) return tooLarge

  const { projectId } = await context.params
  const auth = await requireRequestAuth(request, "projects:write")
  if (auth instanceof Response) return auth

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)

  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权更新该项目。")

  const form = await request.formData().catch(() => null)
  const file = form?.get("html_file")
  const htmlFile = file && typeof file === "object" && "arrayBuffer" in file ? (file as File) : null

  if (!htmlFile) return apiError(400, "INVALID_REQUEST", "请上传 html_file。", { field: "html_file" })

  const extension = htmlFile.name.toLowerCase()
  if (extension.endsWith(".zip") || htmlFile.type === "application/zip") {
    return apiError(
      400,
      "DEPRECATED",
      "ZIP 看板更新请使用 POST /upload-sessions（带 project_id）并通过 upload_session_id 提交。",
      { field: "html_file" }
    )
  }

  const artifact = await saveProjectArtifact(projectId, htmlFile).catch((error) => {
    if (error instanceof Error) return error
    return new Error("看板文件保存失败。")
  })
  if (artifact instanceof Error) return apiError(400, "INVALID_ARTIFACT", artifact.message, { field: "html_file" })

  const updated = await updateDatabase((mutable) => {
    const record = mutable.projects.find((candidate) => candidate.id === projectId)!
    recordDashboardVersion(mutable, record, auth.user.id, "Before dashboard artifact replacement")
    record.htmlArtifact = artifact
    record.updatedAt = now()
    recordDashboardVersion(mutable, record, auth.user.id, "Dashboard artifact replaced")
    dispatch(mutable, { type: "project.html.updated", organizationId: auth.user.organizationId, actorId: auth.user.id, project: { id: record.id, name: record.name }, meta: { artifact_kind: artifact.kind, original_name: artifact.originalName } })
    return record
  })

  const refreshed = await readDatabase()
  return ok(serializeProjectDetail(refreshed, updated))
}
