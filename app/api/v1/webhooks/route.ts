import type { WebhookEndpoint, WebhookEvent } from "@/lib/types"
import { authenticateRequest } from "@/lib/server/auth"
import { canManageTeam } from "@/lib/server/access"
import { now, readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, created, ok } from "@/lib/server/responses"
import { createWebhookSecret, serializeWebhookEndpoint } from "@/lib/server/webhooks"

export const runtime = "nodejs"

const events = new Set<WebhookEvent>(["project.created", "project.updated", "project.deleted", "permission.changed", "sync.success", "sync.failed"])

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")
  if (!canManageTeam(auth.user)) return apiError(403, "FORBIDDEN", "只有管理员可以管理 Webhook。")

  const database = await readDatabase()
  return ok({
    data: database.webhookEndpoints
      .filter((endpoint) => endpoint.organizationId === auth.user.organizationId)
      .map((endpoint) => serializeWebhookEndpoint(endpoint)),
  })
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")
  if (!canManageTeam(auth.user)) return apiError(403, "FORBIDDEN", "只有管理员可以管理 Webhook。")

  const body = await request.json().catch(() => null)
  const url = String(body?.url ?? "").trim()
  const requestedEvents = Array.isArray(body?.events) ? (body.events as unknown[]).map(String) : Array.from(events)
  if (!/^https?:\/\//.test(url)) return apiError(400, "INVALID_REQUEST", "url 必须是 http(s) 地址。", { field: "url" })
  if (requestedEvents.some((event) => !events.has(event as WebhookEvent))) {
    return apiError(400, "INVALID_REQUEST", "events 包含不支持的事件。", { field: "events" })
  }

  const endpoint = await updateDatabase<WebhookEndpoint>((database) => {
    const timestamp = now()
    const record: WebhookEndpoint = {
      id: `wh_${crypto.randomUUID()}`,
      organizationId: auth.user.organizationId,
      url,
      events: requestedEvents as WebhookEvent[],
      secret: createWebhookSecret(),
      enabled: body?.enabled !== false,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastDeliveryAt: null,
      lastDeliveryStatus: null,
    }
    database.webhookEndpoints.push(record)
    return record
  })

  return created(serializeWebhookEndpoint(endpoint, true))
}
