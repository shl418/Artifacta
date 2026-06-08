import type { User, UserRole } from "@/lib/types"
import { requireRequestAuth } from "@/lib/server/auth"
import { canManageTeam } from "@/lib/server/access"
import { addActivity, now, readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, created, ok, paginate, parsePagination } from "@/lib/server/responses"
import { serializeUser } from "@/lib/server/serializers"

export const runtime = "nodejs"

const roles = new Set(["admin", "member"])

export async function GET(request: Request) {
  const auth = await requireRequestAuth(request, "team:read")
  if (auth instanceof Response) return auth

  const database = await readDatabase()
  const url = new URL(request.url)
  const { page, perPage } = parsePagination(url)
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? ""
  const users = database.users
    .filter((user) => user.organizationId === auth.user.organizationId)
    .filter((user) => !search || user.name.toLowerCase().includes(search) || user.email.toLowerCase().includes(search))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const result = paginate(users, page, perPage)

  return ok({
    data: result.data.map((user) => ({
      ...serializeUser(user),
      projects_count: database.projects.filter((project) => project.ownerId === user.id).length,
      joined_at: user.createdAt,
    })),
    pagination: result.pagination,
  })
}

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
    const existing = database.users.find((candidate) => candidate.email.toLowerCase() === email)
    if (existing) {
      existing.role = role as UserRole
      existing.status = "active"
      existing.updatedAt = now()
      return existing
    }

    const createdAt = now()
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
