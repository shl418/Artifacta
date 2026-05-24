import { promises as fs } from "node:fs"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import type { Database, Dataset, SyncHistory } from "@/lib/types"
import { inspectDataset } from "@/lib/server/datasets"
import {
  s3AccessKeyId,
  s3Endpoint,
  s3ForcePathStyle,
  s3Region,
  s3SecretAccessKey,
} from "@/lib/server/config"
import { addActivity, now } from "@/lib/server/db"
import { assertAllowedLocalPath, assertAllowedSyncUrl, assertAllowedUploadPath } from "@/lib/server/sync/source-policy"
import { writeDatasetBuffer } from "@/lib/server/storage"
import { recordDatasetVersion } from "@/lib/server/versions"
import { emitWebhooks } from "@/lib/server/webhooks"

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
      recordDatasetVersion(database, dataset, input.userId ?? null)
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
  emitWebhooks(database, project.organizationId, status === "success" ? "sync.success" : "sync.failed", {
    project_id: input.projectId,
    dataset_id: input.datasetId,
    sync_id: history.id,
    rows_synced: rowsSynced,
    error,
  })

  return history
}

async function loadDatasetSource(dataset: Dataset): Promise<LoadedDatasetSource | null> {
  const config = dataset.syncConfig.sourceConfig
  if (dataset.syncConfig.sourceType === "presto") {
    const querySource = await loadPrestoOrTrinoSource(config)
    if (querySource) return querySource
  }

  if (dataset.syncConfig.sourceType === "cos") {
    const objectSource = await loadObjectStorageSource(config)
    if (objectSource) return objectSource
  }

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

export async function probeDatasetSyncSource(dataset: Dataset) {
  if (!dataset.syncConfig.enabled || dataset.syncConfig.sourceType === "manual") {
    return { ok: false as const, message: "同步未启用或来源为手动上传。" }
  }

  try {
    const source = await loadDatasetSource(dataset)
    if (!source) return { ok: false as const, message: "未找到可执行的同步来源配置。" }
    return {
      ok: true as const,
      message: "同步来源可用。",
      bytes: source.buffer.byteLength,
      rows_preview: source.rowsSynced ?? null,
    }
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "同步来源测试失败。",
    }
  }
}

async function loadObjectStorageSource(config: Record<string, unknown>): Promise<LoadedDatasetSource | null> {
  const bucket = firstString(config, ["bucket", "s3_bucket", "cos_bucket"])
  const key = firstString(config, ["key", "object_key", "s3_key", "cos_key"])
  if (!bucket || !key) return null

  const client = new S3Client({
    region: firstString(config, ["region"]) ?? s3Region,
    endpoint: firstString(config, ["endpoint"]) ?? s3Endpoint,
    forcePathStyle: typeof config.force_path_style === "boolean" ? config.force_path_style : s3ForcePathStyle,
    credentials:
      firstString(config, ["access_key_id", "accessKeyId"]) || s3AccessKeyId
        ? {
            accessKeyId: firstString(config, ["access_key_id", "accessKeyId"]) ?? s3AccessKeyId ?? "",
            secretAccessKey: firstString(config, ["secret_access_key", "secretAccessKey"]) ?? s3SecretAccessKey ?? "",
          }
        : undefined,
  })
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const bytes = await response.Body?.transformToByteArray()
  if (!bytes) throw new Error("Object storage source returned an empty body.")
  return { buffer: Buffer.from(bytes) }
}

async function loadPrestoOrTrinoSource(config: Record<string, unknown>): Promise<LoadedDatasetSource | null> {
  const endpoint = firstString(config, ["endpoint", "trino_endpoint", "presto_endpoint"])
  const query = firstString(config, ["query", "sql"])
  if (!endpoint || !query) return null

  const statementUrl = await assertAllowedSyncUrl(new URL("/v1/statement", endpoint).toString())
  let response = await fetch(statementUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Trino-User": firstString(config, ["user", "username"]) ?? "artifacta",
      "X-Presto-User": firstString(config, ["user", "username"]) ?? "artifacta",
      ...(firstString(config, ["catalog"]) ? { "X-Trino-Catalog": firstString(config, ["catalog"])!, "X-Presto-Catalog": firstString(config, ["catalog"])! } : {}),
      ...(firstString(config, ["schema"]) ? { "X-Trino-Schema": firstString(config, ["schema"])!, "X-Presto-Schema": firstString(config, ["schema"])! } : {}),
    },
    body: query,
  })

  const rows: unknown[] = []
  let columns: string[] = []
  for (let attempts = 0; attempts < 50; attempts += 1) {
    if (!response.ok) throw new Error(`Presto/Trino query failed with ${response.status}.`)
    const payload = (await response.json()) as {
      columns?: Array<{ name: string }>
      data?: unknown[][]
      nextUri?: string
      error?: { message?: string }
    }
    if (payload.error?.message) throw new Error(payload.error.message)
    if (payload.columns?.length) columns = payload.columns.map((column) => column.name)
    if (Array.isArray(payload.data)) {
      for (const row of payload.data) rows.push(rowArrayToRecord(columns, row))
    }
    if (!payload.nextUri) break
    const nextUri = await assertAllowedSyncUrl(payload.nextUri)
    response = await fetch(nextUri)
  }

  return { buffer: Buffer.from(rowsToCsv(rows), "utf8"), rowsSynced: rows.length }
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

function rowArrayToRecord(columns: string[], row: unknown[]) {
  if (columns.length === 0) return Object.fromEntries(row.map((value, index) => [`column_${index + 1}`, value]))
  return Object.fromEntries(columns.map((column, index) => [column, row[index]]))
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
