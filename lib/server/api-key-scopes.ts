export const API_KEY_SCOPES = [
  "projects:read",
  "projects:write",
  "datasets:read",
  "datasets:write",
  "sync:run",
  "team:read",
  "team:write",
  "admin:read",
] as const

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number] | "*"

export function normalizeApiKeyScopes(scopes: string[] | undefined): ApiKeyScope[] {
  if (!scopes || scopes.length === 0) return ["*"]
  const normalized = scopes.map((scope) => scope.trim()).filter(Boolean)
  return normalized.length > 0 ? (normalized as ApiKeyScope[]) : ["*"]
}

interface ScopeAuthContext {
  authType: "session" | "api-key"
  apiKeyScopes?: ApiKeyScope[]
}

export function apiKeyAllowsScope(auth: ScopeAuthContext, scope: ApiKeyScope) {
  if (auth.authType !== "api-key") return true
  const scopes = auth.apiKeyScopes ?? ["*"]
  return scopes.includes("*") || scopes.includes(scope)
}

export function requireApiKeyScope(auth: ScopeAuthContext | null, scope: ApiKeyScope) {
  if (!auth) return false
  return apiKeyAllowsScope(auth, scope)
}

export function parseRequestedScopes(raw: unknown): string[] | null {
  if (raw == null) return []
  if (!Array.isArray(raw)) return null
  const scopes = raw.map((value) => String(value).trim()).filter(Boolean)
  const allowed = new Set<string>([...API_KEY_SCOPES, "*"])
  if (scopes.some((scope) => !allowed.has(scope))) return null
  return scopes
}
