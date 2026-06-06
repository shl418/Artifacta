import type { ApiKey } from "@/lib/types"
import { parseRequestedScopes } from "@/lib/server/api-key-scopes"
import { createApiKeySecret, requireSessionAuth } from "@/lib/server/auth"
import { defaultApiKeyExpiryDays } from "@/lib/server/config"
import { addActivity, now, readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, created, ok } from "@/lib/server/responses"
import { rateLimitResponse } from "@/lib/server/rate-limit"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await requireSessionAuth(request)
  if (auth instanceof Response) return auth

  const database = await readDatabase()
  const keys = database.apiKeys.filter((key) => key.organizationId === auth.user.organizationId && key.userId === auth.user.id)

  return ok({ data: keys.map(serializeApiKey) })
}

export async function POST(request: Request) {
  const limited = rateLimitResponse(request, "api-keys-create", 30)
  if (limited) return limited

  const auth = await requireSessionAuth(request)
  if (auth instanceof Response) return auth

  const body = await request.json().catch(() => null)
  const name = String(body?.name ?? "").trim()
  const scopes = parseRequestedScopes(body?.scopes)
  if (scopes === null) return apiError(400, "INVALID_REQUEST", "scopes 包含未知权限。")
  const expiresAt =
    body?.expires_at === null
      ? null
      : body?.expires_at
        ? String(body.expires_at)
        : new Date(Date.now() + defaultApiKeyExpiryDays * 24 * 60 * 60 * 1000).toISOString()

  if (!name) return apiError(400, "INVALID_REQUEST", "API Key 名称不能为空。", { field: "name" })
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) return apiError(400, "INVALID_REQUEST", "expires_at 必须是 ISO 日期。")

  const secret = createApiKeySecret()
  const apiKey = await updateDatabase<ApiKey>((database) => {
    const createdAt = now()
    const record: ApiKey = {
      id: `key_${crypto.randomUUID()}`,
      organizationId: auth.user.organizationId,
      userId: auth.user.id,
      name,
      prefix: secret.prefix,
      last4: secret.last4,
      keyHash: secret.keyHash,
      scopes,
      createdAt,
      updatedAt: createdAt,
      expiresAt,
      lastUsedAt: null,
    }
    database.apiKeys.push(record)
    addActivity(database, {
      organizationId: auth.user.organizationId,
      type: "permission",
      userId: auth.user.id,
      action: "创建了 API Key",
      target: name,
    })
    return record
  })

  return created({ ...serializeApiKey(apiKey), key: secret.secret })
}

function serializeApiKey(apiKey: ApiKey) {
  return {
    id: apiKey.id,
    name: apiKey.name,
    prefix: apiKey.prefix,
    last4: apiKey.last4,
    created_at: apiKey.createdAt,
    updated_at: apiKey.updatedAt,
    expires_at: apiKey.expiresAt,
    last_used_at: apiKey.lastUsedAt,
    scopes: apiKey.scopes?.length ? apiKey.scopes : ["*"],
  }
}
