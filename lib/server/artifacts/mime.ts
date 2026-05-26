import path from "node:path"

export const BLOCKED_HOSTED_EXTENSIONS: ReadonlySet<string> = new Set([".html", ".htm"])

const CONTENT_TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
}

export function fileExtension(filePath: string) {
  return path.extname(filePath).replace(/^\./, "").toLowerCase()
}

export function contentTypeForPath(filePath: string) {
  return CONTENT_TYPES[fileExtension(filePath)] ?? "application/octet-stream"
}

export function isBlockedHostedExtension(filePath: string) {
  return BLOCKED_HOSTED_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}
