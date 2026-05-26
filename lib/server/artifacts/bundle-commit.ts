import { promises as fs } from "node:fs"
import path from "node:path"
import { ZodError } from "zod"
import type { ArtifactManifest } from "@/lib/server/artifacts/manifest"
import type { BundleFileEntry, Database, Project, ProjectVisibility } from "@/lib/types"
import { canEditProject } from "@/lib/server/access"
import {
  throwOnBundleHostingErrors,
  validateBundleForHosting,
  type BundleHostingIssue,
} from "@/lib/server/artifacts/bundle-validation"
import { resolveBundleEntryPath } from "@/lib/server/artifacts/entrypoint"
import { InvalidBundledManifestError, type BundledManifestIssue } from "@/lib/server/artifacts/errors"
import {
  datasetIdFromBundlePath,
  generateManifest,
  manifestDatasetsToCommitInput,
} from "@/lib/server/artifacts/manifest"
import { importManifestFromBundle } from "@/lib/server/artifacts/manifest-import"
import {
  autoDiscoverDatasetsFromFileTree,
  getUploadSession,
  relativizeBundlePath,
} from "@/lib/server/artifacts/upload-session"
import { upsertProjectSyncScriptsFromManifest } from "@/lib/server/sync/sync-scripts"
import { dataDir } from "@/lib/server/config"
import { inspectDataset } from "@/lib/server/datasets"
import { now } from "@/lib/server/db"
import { readStorageObject, removeStoragePrefix, writeStorageObject } from "@/lib/server/object-storage"
import { extractProjectZip, sanitizeFileName } from "@/lib/server/storage"

function extractIssueCode(message: string): string | null {
  const KNOWN_CODES = ["DATASET_KIND_EXTENSION_MISMATCH"] as const
  for (const code of KNOWN_CODES) {
    if (message.includes(code)) return code
  }
  return null
}

function buildSyncProtectedPaths(database: Database, projectId: string) {
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

function resolveDatasetBindingsForCommit(input: {
  fileTree: BundleFileEntry[]
  bundledManifest: ArtifactManifest | null
}) {
  if (input.bundledManifest) {
    return manifestDatasetsToCommitInput(input.bundledManifest)
  }
  return autoDiscoverDatasetsFromFileTree(input.fileTree)
}

export interface CommitUploadSessionInput {
  sessionId: string
  userId: string
  organizationId: string
  name: string
  description: string
  visibility: ProjectVisibility
  folderId: string | null
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
    await removeStoragePrefix(extracted.assetRoot)
    if (error instanceof ZodError) {
      const issues: BundledManifestIssue[] = error.issues.map((issue) => ({
        code: extractIssueCode(issue.message) ?? issue.code,
        message: issue.message,
        path: issue.path as (string | number)[],
      }))
      throw new InvalidBundledManifestError(issues)
    }
    throw error
  }

  const datasetBindings = resolveDatasetBindingsForCommit({
    fileTree: session.fileTree,
    bundledManifest,
  })

  let entryPath: string
  let warnings: BundleHostingIssue[] = []
  try {
    entryPath = resolveBundleEntryPath({
      htmlFiles: extracted.htmlFiles,
      defaultIndex: extracted.defaultIndex,
      manifestEntry: bundledManifest?.entrypoint ?? null,
    })
    const hostingValidation = validateBundleForHosting({
      htmlFiles: extracted.htmlFiles,
      manifest: bundledManifest,
      entryPath,
    })
    throwOnBundleHostingErrors(hostingValidation)
    warnings = hostingValidation.warnings
  } catch (error) {
    await removeStoragePrefix(extracted.assetRoot)
    throw error
  }
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

  return { project, datasets: bundleDatasets, manifestImported: preserveBundledManifest, warnings }
}
