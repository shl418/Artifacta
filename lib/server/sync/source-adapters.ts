import { promises as fs } from "node:fs"
import type { Dataset } from "@/lib/types"
import { assertAllowedLocalPath, assertAllowedSyncUrl, assertAllowedUploadPath } from "@/lib/server/sync/source-policy"

export interface LoadedDatasetSource {
  buffer: Buffer
  rowsSynced?: number
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

function escapeCsvCell(value: unknown) {
  const text = value == null ? "" : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
