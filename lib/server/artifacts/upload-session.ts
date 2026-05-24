import { promises as fs } from "node:fs"
import path from "node:path"
import AdmZip from "adm-zip"
import { ZodError } from "zod"
import type { ArtifactManifest } from "@/lib/server/artifacts/manifest"
import type { BundleFileEntry, Database, Project, ProjectVisibility, UploadSession } from "@/lib/types"
import { canEditProject } from "@/lib/server/access"
import {
  datasetIdFromBundlePath,
  generateManifest,
  manifestDatasetsToCommitInput,
} from "@/lib/server/artifacts/manifest"
import { importManifestFromBundle } from "@/lib/server/artifacts/manifest-import"
import { upsertProjectSyncScriptsFromManifest } from "@/lib/server/sync/sync-scripts"
import { normalizeBundleEntry, validateZipBundle } from "@/lib/server/artifacts/zip-security"
import { dataDir, maxArtifactBytes } from "@/lib/server/config"
import { inspectDataset } from "@/lib/server/datasets"
import { now } from "@/lib/server/db"
import { readStorageObject, writeStorageObject } from "@/lib/server/object-storage"
import { extractProjectZip, sanitizeFileName } from "@/lib/server/storage"

export const DATASET_EXTENSIONS = new Set([".csv", ".tsv", ".json", ".jsonl", ".parquet", ".xlsx"])
const UPLOAD_SESSION_TTL_MS = 60 * 60 * 1000

function inferDatasetFromExtension(extension: string) {
  return DATASET_EXTENSIONS.has(extension.toLowerCase())
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
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue

    const safePath = normalizeBundleEntry(entry.entryName)
    if (!safePath) continue

    const extension = path.extname(safePath).toLowerCase()
    entries.push({
      path: safePath,
      size: entry.header.size,
      extension: extension.replace(/^\./, ""),
      inferredDataset: inferDatasetFromExtension(extension),
    })
  }

  return entries.sort((left, right) => left.path.localeCompare(right.path))
}

