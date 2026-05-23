import { authenticateRequest } from "@/lib/server/auth"
import { canEditProject } from "@/lib/server/access"
import { recordAudit } from "@/lib/server/audit"
import { addActivity, now, readDatabase, updateDatabase } from "@/lib/server/db"
import { rateLimitResponse } from "@/lib/server/rate-limit"
import { apiError, ok } from "@/lib/server/responses"
import { serializeProjectDetail } from "@/lib/server/serializers"
import { saveProjectArtifact } from "@/lib/server/storage"
import { recordDashboardVersion } from "@/lib/server/versions"
import { emitWebhooks } from "@/lib/server/webhooks"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string }> }

export async function PUT(request: Request, context: RouteContext) {
  const limited = rateLimitResponse(request, "html-upload", 30)
  if (limited) return limited

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
    recordDashboardVersion(mutable, record, auth.user.id, "Before dashboard artifact replacement")
    record.htmlArtifact = artifact
    record.updatedAt = now()
    addActivity(mutable, {
      organizationId: auth.user.organizationId,
      type: "dashboard",
      userId: auth.user.id,
      action: "更新了看板文件",
      target: record.name,
    })
    recordDashboardVersion(mutable, record, auth.user.id, "Dashboard artifact replaced")
    recordAudit(mutable, {
      organizationId: auth.user.organizationId,
      actorUserId: auth.user.id,
      action: "project.html.update",
      targetType: "project",
      targetId: record.id,
      summary: `Updated dashboard artifact for ${record.name}`,
      metadata: { artifact_kind: artifact.kind, original_name: artifact.originalName },
    })
    emitWebhooks(mutable, auth.user.organizationId, "project.updated", { project_id: record.id, name: record.name })
    return record
  })

  const refreshed = await readDatabase()
  return ok(serializeProjectDetail(refreshed, updated))
}
