import { NextResponse } from "next/server"
import type { User } from "@/lib/types"
import { createSessionToken, sessionCookieName, sessionCookieOptions } from "@/lib/server/auth"
import { addActivity, now, updateDatabase } from "@/lib/server/db"
import { apiError } from "@/lib/server/responses"
import { serializeUser } from "@/lib/server/serializers"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = String(body?.email ?? "").trim().toLowerCase()
  const name = String(body?.name ?? "").trim()

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return apiError(400, "INVALID_REQUEST", "请输入有效邮箱。", { field: "email" })
  }

  const user = await updateDatabase<User>((database) => {
    const organization = database.organizations[0]
    let candidate = database.users.find((item) => item.email.toLowerCase() === email)

    if (!candidate) {
      const createdAt = now()
      candidate = {
        id: `user_${crypto.randomUUID()}`,
        organizationId: organization.id,
        email,
        name: name || email.split("@")[0],
        role: database.users.some((item) => item.organizationId === organization.id) ? "member" : "admin",
        status: "active",
        createdAt,
        updatedAt: createdAt,
      }
      database.users.push(candidate)
      addActivity(database, {
        organizationId: organization.id,
        type: "team",
        userId: candidate.id,
        action: "加入了团队",
        target: candidate.name,
      })
    }

    candidate.lastLoginAt = now()
    candidate.updatedAt = candidate.lastLoginAt
    return candidate
  })

  if (user.status !== "active") {
    return apiError(403, "FORBIDDEN", "该用户当前不可登录。")
  }

  const response = NextResponse.json({ user: serializeUser(user) })
  response.cookies.set(sessionCookieName, createSessionToken(user.id), sessionCookieOptions())
  return response
}
