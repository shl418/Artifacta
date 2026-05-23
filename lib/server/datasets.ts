import type { DatasetColumn } from "@/lib/types"
import { fileExtension } from "@/lib/server/storage"
import { parse as parseCsv } from "csv-parse/sync"

export interface DatasetInspection {
  fileType: string
  rows: number | null
  columns: number | null
  schema: DatasetColumn[]
}

export function inspectDataset(fileName: string, buffer: Buffer): DatasetInspection {
  const fileType = fileExtension(fileName)

  if (fileType === "csv" || fileType === "tsv") {
    return inspectDelimitedText(buffer.toString("utf8"), fileType)
  }

  if (fileType === "json" || fileType === "jsonl") {
    return inspectJson(buffer.toString("utf8"), fileType)
  }

  return {
    fileType: fileType || "unknown",
    rows: null,
    columns: null,
    schema: [],
  }
}

function inspectDelimitedText(content: string, fileType: string): DatasetInspection {
  const delimiter = fileType === "tsv" ? "\t" : ","
  const records = parseCsv(content, {
    bom: true,
    columns: true,
    delimiter,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>

  const headers = records.length > 0 ? Object.keys(records[0]) : parseCsvHeaders(content, delimiter)
  if (headers.length === 0) return { fileType, rows: 0, columns: 0, schema: [] }

  const sampleRows = records.slice(0, 25)
  const schema = headers.map((name, index) => ({
    name: name || `column_${index + 1}`,
    type: inferType(sampleRows.map((row) => row[name])),
  }))

  return {
    fileType,
    rows: records.length,
    columns: headers.length,
    schema,
  }
}

function inspectJson(content: string, fileType: string): DatasetInspection {
  try {
    const parsed = fileType === "jsonl" ? parseJsonLines(content) : (JSON.parse(content) as unknown)
    const records: unknown[] = Array.isArray(parsed)
      ? parsed
      : isObjectRecord(parsed) && Array.isArray(parsed.data)
        ? parsed.data
        : [parsed]
    const objectRecords = records.filter(isObjectRecord)
    const keys = Array.from(new Set(objectRecords.flatMap((record) => Object.keys(record))))
    const schema = keys.map((key) => ({
      name: key,
      type: inferType(objectRecords.map((record) => record[key])),
    }))

    return {
      fileType,
      rows: records.length,
      columns: keys.length,
      schema,
    }
  } catch {
    return { fileType, rows: null, columns: null, schema: [] }
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function inferType(values: unknown[]): DatasetColumn["type"] {
  const present = values.filter((value) => value !== undefined && value !== null && String(value).trim() !== "")

  if (present.length === 0) return "unknown"
  if (present.every((value) => typeof value === "boolean" || /^(true|false)$/i.test(String(value)))) return "boolean"
  if (present.every((value) => typeof value === "number" || /^-?\d+(\.\d+)?$/.test(String(value)))) return "number"
  if (present.every((value) => !Number.isNaN(Date.parse(String(value))) && /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(String(value)))) return "date"

  return "string"
}

function parseCsvHeaders(content: string, delimiter: string) {
  const rows = parseCsv(content, {
    bom: true,
    delimiter,
    relax_column_count: true,
    skip_empty_lines: true,
    to_line: 1,
    trim: true,
  }) as string[][]
  return rows[0] ?? []
}

function parseJsonLines(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown)
}
