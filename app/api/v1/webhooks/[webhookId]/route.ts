import type { WebhookEvent } from "@/lib/types"
import { requireRequestAuth } from "@/lib/server/auth"
import { canManageTeam } from "@/lib/server/access"
import { now, readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, noContent, ok } from "@/lib/server/responses"
import { serializeWebhookEndpoint } from "@/lib/server/webhooks"

export const runtime = "nodejs"

const events = new Set<WebhookEvent>(["project.created", "project.updated", "project.deleted", "permission.changed", "sync.success", "sync.failed"])

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

  if (body?.url !== undefined && !(typeof body.url === "string" && /^https?:\/\//.test(body.url))) {
    return apiError(400, "INVALID_REQUEST", "url 必须是 http(s) 地址。", { field: "url" })
  }
  let requestedEvents: WebhookEvent[] | undefined
  if (body?.events !== undefined) {
    if (!Array.isArray(body.events) || body.events.map(String).some((event: string) => !events.has(event as WebhookEvent))) {
      return apiError(400, "INVALID_REQUEST", "events 包含不支持的事件。", { field: "events" })
    }
    requestedEvents = body.events.map(String) as WebhookEvent[]
  }

  const updated = await updateDatabase((mutable) => {
    const record = mutable.webhookEndpoints.find((item) => item.id === webhookId)!
    if (typeof body?.enabled === "boolean") record.enabled = body.enabled
    if (typeof body?.url === "string") record.url = body.url
    if (requestedEvents) record.events = requestedEvents
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
