import crypto from "node:crypto"
import type { User } from "@/lib/types"
import { assertProductionSecrets, authSecret, sessionCookieName, sessionMaxAgeSeconds } from "@/lib/server/config"
import { readDatabase, updateDatabase, now } from "@/lib/server/db"

interface SessionPayload {
  userId: string
  exp: number
}

export interface AuthContext {
  user: User
  authType: "session" | "api-key"
  apiKeyId?: string
}

export function createSessionToken(userId: string) {
  assertProductionSecrets()
  const payload: SessionPayload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = sign(encoded)
  return `${encoded}.${signature}`
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  assertProductionSecrets()
  if (!token) return null

  const [encoded, signature] = token.split(".")
  if (!encoded || !signature || sign(encoded) !== signature) return null

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload
    if (!payload.userId || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export async function authenticateRequest(request: Request): Promise<AuthContext | null> {
  const authorization = request.headers.get("authorization")

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const rawKey = authorization.slice("bearer ".length).trim()
    const database = await readDatabase()
    const keyHash = hashApiKey(rawKey)
    const apiKey = database.apiKeys.find((candidate) => candidate.keyHash === keyHash)
    const expired = apiKey?.expiresAt ? new Date(apiKey.expiresAt).getTime() < Date.now() : false
    const user = apiKey ? database.users.find((candidate) => candidate.id === apiKey.userId) : null

    if (!apiKey || expired || !user || user.status !== "active") return null

    await updateDatabase((mutable) => {
      const mutableKey = mutable.apiKeys.find((candidate) => candidate.id === apiKey.id)
      if (mutableKey) {
        mutableKey.lastUsedAt = now()
        mutableKey.updatedAt = mutableKey.lastUsedAt
      }
    })

    return { user, authType: "api-key", apiKeyId: apiKey.id }
  }

  const payload = verifySessionToken(getCookie(request.headers.get("cookie"), sessionCookieName))
  if (!payload) return null

  const database = await readDatabase()
  const user = database.users.find((candidate) => candidate.id === payload.userId && candidate.status === "active")

  return user ? { user, authType: "session" } : null
}

export function getCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return undefined

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds,
  }
}

export function hashApiKey(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

export function createApiKeySecret() {
  const secret = `art_live_${crypto.randomBytes(24).toString("base64url")}`
  return {
    secret,
    prefix: secret.slice(0, 12),
    last4: secret.slice(-4),
    keyHash: hashApiKey(secret),
  }
}

function sign(value: string) {
  return crypto.createHmac("sha256", authSecret).update(value).digest("base64url")
}

export { sessionCookieName }
