import type { ProjectPermission } from "@/lib/types"
import { authenticateRequest } from "@/lib/server/auth"
import { canEditProject } from "@/lib/server/access"
import { addActivity, readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, noContent, ok } from "@/lib/server/responses"
import { serializeProjectMember } from "@/lib/server/serializers"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; userId: string }> }

const permissionValues = new Set(["view", "edit"])

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId, userId } = await context.params
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

  const body = await request.json().catch(() => null)
  const permission = String(body?.permission ?? "")
  if (!permissionValues.has(permission)) return apiError(400, "INVALID_REQUEST", "permission 必须是 view 或 edit。", { field: "permission" })

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const member = database.projectMembers.find((candidate) => candidate.projectId === projectId && candidate.userId === userId)

  if (!project || !member) return apiError(404, "NOT_FOUND", "项目成员不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权管理项目成员。")
  if (project.ownerId === userId) return apiError(409, "CONFLICT", "不能修改项目所有者权限。")

  const updated = await updateDatabase((mutable) => {
    const record = mutable.projectMembers.find((candidate) => candidate.projectId === projectId && candidate.userId === userId)!
    record.permission = permission as ProjectPermission
    addActivity(mutable, {
      organizationId: auth.user.organizationId,
      type: "permission",
      userId: auth.user.id,
      action: "修改了项目权限",
      target: userId,
    })
    return record
  })

  const refreshed = await readDatabase()
  return ok(serializeProjectMember(refreshed, updated))
}

export async function DELETE(request: Request, context: RouteContext) {
  const { projectId, userId } = await context.params
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const member = database.projectMembers.find((candidate) => candidate.projectId === projectId && candidate.userId === userId)

  if (!project || !member) return apiError(404, "NOT_FOUND", "项目成员不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权管理项目成员。")
  if (project.ownerId === userId) return apiError(409, "CONFLICT", "不能移除项目所有者。")

  await updateDatabase((mutable) => {
    mutable.projectMembers = mutable.projectMembers.filter((candidate) => !(candidate.projectId === projectId && candidate.userId === userId))
  })

  return noContent()
}
