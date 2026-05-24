import { NextResponse } from "next/server"
import type { User } from "@/lib/types"
import { createSessionToken, sessionCookieName, sessionCookieOptions } from "@/lib/server/auth"
import { oidcClientId, oidcClientSecret, oidcIssuerUrl, oidcRedirectUri } from "@/lib/server/config"
import { addActivity, now, updateDatabase } from "@/lib/server/db"
import { apiError } from "@/lib/server/responses"

export const runtime = "nodejs"

export async function GET(request: Request) {
  if (!oidcIssuerUrl || !oidcClientId) return apiError(501, "OIDC_NOT_CONFIGURED", "OIDC is not configured.")

  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const cookie = parseStateCookie(request.headers.get("cookie"))
  if (!code || !state || !cookie || cookie.state !== state) return apiError(400, "INVALID_REQUEST", "OIDC callback state is invalid.")

  const discovery = await fetchDiscovery()
  const token = await exchangeCode(discovery.token_endpoint, code)
  const claims = decodeJwtPayload(token.id_token)
  if (claims.nonce !== cookie.nonce) return apiError(400, "INVALID_REQUEST", "OIDC nonce is invalid.")
  const email = String(claims.email ?? "").toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) return apiError(400, "INVALID_REQUEST", "OIDC provider did not return a valid email.")

  const user = await updateDatabase<User>((database) => {
    const organization = database.organizations[0]
    let candidate = database.users.find((item) => item.email.toLowerCase() === email)
    if (!candidate) {
      const createdAt = now()
      candidate = {
        id: `user_${crypto.randomUUID()}`,
        organizationId: organization.id,
        email,
        name: String(claims.name ?? email.split("@")[0]),
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
        action: "通过 OIDC 加入团队",
        target: candidate.name,
      })
    }
    candidate.lastLoginAt = now()
    candidate.updatedAt = candidate.lastLoginAt
    return candidate
  })

  const response = NextResponse.redirect(new URL(cookie.next || "/", request.url))
  response.cookies.set(sessionCookieName, createSessionToken(user.id), sessionCookieOptions())
  response.cookies.delete("artifacta_oidc_state")
  return response
}

async function fetchDiscovery() {
  const response = await fetch(new URL("/.well-known/openid-configuration", oidcIssuerUrl))
  if (!response.ok) throw new Error("Unable to load OIDC discovery document.")
  return response.json() as Promise<{ token_endpoint: string }>
}

async function exchangeCode(tokenEndpoint: string, code: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: oidcRedirectUri,
    client_id: oidcClientId,
  })
  if (oidcClientSecret) body.set("client_secret", oidcClientSecret)
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!response.ok) throw new Error("OIDC token exchange failed.")
  return response.json() as Promise<{ id_token: string; access_token?: string }>
}

function decodeJwtPayload(idToken: string) {
  const payload = idToken.split(".")[1]
  if (!payload) throw new Error("OIDC id_token is invalid.")
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>
}

function parseStateCookie(cookieHeader: string | null) {
  const raw = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("artifacta_oidc_state="))
    ?.slice("artifacta_oidc_state=".length)
  if (!raw) return null
  try {
    return JSON.parse(decodeURIComponent(raw)) as { state: string; nonce: string; next: string }
  } catch {
    return null
  }
}
