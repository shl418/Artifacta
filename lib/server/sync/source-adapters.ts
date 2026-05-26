import { promises as fs } from "node:fs"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import type { Dataset } from "@/lib/types"
import {
  s3AccessKeyId,
  s3Endpoint,
  s3ForcePathStyle,
  s3Region,
  s3SecretAccessKey,
} from "@/lib/server/config"
import { assertAllowedLocalPath, assertAllowedSyncUrl, assertAllowedUploadPath } from "@/lib/server/sync/source-policy"

export interface LoadedDatasetSource {
  buffer: Buffer
  rowsSynced?: number
}

export async function loadFromPresto(config: Record<string, unknown>): Promise<LoadedDatasetSource | null> {
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

export async function loadFromObjectStorage(config: Record<string, unknown>): Promise<LoadedDatasetSource | null> {
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

export async function loadFromLocalPath(config: Record<string, unknown>): Promise<LoadedDatasetSource | null> {
  const localPath = firstString(config, ["local_path", "localPath", "path", "file_path"])
  if (!localPath) return null
  return { buffer: await fs.readFile(assertAllowedLocalPath(localPath)) }
}

export async function loadFromUploadPath(config: Record<string, unknown>): Promise<LoadedDatasetSource | null> {
  const relativeUploadPath = firstString(config, ["upload_path", "uploadPath"])
  if (!relativeUploadPath) return null
  return { buffer: await fs.readFile(assertAllowedUploadPath(relativeUploadPath)) }
}

export async function loadFromUrl(config: Record<string, unknown>): Promise<LoadedDatasetSource | null> {
  const url = firstString(config, ["url"])
  if (!url) return null
  const allowedUrl = await assertAllowedSyncUrl(url)
  const response = await fetch(allowedUrl)
  if (!response.ok) throw new Error(`拉取远程数据失败：${response.status}`)
  return { buffer: Buffer.from(await response.arrayBuffer()) }
}

export function loadFromMockRows(config: Record<string, unknown>): LoadedDatasetSource | null {
  const rows = config.mock_rows ?? config.sample_rows
  if (!Array.isArray(rows)) return null
  return { buffer: Buffer.from(rowsToCsv(rows), "utf8"), rowsSynced: rows.length }
}

export async function loadDatasetSource(dataset: Dataset): Promise<LoadedDatasetSource | null> {
  const config = dataset.syncConfig.sourceConfig

  if (dataset.syncConfig.sourceType === "presto") {
    const result = await loadFromPresto(config)
    if (result) return result
  }

  if (dataset.syncConfig.sourceType === "cos") {
    const result = await loadFromObjectStorage(config)
    if (result) return result
  }

  return (
    (await loadFromLocalPath(config)) ??
    (await loadFromUploadPath(config)) ??
    (await loadFromUrl(config)) ??
    loadFromMockRows(config)
  )
}

function firstString(config: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = config[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

export function rowsToCsv(rows: unknown[]) {
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
