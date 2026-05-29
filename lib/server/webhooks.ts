import crypto from "node:crypto"
import type { Database, WebhookEndpoint, WebhookEvent } from "@/lib/types"
import { now, updateDatabase } from "@/lib/server/db"

export function createWebhookSecret() {
  return `whsec_${crypto.randomBytes(24).toString("base64url")}`
}

export function serializeWebhookEndpoint(endpoint: WebhookEndpoint, includeSecret = false) {
  return {
    id: endpoint.id,
    url: endpoint.url,
    events: endpoint.events,
    enabled: endpoint.enabled,
    created_at: endpoint.createdAt,
    updated_at: endpoint.updatedAt,
    last_delivery_at: endpoint.lastDeliveryAt,
    last_delivery_status: endpoint.lastDeliveryStatus,
    ...(includeSecret ? { secret: endpoint.secret } : {}),
  }
}

export function emitWebhooks(database: Database, organizationId: string, event: WebhookEvent, payload: Record<string, unknown>) {
  const endpoints = database.webhookEndpoints.filter(
    (endpoint) => endpoint.organizationId === organizationId && endpoint.enabled && endpoint.events.includes(event)
  )
  for (const endpoint of endpoints) {
    void deliverWebhook(endpoint, event, payload)
  }
}

const RETRY_DELAYS_MS = [1_000, 3_000, 9_000]

async function deliverWebhook(endpoint: WebhookEndpoint, event: WebhookEvent, payload: Record<string, unknown>) {
  const body = JSON.stringify({
    event,
    payload,
    delivered_at: now(),
  })
  const signature = crypto.createHmac("sha256", endpoint.secret).update(body).digest("hex")
  const headers = {
    "Content-Type": "application/json",
    "X-Artifacta-Event": event,
    "X-Artifacta-Signature": `sha256=${signature}`,
  }

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(endpoint.url, { method: "POST", headers, body })
      if (response.ok) {
        await markDelivery(endpoint.id, "success")
        return
      }
    } catch {
      // network error — fall through to retry
    }

    if (attempt < RETRY_DELAYS_MS.length) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
    }
  }

  await markDelivery(endpoint.id, "failed")
}

async function markDelivery(endpointId: string, status: "success" | "failed") {
  await updateDatabase((database) => {
    const endpoint = database.webhookEndpoints.find((candidate) => candidate.id === endpointId)
    if (!endpoint) return
    endpoint.lastDeliveryAt = now()
    endpoint.lastDeliveryStatus = status
    endpoint.updatedAt = endpoint.lastDeliveryAt
  }).catch(() => undefined)
}
