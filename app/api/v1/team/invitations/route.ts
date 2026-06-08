import type { User, UserRole } from "@/lib/types"
import { requireRequestAuth } from "@/lib/server/auth"
import { canManageTeam } from "@/lib/server/access"
import { addActivity, now, updateDatabase } from "@/lib/server/db"
import { apiError, created } from "@/lib/server/responses"
import { serializeUser } from "@/lib/server/serializers"

export const runtime = "nodejs"

const roles = new Set(["admin", "member"])

export async function POST(request: Request) {
  const auth = await requireRequestAuth(request, "team:write")
  if (auth instanceof Response) return auth
  if (!canManageTeam(auth.user)) return apiError(403, "FORBIDDEN", "只有管理员可以邀请成员。")

  const body = await request.json().catch(() => null)
  const email = String(body?.email ?? "").trim().toLowerCase()
  const role = String(body?.role ?? "member")

  if (!/^\S+@\S+\.\S+$/.test(email)) return apiError(400, "INVALID_REQUEST", "请输入有效邮箱。", { field: "email" })
  if (!roles.has(role)) return apiError(400, "INVALID_REQUEST", "role 必须是 admin 或 member。", { field: "role" })

  const user = await updateDatabase<User>((database) => {
    const createdAt = now()
    const existing = database.users.find((candidate) => candidate.email.toLowerCase() === email)
    if (existing) {
      existing.role = role as UserRole
      existing.status = "active"
      existing.updatedAt = createdAt
      return existing
    }

    const record: User = {
      id: `user_${crypto.randomUUID()}`,
      organizationId: auth.user.organizationId,
      email,
      name: email.split("@")[0],
      role: role as UserRole,
      status: "active",
      createdAt,
      updatedAt: createdAt,
    }
    database.users.push(record)
    addActivity(database, {
      organizationId: auth.user.organizationId,
      type: "team",
      userId: auth.user.id,
      action: "邀请了新成员",
      target: record.email,
    })
    return record
  })

  return created(serializeUser(user))
}