export function autoDiscoverDatasetsFromFileTree(fileTree: BundleFileEntry[]) {
  return fileTree
    .filter((entry) => inferDatasetFromExtension(path.extname(entry.path)))
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

  const session: UploadSession = {
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

export function buildSyncProtectedPaths(database: Database, projectId: string) {
  const project = database.projects.find((item) => item.id === projectId)
  const assetRoot = project?.htmlArtifact.assetRoot
  if (!assetRoot) return new Set<string>()

  const skip = new Set<string>()
  for (const dataset of database.datasets) {
    if (dataset.projectId !== projectId || dataset.origin !== "bundle") continue
    if (!dataset.syncConfig.enabled) continue
    const relative = relativizeBundlePath(dataset.filePath, assetRoot)
    if (relative && !relative.startsWith("..")) skip.add(relative)
  }

  for (const script of database.projectSyncScripts ?? []) {
    if (script.projectId !== projectId || !script.enabled) continue
    for (const outputPath of script.outputs) {
      skip.add(outputPath)
    }
  }

  return skip
}

async function buildBundleDatasetRecord(input: {
  projectId: string
  organizationId: string
  bundlePath: string
  name: string
  refresh: "manual" | "sync"
  assetRoot: string
  existingDataset?: {
    id: string
    version: number
    createdAt: string
    syncConfig: Database["datasets"][number]["syncConfig"]
  }
}) {
  const filePath = path.posix.join(input.assetRoot, input.bundlePath)
  const buffer = await readStorageObject(filePath)
  const fileName = path.posix.basename(input.bundlePath)
  const inspection = inspectDataset(fileName, buffer)
  const timestamp = now()

  return {
    id: input.existingDataset?.id ?? `ds_${crypto.randomUUID()}`,
    projectId: input.projectId,
    organizationId: input.organizationId,
    name: input.name.trim() || fileName,
    description: "",
    fileName,
    filePath,
    fileType: inspection.fileType,
    size: buffer.byteLength,
    rows: inspection.rows,
    columns: inspection.columns,
    schema: inspection.schema,
    version: input.existingDataset?.version ?? 1,
    origin: "bundle" as const,
    syncConfig: {
      enabled: input.refresh === "sync",
      sourceType: "manual" as const,
      sourceConfig: input.existingDataset?.syncConfig.sourceConfig ?? {},
      updateMode: input.existingDataset?.syncConfig.updateMode ?? "full",
      schedule: input.existingDataset?.syncConfig.schedule ?? null,
      lastSyncAt: input.existingDataset?.syncConfig.lastSyncAt,
      lastSyncStatus: input.existingDataset?.syncConfig.lastSyncStatus,
      nextSyncAt: input.existingDataset?.syncConfig.nextSyncAt,
    },
    createdAt: input.existingDataset?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
}

function resolveDatasetBindings(input: {
  fileTree: BundleFileEntry[]
  clientDatasets: Array<{ bundle_path: string; name: string; refresh: "manual" | "sync" }>
  manifestMode?: "auto" | "wizard"
  bundledManifest: ArtifactManifest | null
}) {
  if (input.bundledManifest && input.manifestMode === "auto") {
    return manifestDatasetsToCommitInput(input.bundledManifest)
  }

  if (input.bundledManifest && input.clientDatasets.length === 0) {
    return manifestDatasetsToCommitInput(input.bundledManifest)
  }

  if (input.clientDatasets.length > 0) {
    return input.clientDatasets
  }

  if (input.manifestMode === "auto" || input.bundledManifest === null) {
    return autoDiscoverDatasetsFromFileTree(input.fileTree)
  }

  return input.clientDatasets
}

export interface CommitUploadSessionInput {
  sessionId: string
  userId: string
  organizationId: string
  name: string
  description: string
  visibility: ProjectVisibility
  folderId: string | null
  datasets: Array<{ bundle_path: string; name: string; refresh: "manual" | "sync" }>
  manifestMode?: "auto" | "wizard"
}

export async function commitUploadSession(database: Database, input: CommitUploadSessionInput) {
  const session = getUploadSession(database, input.sessionId, input.userId)
  if (!session || session.organizationId !== input.organizationId) throw new Error("UPLOAD_SESSION_NOT_FOUND")

  const buffer = await fs.readFile(path.join(dataDir, session.tempPath))
  const isUpdate = Boolean(session.projectId)
  const projectId = session.projectId ?? `proj_${crypto.randomUUID()}`
  if (isUpdate) {
    const existing = database.projects.find((item) => item.id === projectId)
    const user = database.users.find((item) => item.id === input.userId)
    if (!existing || !user || !canEditProject(database, user, existing)) throw new Error("PROJECT_NOT_FOUND")
  }
  const skipPaths = isUpdate ? buildSyncProtectedPaths(database, projectId) : undefined

  const relativeZipPath = `projects/${projectId}/${sanitizeFileName(session.originalName)}`
  await writeStorageObject(relativeZipPath, buffer, "application/zip")

  const extracted = await extractProjectZip(projectId, buffer, skipPaths)
  let bundledManifest: ArtifactManifest | null = null
  try {
    bundledManifest = await importManifestFromBundle(extracted.assetRoot)
  } catch (error) {
    if (error instanceof ZodError) throw new Error("INVALID_BUNDLED_MANIFEST")
    throw error
  }

  const datasetBindings = resolveDatasetBindings({
    fileTree: session.fileTree,
    clientDatasets: input.datasets,
    manifestMode: input.manifestMode,
    bundledManifest,
  })

  const entryPath = bundledManifest?.entrypoint ?? extracted.entryPath
  const preserveBundledManifest = bundledManifest !== null

  if (!preserveBundledManifest) {
    const manifestDatasets = datasetBindings.map((item) => ({
      id: datasetIdFromBundlePath(item.bundle_path),
      name: item.name,
      bundlePath: item.bundle_path,
      refresh: item.refresh,
    }))
    const manifest = generateManifest(input.name, entryPath, manifestDatasets)
    await writeStorageObject(
      path.posix.join(extracted.assetRoot, "artifacta.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "application/json; charset=utf-8"
    )
  }

  const timestamp = now()
  const htmlArtifact = {
    kind: "zip" as const,
    originalName: session.originalName,
    path: relativeZipPath,
    size: buffer.byteLength,
    contentType: "application/zip",
    entryPath,
    assetRoot: extracted.assetRoot,
  }

  const existingBundleDatasets = isUpdate
    ? database.datasets.filter((dataset) => dataset.projectId === projectId && dataset.origin === "bundle")
    : []

  const bundleDatasets = await Promise.all(
    datasetBindings.map((item) => {
      const existing = existingBundleDatasets.find(
        (dataset) => relativizeBundlePath(dataset.filePath, extracted.assetRoot) === item.bundle_path
      )
      return buildBundleDatasetRecord({
        projectId,
        organizationId: input.organizationId,
        bundlePath: item.bundle_path,
        name: item.name,
        refresh: item.refresh,
        assetRoot: extracted.assetRoot,
        existingDataset: existing,
      })
    })
  )

  if (bundledManifest) {
    upsertProjectSyncScriptsFromManifest(database, projectId, bundledManifest)
  }

  let project: Project
  if (isUpdate) {
    const existing = database.projects.find((item) => item.id === projectId)
    if (!existing) throw new Error("PROJECT_NOT_FOUND")

    project = {
      ...existing,
      name: input.name,
      description: input.description,
      visibility: input.visibility,
      folderId: input.folderId,
      htmlArtifact,
      updatedAt: timestamp,
    }
    database.projects = database.projects.map((item) => (item.id === projectId ? project : item))
    database.datasets = database.datasets.filter((dataset) => !(dataset.projectId === projectId && dataset.origin === "bundle"))
    database.datasets.push(...bundleDatasets)
  } else {
    project = {
      id: projectId,
      organizationId: input.organizationId,
      ownerId: input.userId,
      folderId: input.folderId,
      name: input.name,
      description: input.description,
      visibility: input.visibility,
      htmlArtifact,
      viewsCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    database.projects.push(project)
    database.datasets.push(...bundleDatasets)
  }

  database.uploadSessions = database.uploadSessions.filter((item) => item.id !== session.id)
  await fs.rm(path.join(dataDir, "tmp", session.id), { recursive: true, force: true })

  return { project, datasets: bundleDatasets, manifestImported: preserveBundledManifest }
}
