import type { ProjectPermission, User } from "@/lib/types"
import { authenticateRequest } from "@/lib/server/auth"
import { canEditProject, canViewProject } from "@/lib/server/access"
import { now, readDatabase, updateDatabase } from "@/lib/server/db"
import { dispatch } from "@/lib/server/dispatch"
import { apiError, created, ok } from "@/lib/server/responses"
import { serializeProjectMember } from "@/lib/server/serializers"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string }> }

const permissionValues = new Set(["view", "edit"])

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)

  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问权限配置。")

  const owner = database.users.find((user) => user.id === project.ownerId)
  return ok({
    visibility: project.visibility,
    owner: owner
      ? {
          id: owner.id,
          name: owner.name,
          email: owner.email,
        }
      : null,
    members: database.projectMembers.filter((member) => member.projectId === projectId).map((member) => serializeProjectMember(database, member)),
  })
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

  const body = await request.json().catch(() => null)
  const email = String(body?.user_email ?? body?.email ?? "").trim().toLowerCase()
  const permission = String(body?.permission ?? "view")

  if (!/^\S+@\S+\.\S+$/.test(email)) return apiError(400, "INVALID_REQUEST", "请输入有效邮箱。", { field: "user_email" })
  if (!permissionValues.has(permission)) return apiError(400, "INVALID_REQUEST", "permission 必须是 view 或 edit。", { field: "permission" })

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权管理项目成员。")

  const member = await updateDatabase((mutable) => {
    let user = mutable.users.find((candidate) => candidate.email.toLowerCase() === email)
    if (!user) {
      const createdAt = now()
      user = {
        id: `user_${crypto.randomUUID()}`,
        organizationId: auth.user.organizationId,
        email,
        name: email.split("@")[0],
        role: "member",
        status: "active",
        createdAt,
        updatedAt: createdAt,
      } satisfies User
      mutable.users.push(user)
    }

    let projectMember = mutable.projectMembers.find((candidate) => candidate.projectId === projectId && candidate.userId === user.id)
    if (!projectMember) {
      projectMember = {
        projectId,
        userId: user.id,
        permission: permission as ProjectPermission,
        addedAt: now(),
      }
      mutable.projectMembers.push(projectMember)
    } else {
      projectMember.permission = permission as ProjectPermission
    }

    dispatch(mutable, { type: "permission.upserted", organizationId: auth.user.organizationId, actorId: auth.user.id, projectId, user: { id: user.id, name: user.name, email: user.email }, permission })

    return projectMember
  })

  const refreshed = await readDatabase()
  return created(serializeProjectMember(refreshed, member))
}
