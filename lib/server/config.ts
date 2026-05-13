import path from "node:path"

export const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
export const authSecret = process.env.AUTH_SECRET ?? "artifacta-dev-secret-change-me"
export const sessionCookieName = "artifacta_session"
export const sessionMaxAgeSeconds = 60 * 60 * 24 * 7

export const dataDir = process.env.DATA_DIR ?? ".artifacta"
export const uploadDir = process.env.UPLOAD_DIR ?? path.join(dataDir, "uploads")
export const databasePath = path.join(dataDir, "artifacta.json")
export const dataDriver = process.env.DATA_DRIVER === "sqlite" ? "sqlite" : "json"
export const sqlitePath = process.env.SQLITE_PATH ?? path.join(dataDir, "artifacta.sqlite")

export function absoluteUploadPath(relativePath: string) {
  return path.join(uploadDir, relativePath)
}
