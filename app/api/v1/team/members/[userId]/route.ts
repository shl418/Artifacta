import type { UserRole, UserStatus } from "@/lib/types"
import { requireRequestAuth } from "@/lib/server/auth"
import { canManageTeam } from "@/lib/server/access"
import { now, readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, noContent, ok } from "@/lib/server/responses"
import { serializeUser } from "@/lib/server/serializers"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ userId: string }> }

const roles = new Set(["admin", "member"])
const statuses = new Set(["active", "pending", "disabled"])

export async function PATCH(request: Request, context: RouteContext) {
  const { userId } = await context.params
  const auth = await requireRequestAuth(request, "team:write")
  if (auth instanceof Response) return auth
  if (!canManageTeam(auth.user)) return apiError(403, "FORBIDDEN", "只有管理员可以修改成员。")

  const body = await request.json().catch(() => null)
  const role = body?.role === undefined ? undefined : String(body.role)
  const status = body?.status === undefined ? undefined : String(body.status)

  if (role && !roles.has(role)) return apiError(400, "INVALID_REQUEST", "role 必须是 admin 或 member。", { field: "role" })
  if (status && !statuses.has(status)) return apiError(400, "INVALID_REQUEST", "status 不合法。", { field: "status" })

  const database = await readDatabase()
  const user = database.users.find((candidate) => candidate.id === userId && candidate.organizationId === auth.user.organizationId)
  if (!user) return apiError(404, "NOT_FOUND", "成员不存在。")

  const updated = await updateDatabase((mutable) => {
    const record = mutable.users.find((candidate) => candidate.id === userId)!
    if (role) record.role = role as UserRole
    if (status) record.status = status as UserStatus
    record.updatedAt = now()
    return record
  })

  return ok(serializeUser(updated))
}

export async function DELETE(request: Request, context: RouteContext) {
  const { userId } = await context.params
  const auth = await requireRequestAuth(request, "team:write")
  if (auth instanceof Response) return auth
  if (!canManageTeam(auth.user)) return apiError(403, "FORBIDDEN", "只有管理员可以移除成员。")
  if (userId === auth.user.id) return apiError(409, "CONFLICT", "不能移除当前登录用户。")

  const database = await readDatabase()
  const user = database.users.find((candidate) => candidate.id === userId && candidate.organizationId === auth.user.organizationId)
  if (!user) return apiError(404, "NOT_FOUND", "成员不存在。")

  await updateDatabase((mutable) => {
    mutable.users = mutable.users.filter((candidate) => candidate.id !== userId)
    mutable.projectMembers = mutable.projectMembers.filter((member) => member.userId !== userId)
  })

  return noContent()
}
