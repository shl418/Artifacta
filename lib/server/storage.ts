import path from "node:path"
import AdmZip from "adm-zip"
import type { DashboardArtifact, Project } from "@/lib/types"
import { maxArtifactBytes, maxDatasetBytes } from "@/lib/server/config"
import { normalizeBundleEntry, validateZipBundle } from "@/lib/server/artifacts/zip-security"
import {
  listStorageEntries,
  readStorageObject,
  readStorageText,
  removeStorageObject,
  removeStoragePrefix,
  writeStorageObject,
} from "@/lib/server/object-storage"

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
  if (file.size > maxArtifactBytes) {
    throw new Error(`Dashboard artifact exceeds the ${formatBytes(maxArtifactBytes)} upload limit.`)
  }

  const relativePath = isHtml
    ? `projects/${projectId}/index.html`
    : `projects/${projectId}/${sanitizeFileName(file.name)}`
  const buffer = Buffer.from(await file.arrayBuffer())

  await writeStorageObject(relativePath, buffer, file.type || (isZip ? "application/zip" : "text/html"))

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
  if (file.size > maxDatasetBytes) {
    throw new Error(`Dataset exceeds the ${formatBytes(maxDatasetBytes)} upload limit.`)
  }

  const fileName = sanitizeFileName(file.name)
  const relativePath = `projects/${projectId}/datasets/${datasetId}/${fileName}`
  const buffer = Buffer.from(await file.arrayBuffer())

  await writeStorageObject(relativePath, buffer, contentTypeForPath(fileName))

  return { buffer, fileName, relativePath, size: buffer.byteLength }
}

export async function replaceDatasetArtifact(relativePath: string, file: File) {
  if (file.size > maxDatasetBytes) {
    throw new Error(`Dataset exceeds the ${formatBytes(maxDatasetBytes)} upload limit.`)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeDatasetBuffer(relativePath, buffer)
  return { buffer, size: buffer.byteLength }
}

export async function writeDatasetBuffer(relativePath: string, buffer: Buffer) {
  if (buffer.byteLength > maxDatasetBytes) {
    throw new Error(`Dataset exceeds the ${formatBytes(maxDatasetBytes)} upload limit.`)
  }

  await writeStorageObject(relativePath, buffer, contentTypeForPath(relativePath))
}

export async function readDashboardHtml(project: Project) {
  if (project.htmlArtifact.kind === "html") {
    return readStorageText(project.htmlArtifact.path)
  }

  const entryPath = project.htmlArtifact.entryPath
  const assetRoot = project.htmlArtifact.assetRoot
  if (!entryPath || !assetRoot) return zipPlaceholderHtml(project)

  const html = await readStorageText(path.posix.join(assetRoot, entryPath))
  const entryDirectory = path.posix.dirname(entryPath)
  const baseHref = `/api/v1/projects/${project.id}/html/${entryDirectory === "." ? "" : `${entryDirectory}/`}`
  return injectBaseHref(html, baseHref)
}

export async function readDashboardAsset(project: Project, assetPath: string[]) {
  if (project.htmlArtifact.kind !== "zip" || !project.htmlArtifact.assetRoot) return null

  const safePath = normalizeBundleEntry(assetPath.join("/"))
  if (!safePath || safePath.toLowerCase().endsWith(".html")) return null

  const buffer = await readStorageObject(path.posix.join(project.htmlArtifact.assetRoot, safePath)).catch(() => null)
  if (!buffer) return null

  return {
    buffer,
    contentType: contentTypeForPath(safePath),
  }
}

export async function removeProjectArtifacts(projectId: string) {
  await removeStoragePrefix(`projects/${projectId}`)
}

export async function removeDatasetArtifacts(projectId: string, datasetId: string) {
  await removeStoragePrefix(`projects/${projectId}/datasets/${datasetId}`)
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

export async function extractProjectZip(projectId: string, buffer: Buffer, skipPaths?: Set<string>) {
  const zip = new AdmZip(buffer)
  validateZipBundle(zip)

  const assetRoot = `projects/${projectId}/bundle`
  let entryPath: string | null = null

  if (skipPaths && skipPaths.size > 0) {
    const existingFiles = await listStorageEntries(assetRoot)
    for (const existingFile of existingFiles) {
      if (!skipPaths.has(existingFile)) {
        await removeStorageObject(path.posix.join(assetRoot, existingFile))
      }
    }
  } else {
    await removeStoragePrefix(assetRoot)
  }

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue

    const safePath = normalizeBundleEntry(entry.entryName)
    if (!safePath) continue
    if (skipPaths?.has(safePath)) continue

    await writeStorageObject(path.posix.join(assetRoot, safePath), entry.getData(), contentTypeForPath(safePath))

    const lowerPath = safePath.toLowerCase()
    if (lowerPath === "index.html") entryPath = safePath
    if (!entryPath && lowerPath.endsWith("/index.html")) entryPath = safePath
  }

  if (!entryPath) {
    await removeStoragePrefix(assetRoot)
    throw new Error("ZIP dashboard bundle must contain an index.html file")
  }

  return { assetRoot, entryPath }
}

function formatBytes(bytes: number) {
  return `${Math.round(bytes / 1024 / 1024)} MB`
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
