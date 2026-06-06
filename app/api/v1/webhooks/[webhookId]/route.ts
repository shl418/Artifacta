import { requireRequestAuth } from "@/lib/server/auth"
import { canManageTeam } from "@/lib/server/access"
import { now, readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, noContent, ok } from "@/lib/server/responses"
import { serializeWebhookEndpoint } from "@/lib/server/webhooks"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ webhookId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const { webhookId } = await context.params
  const auth = await requireRequestAuth(request, "team:write")
  if (auth instanceof Response) return auth
  if (!canManageTeam(auth.user)) return apiError(403, "FORBIDDEN", "只有管理员可以管理 Webhook。")

  const body = await request.json().catch(() => null)
  const database = await readDatabase()
  const endpoint = database.webhookEndpoints.find((item) => item.id === webhookId && item.organizationId === auth.user.organizationId)
  if (!endpoint) return apiError(404, "NOT_FOUND", "Webhook 不存在。")

  const updated = await updateDatabase((mutable) => {
    const record = mutable.webhookEndpoints.find((item) => item.id === webhookId)!
    if (typeof body?.enabled === "boolean") record.enabled = body.enabled
    if (typeof body?.url === "string" && /^https?:\/\//.test(body.url)) record.url = body.url
    record.updatedAt = now()
    return record
  })

  return ok(serializeWebhookEndpoint(updated))
}

export async function DELETE(request: Request, context: RouteContext) {
  const { webhookId } = await context.params
  const auth = await requireRequestAuth(request, "team:write")
  if (auth instanceof Response) return auth
  if (!canManageTeam(auth.user)) return apiError(403, "FORBIDDEN", "只有管理员可以管理 Webhook。")

  const database = await readDatabase()
  const endpoint = database.webhookEndpoints.find((item) => item.id === webhookId && item.organizationId === auth.user.organizationId)
  if (!endpoint) return apiError(404, "NOT_FOUND", "Webhook 不存在。")

  await updateDatabase((mutable) => {
    mutable.webhookEndpoints = mutable.webhookEndpoints.filter((item) => item.id !== webhookId)
  })

  return noContent()
}
