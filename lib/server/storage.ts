import path from "node:path"
import AdmZip from "adm-zip"
import type { DashboardArtifact, Project } from "@/lib/types"
import { maxArtifactBytes, maxDatasetBytes } from "@/lib/server/config"
import {
  classifyDashboardAssetRequest,
  type AssetBlockedReason,
  type DashboardAssetClassification,
} from "@/lib/server/artifacts/asset-routing"
import { BundleIncompleteError } from "@/lib/server/artifacts/errors"
import { pickDefaultIndex, resolveBundleEntryPath } from "@/lib/server/artifacts/entrypoint"
import { contentTypeForPath, fileExtension } from "@/lib/server/artifacts/mime"
import { normalizeZipBundleEntries, validateZipBundle } from "@/lib/server/artifacts/zip-security"
import {
  listStorageEntries,
  readStorageObject,
  readStorageText,
  removeStorageObject,
  removeStoragePrefix,
  writeStorageObject,
} from "@/lib/server/object-storage"

export { contentTypeForPath, fileExtension }
export { BundleIncompleteError }

const safeNamePattern = /[^a-zA-Z0-9._-]/g

export function sanitizeFileName(fileName: string) {
  const baseName = path.basename(fileName).replace(safeNamePattern, "_").replace(/^\.+/, "")
  return baseName || "upload.bin"
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
    let entryPath: string
    try {
      entryPath = resolveBundleEntryPath({
        htmlFiles: extracted.htmlFiles,
        defaultIndex: extracted.defaultIndex,
        manifestEntry: null,
      })
    } catch (error) {
      await removeStoragePrefix(extracted.assetRoot)
      throw error
    }
    return {
      kind: "zip",
      originalName: file.name,
      path: relativePath,
      size: buffer.byteLength,
      contentType: file.type || "application/zip",
      entryPath,
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
  if (!entryPath || !assetRoot) throw new BundleIncompleteError()

  const html = await readStorageText(path.posix.join(assetRoot, entryPath))
  const entryDirectory = path.posix.dirname(entryPath)
  const baseHref = `/api/v1/projects/${project.id}/html/${entryDirectory === "." ? "" : `${entryDirectory}/`}`
  return injectBaseHref(html, baseHref)
}

export type DashboardAssetResult =
  | { kind: "ok"; buffer: Buffer; contentType: string }
  | { kind: "blocked"; reason: AssetBlockedReason }
  | { kind: "missing" }

export { classifyDashboardAssetRequest }
export type { AssetBlockedReason, DashboardAssetClassification }

export async function readDashboardAsset(project: Project, assetPath: string[]): Promise<DashboardAssetResult> {
  const classification = classifyDashboardAssetRequest(project, assetPath)
  if (classification.kind !== "ready") return classification

  const buffer = await readStorageObject(path.posix.join(classification.assetRoot, classification.safePath)).catch(() => null)
  if (!buffer) return { kind: "missing" }

  return {
    kind: "ok",
    buffer,
    contentType: contentTypeForPath(classification.safePath),
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

export interface ExtractProjectZipResult {
  assetRoot: string
  htmlFiles: string[]
  defaultIndex: string | null
}

export async function extractProjectZip(
  projectId: string,
  buffer: Buffer,
  skipPaths?: Set<string>,
): Promise<ExtractProjectZipResult> {
  const zip = new AdmZip(buffer)
  validateZipBundle(zip)

  const assetRoot = `projects/${projectId}/bundle`
  const htmlFiles: string[] = []

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

  for (const { entry, path: safePath } of normalizeZipBundleEntries(zip)) {
    if (skipPaths?.has(safePath)) continue

    await writeStorageObject(path.posix.join(assetRoot, safePath), entry.getData(), contentTypeForPath(safePath))

    if (safePath.toLowerCase().endsWith(".html")) htmlFiles.push(safePath)
  }

  return { assetRoot, htmlFiles, defaultIndex: pickDefaultIndex(htmlFiles) }
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

/**
 * Injects a small inline script that patches window.fetch so every relative
 * or same-origin request automatically carries `?embed_token=<token>`.
 *
 * This is necessary because the HTML is served inside a sandboxed iframe
 * (no allow-same-origin), giving the document a null/opaque origin.  Default
 * fetch behaviour does NOT send credentials for cross-origin requests, so the
 * asset route would see an unauthenticated request and return 403.  The embed
 * token in the query string lets the asset route authenticate without cookies.
 *
 * The patch is injected right after the <base> tag (which readDashboardHtml
 * always injects first) so it runs before any user script.
 */
export function injectEmbedFetchPatch(html: string, embedToken: string): string {
  const script = buildFetchPatchScript(embedToken)

  // Prefer injecting immediately after the <base> tag so the patch runs as
  // early as possible with the correct baseURI already set.
  if (/<base\s[^>]*>/i.test(html)) {
    return html.replace(/(<base\s[^>]*>)/i, `$1${script}`)
  }

  // Fallback: start of <head>
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${script}`)
  }

  return `${script}${html}`
}

function buildFetchPatchScript(token: string): string {
  // JSON.stringify safely quotes the token string (base64url chars only, no escaping needed).
  const t = JSON.stringify(token)
  return (
    `<script>(function(){` +
    `try{` +
    `var t=${t},` +
    `o=new URL(document.baseURI).origin,` +
    `f=window.fetch;` +
    `window.fetch=function(r,i){` +
    `try{` +
    `var u=new URL(typeof r==="string"?r:r instanceof Request?r.url:String(r),document.baseURI);` +
    `if(u.origin===o){u.searchParams.set("embed_token",t);` +
    `r=typeof r==="string"?u.href:new Request(u.href,r);}` +
    `}catch(e){}` +
    `return f.call(this,r,i);` +
    `};` +
    `}catch(e){}` +
    `})();</script>`
  )
}
