import crypto from "node:crypto"
import { assertProductionSecrets, authSecret, appUrl } from "@/lib/server/config"
import { getCookie } from "@/lib/server/cookies"

const embedCookieName = "artifacta_embed_token"

export function createEmbedToken(projectId: string, expiresInSeconds = 60 * 60) {
  assertProductionSecrets()
  const payload = {
    projectId,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${encoded}.${sign(encoded)}`
}

export function verifyEmbedToken(token: string | undefined, projectId: string) {
  assertProductionSecrets()
  if (!token) return false
  const [encoded, signature] = token.split(".")
  if (!encoded || !signature || !timingSafeEqualStr(sign(encoded), signature)) return false
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { projectId?: string; exp?: number }
    return payload.projectId === projectId && typeof payload.exp === "number" && payload.exp >= Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

export function embedTokenFromRequest(request: Request) {
  const url = new URL(request.url)
  return url.searchParams.get("embed_token") ?? getCookie(request.headers.get("cookie"), embedCookieName)
}

export function embedCookie(token: string) {
  return `${embedCookieName}=${encodeURIComponent(token)}; Path=/api/v1/projects; SameSite=Lax; Max-Age=3600`
}

export function embedUrl(projectId: string, token: string) {
  const url = new URL(`/embed/${projectId}`, appUrl)
  url.searchParams.set("token", token)
  return url.toString()
}

function sign(value: string) {
  // Domain-separate embed tokens from session tokens so the two HMAC namespaces
  // can never be cross-used even though they share AUTH_SECRET.
  return crypto.createHmac("sha256", authSecret).update(`embed:${value}`).digest("base64url")
}

function timingSafeEqualStr(a: string, b: string) {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  if (bufferA.length !== bufferB.length) return false
  return crypto.timingSafeEqual(bufferA, bufferB)
}

