import { NextResponse } from "next/server"
import { oidcClientId, oidcIssuerUrl, oidcRedirectUri } from "@/lib/server/config"
import { apiError } from "@/lib/server/responses"

export const runtime = "nodejs"

export async function GET(request: Request) {
  if (!oidcIssuerUrl || !oidcClientId) return apiError(501, "OIDC_NOT_CONFIGURED", "OIDC_ISSUER_URL and OIDC_CLIENT_ID must be configured.")

  const discovery = await fetchDiscovery()
  const state = crypto.randomUUID()
  const nonce = crypto.randomUUID()
  const next = new URL(request.url).searchParams.get("next") ?? "/"
  const authorize = new URL(discovery.authorization_endpoint)
  authorize.searchParams.set("client_id", oidcClientId)
  authorize.searchParams.set("redirect_uri", oidcRedirectUri)
  authorize.searchParams.set("response_type", "code")
  authorize.searchParams.set("scope", "openid email profile")
  authorize.searchParams.set("state", state)
  authorize.searchParams.set("nonce", nonce)

  const response = NextResponse.redirect(authorize)
  response.cookies.set("artifacta_oidc_state", JSON.stringify({ state, nonce, next }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  })
  return response
}

async function fetchDiscovery() {
  const url = new URL("/.well-known/openid-configuration", oidcIssuerUrl)
  const response = await fetch(url)
  if (!response.ok) throw new Error("Unable to load OIDC discovery document.")
  return response.json() as Promise<{ authorization_endpoint: string }>
}
