import { promises as fs } from "node:fs"
import type { Database, Dataset, SyncHistory } from "@/lib/types"
import { inspectDataset } from "@/lib/server/datasets"
import { addActivity, now } from "@/lib/server/db"
import { assertAllowedLocalPath, assertAllowedSyncUrl, assertAllowedUploadPath } from "@/lib/server/sync/source-policy"
import { writeDatasetBuffer } from "@/lib/server/storage"

interface RunDatasetSyncInput {
  projectId: string
  datasetId: string
  userId?: string
}

interface LoadedDatasetSource {
  buffer: Buffer
  rowsSynced?: number
}

export async function runDatasetSync(database: Database, input: RunDatasetSyncInput): Promise<SyncHistory> {
  const project = database.projects.find((candidate) => candidate.id === input.projectId)
  const dataset = database.datasets.find((candidate) => candidate.id === input.datasetId && candidate.projectId === input.projectId)
  const startedAt = now()

  if (!project || !dataset) {
    throw new Error("DATASET_NOT_FOUND")
  }

  let rowsSynced = dataset.rows ?? 0
  let status: SyncHistory["status"] = "success"
  let error: string | null = null

  try {
    const source = await loadDatasetSource(dataset)
    if (source) {
      await writeDatasetBuffer(dataset.filePath, source.buffer)
      const inspection = inspectDataset(dataset.fileName, source.buffer)
      dataset.size = source.buffer.byteLength
      dataset.fileType = inspection.fileType
      dataset.rows = inspection.rows
      dataset.columns = inspection.columns
      dataset.schema = inspection.schema
      dataset.version += 1
      rowsSynced = source.rowsSynced ?? inspection.rows ?? rowsSynced
    }
  } catch (caughtError) {
    status = "failed"
    error = caughtError instanceof Error ? caughtError.message : "同步失败。"
  }

  const completedAt = now()
  const history: SyncHistory = {
    id: `sync_${crypto.randomUUID()}`,
    projectId: input.projectId,
    datasetId: input.datasetId,
    status,
    startedAt,
    completedAt,
    rowsSynced,
    updateMode: dataset.syncConfig.updateMode,
    error,
  }

  database.syncHistory.unshift(history)
  database.syncHistory = database.syncHistory.slice(0, 500)
  dataset.syncConfig.lastSyncAt = completedAt
  dataset.syncConfig.lastSyncStatus = status
  dataset.syncConfig.nextSyncAt = nextDailySync(completedAt)
  dataset.updatedAt = completedAt

  if (input.userId) {
    addActivity(database, {
      organizationId: project.organizationId,
      type: "dataset",
      userId: input.userId,
      action: status === "success" ? "完成了数据同步" : "数据同步失败",
      target: dataset.name,
    })
  }

  return history
}

async function loadDatasetSource(dataset: Dataset): Promise<LoadedDatasetSource | null> {
  const config = dataset.syncConfig.sourceConfig
  const localPath = firstString(config, ["local_path", "localPath", "path", "file_path"])
  if (localPath) {
    return { buffer: await fs.readFile(assertAllowedLocalPath(localPath)) }
  }

  const relativeUploadPath = firstString(config, ["upload_path", "uploadPath"])
  if (relativeUploadPath) {
    return { buffer: await fs.readFile(assertAllowedUploadPath(relativeUploadPath)) }
  }

  const url = firstString(config, ["url", "endpoint"])
  if (url) {
    const allowedUrl = await assertAllowedSyncUrl(url)
    const response = await fetch(allowedUrl)
    if (!response.ok) throw new Error(`拉取远程数据失败：${response.status}`)
    return { buffer: Buffer.from(await response.arrayBuffer()) }
  }

  const rows = config.mock_rows ?? config.sample_rows
  if (Array.isArray(rows)) {
    return { buffer: Buffer.from(rowsToCsv(rows), "utf8"), rowsSynced: rows.length }
  }

  return null
}

function firstString(config: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = config[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function rowsToCsv(rows: unknown[]) {
  const objects = rows.filter(isRecord)
  if (objects.length === 0) return ""

  const headers = Array.from(new Set(objects.flatMap((row) => Object.keys(row))))
  const lines = [headers.join(",")]
  for (const row of objects) {
    lines.push(headers.map((header) => escapeCsvCell(row[header])).join(","))
  }
  return `${lines.join("\n")}\n`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function escapeCsvCell(value: unknown) {
  const text = value == null ? "" : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function nextDailySync(completedAt: string) {
  const next = new Date(completedAt)
  next.setDate(next.getDate() + 1)
  return next.toISOString()
}
