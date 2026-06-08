import { promises as fs } from "node:fs"
import path from "node:path"
import AdmZip from "adm-zip"
import type { BundleFileEntry, Database } from "@/lib/types"
import { normalizeZipBundleEntries, validateZipBundle } from "@/lib/server/artifacts/zip-security"
import { dataDir, maxArtifactBytes } from "@/lib/server/config"
import { now } from "@/lib/server/db"

export const DATASET_EXTENSIONS = new Set([".csv", ".tsv", ".json", ".jsonl", ".parquet", ".xlsx"])
const UPLOAD_SESSION_TTL_MS = 60 * 60 * 1000

function inferDatasetFromExtension(extension: string) {
  return DATASET_EXTENSIONS.has(extension.toLowerCase())
}

function isProtocolMetadataPath(bundlePath: string) {
  return path.posix.basename(bundlePath).toLowerCase() === "artifacta.json"
}

function inferDatasetFromPath(bundlePath: string) {
  if (isProtocolMetadataPath(bundlePath)) return false
  return inferDatasetFromExtension(path.posix.extname(bundlePath))
}

export function relativizeBundlePath(filePath: string, assetRoot: string) {
  const normalized = filePath.replace(/\\/g, "/")
  const root = assetRoot.replace(/\\/g, "/")
  if (normalized.startsWith(`${root}/`)) return normalized.slice(root.length + 1)
  return path.posix.relative(root, normalized)
}

export function detectManifestInFileTree(fileTree: BundleFileEntry[]) {
  return fileTree.some((entry) => entry.path === "artifacta.json")
}

export function buildFileTreeFromZipBuffer(buffer: Buffer): BundleFileEntry[] {
  const zip = new AdmZip(buffer)
  validateZipBundle(zip)

  const entries: BundleFileEntry[] = []
  for (const { entry, path: safePath } of normalizeZipBundleEntries(zip)) {
    const extension = path.posix.extname(safePath).toLowerCase()
    entries.push({
      path: safePath,
      size: entry.header.size,
      extension: extension.replace(/^\./, ""),
      inferredDataset: inferDatasetFromPath(safePath),
    })
  }

  return entries.sort((left, right) => left.path.localeCompare(right.path))
}

export function autoDiscoverDatasetsFromFileTree(fileTree: BundleFileEntry[]) {
  return fileTree
    .filter((entry) => inferDatasetFromPath(entry.path))
    .map((entry) => ({
      bundle_path: entry.path,
      name: path.basename(entry.path),
      refresh: "manual" as const,
    }))
}

export function annotateFileTreeWithExistingDatasets(database: Database, projectId: string, fileTree: BundleFileEntry[]) {
  const project = database.projects.find((item) => item.id === projectId)
  const assetRoot = project?.htmlArtifact.assetRoot
  if (!assetRoot) return fileTree

  return fileTree.map((entry) => {
    const dataset = database.datasets.find(
      (item) =>
        item.projectId === projectId &&
        item.origin === "bundle" &&
        relativizeBundlePath(item.filePath, assetRoot) === entry.path
    )
    if (!dataset) return entry

    return {
      ...entry,
      existingDatasetId: dataset.id,
      currentRefresh: dataset.syncConfig.enabled ? ("sync" as const) : ("manual" as const),
    }
  })
}

async function saveUploadSessionZip(sessionId: string, buffer: Buffer) {
  const tempDir = path.join(dataDir, "tmp", sessionId)
  await fs.mkdir(tempDir, { recursive: true })
  await fs.writeFile(path.join(tempDir, "bundle.zip"), buffer)
  return `tmp/${sessionId}/bundle.zip`
}

export async function createUploadSession(input: {
  file: File
  userId: string
  organizationId: string
  projectId?: string | null
}) {
  const extension = path.extname(input.file.name).toLowerCase()
  if (extension !== ".zip") throw new Error("Upload session requires a .zip file.")
  if (input.file.size > maxArtifactBytes) throw new Error(`ZIP dashboard exceeds the ${Math.round(maxArtifactBytes / 1024 / 1024)} MB upload limit.`)

  const buffer = Buffer.from(await input.file.arrayBuffer())
  const fileTree = buildFileTreeFromZipBuffer(buffer)
  const sessionId = `upload_${crypto.randomUUID()}`
  const tempPath = await saveUploadSessionZip(sessionId, buffer)
  const createdAt = now()
  const expiresAt = new Date(Date.parse(createdAt) + UPLOAD_SESSION_TTL_MS).toISOString()

  const session = {
    id: sessionId,
    userId: input.userId,
    organizationId: input.organizationId,
    projectId: input.projectId ?? null,
    fileTree,
    originalName: input.file.name,
    tempPath,
    createdAt,
    expiresAt,
  }

  return { session, fileTree, manifestDetected: detectManifestInFileTree(fileTree) }
}

export function getUploadSession(database: Database, sessionId: string, userId: string) {
  cleanExpiredSessions(database)
  const session = database.uploadSessions.find((item) => item.id === sessionId)
  if (!session || session.userId !== userId) return null
  if (Date.parse(session.expiresAt) <= Date.now()) return null
  return session
}

export function cleanExpiredSessions(database: Database) {
  const nowMs = Date.now()
  const expired = database.uploadSessions.filter((session) => Date.parse(session.expiresAt) <= nowMs)
  database.uploadSessions = database.uploadSessions.filter((session) => Date.parse(session.expiresAt) > nowMs)
  for (const session of expired) {
    void fs.rm(path.join(dataDir, "tmp", session.id), { recursive: true, force: true })
  }
}
