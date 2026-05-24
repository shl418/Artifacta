import path from "node:path"

export const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
export const authSecret = process.env.AUTH_SECRET ?? "artifacta-dev-secret-change-me"
export const sessionCookieName = "artifacta_session"
export const sessionMaxAgeSeconds = 60 * 60 * 24 * 7

export const dataDir = process.env.DATA_DIR ?? ".artifacta"
export const uploadDir = process.env.UPLOAD_DIR ?? path.join(dataDir, "uploads")
export const databasePath = path.join(dataDir, "artifacta.json")
export const dataDriver = process.env.DATA_DRIVER === "sqlite" || process.env.DATA_DRIVER === "postgres" ? process.env.DATA_DRIVER : "json"
export const sqlitePath = process.env.SQLITE_PATH ?? path.join(dataDir, "artifacta.sqlite")
export const postgresUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? ""

export const storageDriver = process.env.STORAGE_DRIVER === "s3" ? "s3" : "local"
export const s3Bucket = process.env.S3_BUCKET ?? ""
export const s3Region = process.env.S3_REGION ?? "auto"
export const s3Endpoint = process.env.S3_ENDPOINT ?? undefined
export const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID ?? undefined
export const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? undefined
export const s3ForcePathStyle = process.env.S3_FORCE_PATH_STYLE !== "false"

export const maxArtifactBytes = positiveInteger(process.env.ARTIFACTA_MAX_ARTIFACT_BYTES, 100 * 1024 * 1024)
export const maxDatasetBytes = positiveInteger(process.env.ARTIFACTA_MAX_DATASET_BYTES, 50 * 1024 * 1024)
export const maxRequestBytes = positiveInteger(process.env.ARTIFACTA_MAX_REQUEST_BYTES, 125 * 1024 * 1024)
export const defaultApiKeyExpiryDays = positiveInteger(process.env.ARTIFACTA_API_KEY_EXPIRY_DAYS, 90)
export const rateLimitWindowMs = positiveInteger(process.env.ARTIFACTA_RATE_LIMIT_WINDOW_MS, 60_000)
export const rateLimitMax = positiveInteger(process.env.ARTIFACTA_RATE_LIMIT_MAX, 120)
export const oidcIssuerUrl = process.env.OIDC_ISSUER_URL ?? ""
export const oidcClientId = process.env.OIDC_CLIENT_ID ?? ""
export const oidcClientSecret = process.env.OIDC_CLIENT_SECRET ?? ""
export const oidcRedirectUri = process.env.OIDC_REDIRECT_URI ?? `${appUrl}/api/v1/auth/oidc/callback`

export function absoluteUploadPath(relativePath: string) {
  return path.join(uploadDir, relativePath)
}

export function assertProductionSecrets() {
  if (process.env.NODE_ENV !== "production") return
  if (!authSecret || authSecret === "artifacta-dev-secret-change-me" || authSecret.length < 32) {
    throw new Error("AUTH_SECRET must be set to a strong value of at least 32 characters in production.")
  }
}

function positiveInteger(rawValue: string | undefined, fallback: number) {
  const value = Number(rawValue)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}
