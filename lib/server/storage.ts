import path from "node:path"
import { createHash } from "node:crypto"
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
import { contentTypeForPath, fileExtension, isHtmlBundleEntry } from "@/lib/server/artifacts/mime"
import { normalizeZipBundleEntries, validateZipBundle, zipSecurityLimits } from "@/lib/server/artifacts/zip-security"
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

export function createArtifactRevisionId() {
  return `artrev_${crypto.randomUUID()}`
}

export function hashArtifactSource(source: string | Buffer) {
  return createHash("sha256").update(source).digest("hex")
}

export async function saveProjectArtifact(
  projectId: string,
  file: File,
  revisionId = createArtifactRevisionId(),
): Promise<DashboardArtifact> {
  const extension = fileExtension(file.name)
  const isHtml = extension === "html" || file.type === "text/html"
  const isZip = extension === "zip" || file.type === "application/zip"

  if (!isHtml && !isZip) {
    throw new Error("Dashboard artifact must be an .html file or .zip bundle")
  }
  if (file.size > maxArtifactBytes) {
    throw new Error(`Dashboard artifact exceeds the ${formatBytes(maxArtifactBytes)} upload limit.`)
  }

  const revisionRoot = `projects/${projectId}/revisions/${revisionId}`
  const relativePath = isHtml
    ? `${revisionRoot}/source.html`
    : `${revisionRoot}/${sanitizeFileName(file.name)}`
  const buffer = Buffer.from(await file.arrayBuffer())

  await writeStorageObject(relativePath, buffer, file.type || (isZip ? "application/zip" : "text/html"))

  if (isZip) {
    const extracted = await extractProjectZip(projectId, buffer, undefined, `${revisionRoot}/bundle`)
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
      revisionId,
      sourceHash: hashArtifactSource(await readStorageText(path.posix.join(extracted.assetRoot, entryPath))),
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
    revisionId,
    sourceHash: hashArtifactSource(buffer),
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

export async function readDashboardArtifactSource(artifact: DashboardArtifact) {
  if (artifact.kind === "html") {
    return readStorageText(artifact.path)
  }

  const entryPath = artifact.entryPath
  const assetRoot = artifact.assetRoot
  if (!entryPath || !assetRoot) throw new BundleIncompleteError()

  return readStorageText(artifact.entryHtmlPath ?? path.posix.join(assetRoot, entryPath))
}

export async function readDashboardArtifactHtml(projectId: string, artifact: DashboardArtifact) {
  const html = await readDashboardArtifactSource(artifact)
  if (artifact.kind === "html") return html

  const entryPath = artifact.entryPath
  if (!entryPath || !artifact.assetRoot) throw new BundleIncompleteError()
  const entryDirectory = path.posix.dirname(entryPath)
  const baseHref = `/api/v1/projects/${projectId}/html/${entryDirectory === "." ? "" : `${entryDirectory}/`}`
  return injectBaseHref(html, baseHref)
}

export async function readDashboardHtml(project: Project) {
  return readDashboardArtifactHtml(project.id, project.htmlArtifact)
}

export async function createEditedProjectArtifact(
  projectId: string,
  parent: DashboardArtifact,
  html: string,
  revisionId = createArtifactRevisionId(),
): Promise<DashboardArtifact> {
  const buffer = Buffer.from(html, "utf8")
  if (buffer.byteLength > maxArtifactBytes) {
    throw new Error(`Dashboard artifact exceeds the ${formatBytes(maxArtifactBytes)} upload limit.`)
  }

  const entryHtmlPath = `projects/${projectId}/revisions/${revisionId}/entry.html`
  await writeStorageObject(entryHtmlPath, buffer, "text/html; charset=utf-8")

  if (parent.kind === "html") {
    return {
      ...parent,
      path: entryHtmlPath,
      size: buffer.byteLength,
      contentType: "text/html",
      revisionId,
      sourceHash: hashArtifactSource(buffer),
      entryHtmlPath: undefined,
    }
  }

  return {
    ...parent,
    revisionId,
    sourceHash: hashArtifactSource(buffer),
    entryHtmlPath,
  }
}

export async function snapshotProjectArtifact(
  projectId: string,
  artifact: DashboardArtifact,
  revisionId = createArtifactRevisionId(),
): Promise<DashboardArtifact> {
  if (artifact.revisionId) return artifact

  const revisionRoot = `projects/${projectId}/revisions/${revisionId}`
  if (artifact.kind === "html") {
    const buffer = await readStorageObject(artifact.path)
    const targetPath = `${revisionRoot}/source.html`
    await writeStorageObject(targetPath, buffer, artifact.contentType)
    return {
      ...artifact,
      path: targetPath,
      revisionId,
      sourceHash: hashArtifactSource(buffer),
    }
  }

  if (!artifact.assetRoot || !artifact.entryPath) throw new BundleIncompleteError()
  const zipBuffer = await readStorageObject(artifact.path)
  const targetZipPath = `${revisionRoot}/${sanitizeFileName(artifact.originalName)}`
  const targetAssetRoot = `${revisionRoot}/bundle`
  await writeStorageObject(targetZipPath, zipBuffer, artifact.contentType)
  await copyStorageEntries(artifact.assetRoot, targetAssetRoot)
  const source = await readStorageText(path.posix.join(targetAssetRoot, artifact.entryPath))
  return {
    ...artifact,
    path: targetZipPath,
    assetRoot: targetAssetRoot,
    revisionId,
    sourceHash: hashArtifactSource(source),
  }
}

export async function copyStorageEntries(sourceRoot: string, targetRoot: string, paths?: Iterable<string>) {
  const entries = paths ? Array.from(paths) : await listStorageEntries(sourceRoot)
  for (const entry of entries) {
    const buffer = await readStorageObject(path.posix.join(sourceRoot, entry))
    await writeStorageObject(path.posix.join(targetRoot, entry), buffer, contentTypeForPath(entry))
  }
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
  assetRootOverride?: string,
): Promise<ExtractProjectZipResult> {
  const zip = new AdmZip(buffer)
  validateZipBundle(zip)

  const assetRoot = assetRootOverride ?? `projects/${projectId}/bundle`
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

  // Enforce the size caps against the ACTUAL decompressed bytes, not the
  // attacker-declared header.size that validateZipBundle pre-checks. A crafted
  // ZIP can under-declare sizes; here getData() has already inflated the real
  // content, so we reject before persisting anything oversized.
  let realTotalBytes = 0
  for (const { entry, path: safePath } of normalizeZipBundleEntries(zip)) {
    if (skipPaths?.has(safePath)) continue

    const data = entry.getData()
    if (data.length > zipSecurityLimits.maxEntryBytes) {
      throw new Error(`ZIP bundle entry exceeds ${zipSecurityLimits.maxEntryBytes} bytes: ${safePath}`)
    }
    realTotalBytes += data.length
    if (realTotalBytes > zipSecurityLimits.maxTotalBytes) {
      throw new Error(`ZIP bundle exceeds ${zipSecurityLimits.maxTotalBytes} total uncompressed bytes`)
    }

    await writeStorageObject(path.posix.join(assetRoot, safePath), data, contentTypeForPath(safePath))

    if (isHtmlBundleEntry(safePath)) htmlFiles.push(safePath)
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
