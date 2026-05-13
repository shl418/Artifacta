import { promises as fs } from "node:fs"
import path from "node:path"
import AdmZip from "adm-zip"
import type { DashboardArtifact, Project } from "@/lib/types"
import { absoluteUploadPath } from "@/lib/server/config"

const safeNamePattern = /[^a-zA-Z0-9._-]/g

export function sanitizeFileName(fileName: string) {
  const baseName = path.basename(fileName).replace(safeNamePattern, "_").replace(/^\.+/, "")
  return baseName || "upload.bin"
}

export function fileExtension(fileName: string) {
  return path.extname(fileName).replace(/^\./, "").toLowerCase()
}

export async function saveProjectArtifact(projectId: string, file: File): Promise<DashboardArtifact> {
  const extension = fileExtension(file.name)
  const isHtml = extension === "html" || file.type === "text/html"
  const isZip = extension === "zip" || file.type === "application/zip"

  if (!isHtml && !isZip) {
    throw new Error("Dashboard artifact must be an .html file or .zip bundle")
  }

  const relativePath = isHtml
    ? `projects/${projectId}/index.html`
    : `projects/${projectId}/${sanitizeFileName(file.name)}`
  const absolutePath = absoluteUploadPath(relativePath)
  const buffer = Buffer.from(await file.arrayBuffer())

  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, buffer)

  if (isZip) {
    const extracted = await extractProjectZip(projectId, buffer)
    return {
      kind: "zip",
      originalName: file.name,
      path: relativePath,
      size: buffer.byteLength,
      contentType: file.type || "application/zip",
      entryPath: extracted.entryPath,
      assetRoot: extracted.assetRoot,
    }
  }

  return {
    kind: "html",
    originalName: file.name,
    path: relativePath,
    size: buffer.byteLength,
    contentType: file.type || "text/html",
  }
}

export async function saveDatasetArtifact(projectId: string, datasetId: string, file: File) {
  const fileName = sanitizeFileName(file.name)
  const relativePath = `projects/${projectId}/datasets/${datasetId}/${fileName}`
  const absolutePath = absoluteUploadPath(relativePath)
  const buffer = Buffer.from(await file.arrayBuffer())

  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, buffer)

  return { buffer, fileName, relativePath, size: buffer.byteLength }
}

export async function replaceDatasetArtifact(relativePath: string, file: File) {
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeDatasetBuffer(relativePath, buffer)
  return { buffer, size: buffer.byteLength }
}

export async function writeDatasetBuffer(relativePath: string, buffer: Buffer) {
  const absolutePath = absoluteUploadPath(relativePath)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, buffer)
}

export async function readDashboardHtml(project: Project) {
  if (project.htmlArtifact.kind === "html") {
    return fs.readFile(absoluteUploadPath(project.htmlArtifact.path), "utf8")
  }

  const entryPath = project.htmlArtifact.entryPath
  const assetRoot = project.htmlArtifact.assetRoot
  if (!entryPath || !assetRoot) return zipPlaceholderHtml(project)

  const html = await fs.readFile(absoluteUploadPath(path.posix.join(assetRoot, entryPath)), "utf8")
  const entryDirectory = path.posix.dirname(entryPath)
  const baseHref = `/api/v1/projects/${project.id}/html/${entryDirectory === "." ? "" : `${entryDirectory}/`}`
  return injectBaseHref(html, baseHref)
}

export async function readDashboardAsset(project: Project, assetPath: string[]) {
  if (project.htmlArtifact.kind !== "zip" || !project.htmlArtifact.assetRoot) return null

  const safePath = normalizeZipEntry(assetPath.join("/"))
  if (!safePath || safePath.endsWith(".html")) return null

  const absolutePath = absoluteUploadPath(path.posix.join(project.htmlArtifact.assetRoot, safePath))
  const buffer = await fs.readFile(absolutePath).catch(() => null)
  if (!buffer) return null

  return {
    buffer,
    contentType: contentTypeForPath(safePath),
  }
}

export async function removeProjectArtifacts(projectId: string) {
  await fs.rm(absoluteUploadPath(`projects/${projectId}`), { recursive: true, force: true })
}

export async function removeDatasetArtifacts(projectId: string, datasetId: string) {
  await fs.rm(absoluteUploadPath(`projects/${projectId}/datasets/${datasetId}`), { recursive: true, force: true })
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    }
    return entities[char] ?? char
  })
}

async function extractProjectZip(projectId: string, buffer: Buffer) {
  const zip = new AdmZip(buffer)
  const assetRoot = `projects/${projectId}/bundle`
  const absoluteRoot = absoluteUploadPath(assetRoot)
  let entryPath: string | null = null

  await fs.rm(absoluteRoot, { recursive: true, force: true })
  await fs.mkdir(absoluteRoot, { recursive: true })

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue

    const safePath = normalizeZipEntry(entry.entryName)
    if (!safePath || safePath.startsWith("__MACOSX/")) continue

    const targetPath = absoluteUploadPath(path.posix.join(assetRoot, safePath))
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, entry.getData())

    const lowerPath = safePath.toLowerCase()
    if (lowerPath === "index.html") entryPath = safePath
    if (!entryPath && lowerPath.endsWith("/index.html")) entryPath = safePath
  }

  if (!entryPath) {
    await fs.rm(absoluteRoot, { recursive: true, force: true })
    throw new Error("ZIP dashboard bundle must contain an index.html file")
  }

  return { assetRoot, entryPath }
}

function normalizeZipEntry(entryName: string) {
  const cleanPath = entryName.replace(/\\/g, "/")
  const normalized = path.posix.normalize(cleanPath)
  if (!normalized || normalized === "." || normalized.startsWith("/") || normalized.startsWith("../")) return null
  if (normalized.split("/").includes("..")) return null
  return normalized
}

function injectBaseHref(html: string, baseHref: string) {
  if (/<base\s/i.test(html)) return html

  const base = `<base href="${escapeHtml(baseHref)}">`
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${base}`)
  }

  return `${base}${html}`
}

function contentTypeForPath(filePath: string) {
  const extension = fileExtension(filePath)
  const contentTypes: Record<string, string> = {
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
  return contentTypes[extension] ?? "application/octet-stream"
}

function zipPlaceholderHtml(project: Project) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(project.name)}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #f5fbfb; color: #193333; }
      main { width: min(560px, calc(100% - 48px)); background: white; border: 1px solid #d8eeee; border-radius: 10px; padding: 28px; }
      h1 { margin: 0 0 12px; font-size: 22px; }
      p { line-height: 1.7; color: #4b6666; }
      code { background: #ecf8f8; border-radius: 4px; padding: 2px 6px; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(project.name)}</h1>
      <p>此项目上传的是 ZIP 看板包：<code>${escapeHtml(project.htmlArtifact.originalName)}</code>。</p>
      <p>当前开源 MVP 已保存该包，下一里程碑会加入 ZIP 解包与多资源托管。</p>
    </main>
  </body>
</html>`
}
