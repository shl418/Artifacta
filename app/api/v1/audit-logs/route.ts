import { requireRequestAuth } from "@/lib/server/auth"
import { canManageTeam } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { apiError, ok, paginate, parsePagination } from "@/lib/server/responses"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await requireRequestAuth(request, "admin:read")
  if (auth instanceof Response) return auth
  if (!canManageTeam(auth.user)) return apiError(403, "FORBIDDEN", "只有管理员可以查看审计日志。")

  const database = await readDatabase()
  const url = new URL(request.url)
  const { page, perPage } = parsePagination(url)
  const result = paginate(
    database.auditLogs.filter((log) => log.organizationId === auth.user.organizationId),
    page,
    perPage
  )

  return ok({
    data: result.data.map((log) => ({
      id: log.id,
      actor_user_id: log.actorUserId,
      action: log.action,
      target_type: log.targetType,
      target_id: log.targetId,
      summary: log.summary,
      metadata: log.metadata,
      created_at: log.createdAt,
    })),
    pagination: result.pagination,
  })
}
