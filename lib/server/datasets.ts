import type { DatasetColumn } from "@/lib/types"
import { fileExtension } from "@/lib/server/storage"

export interface DatasetInspection {
  fileType: string
  rows: number | null
  columns: number | null
  schema: DatasetColumn[]
}

export function inspectDataset(fileName: string, buffer: Buffer): DatasetInspection {
  const fileType = fileExtension(fileName)

  if (fileType === "csv") {
    return inspectCsv(buffer.toString("utf8"), fileType)
  }

  if (fileType === "json") {
    return inspectJson(buffer.toString("utf8"), fileType)
  }

  return {
    fileType: fileType || "unknown",
    rows: null,
    columns: null,
    schema: [],
  }
}

function inspectCsv(content: string, fileType: string): DatasetInspection {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return { fileType, rows: 0, columns: 0, schema: [] }
  }

  const headers = parseCsvLine(lines[0])
  const sampleRows = lines.slice(1, 26).map(parseCsvLine)
  const schema = headers.map((name, index) => ({
    name: name || `column_${index + 1}`,
    type: inferType(sampleRows.map((row) => row[index])),
  }))

  return {
    fileType,
    rows: Math.max(lines.length - 1, 0),
    columns: headers.length,
    schema,
  }
}

function inspectJson(content: string, fileType: string): DatasetInspection {
  try {
    const parsed = JSON.parse(content) as unknown
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

function parseCsvLine(line: string) {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === "," && !inQuotes) {
      result.push(current.trim())
      current = ""
      continue
    }

    current += char
  }

  result.push(current.trim())
  return result
}

function inferType(values: unknown[]): DatasetColumn["type"] {
  const present = values.filter((value) => value !== undefined && value !== null && String(value).trim() !== "")

  if (present.length === 0) return "unknown"
  if (present.every((value) => typeof value === "boolean" || /^(true|false)$/i.test(String(value)))) return "boolean"
  if (present.every((value) => typeof value === "number" || /^-?\d+(\.\d+)?$/.test(String(value)))) return "number"
  if (present.every((value) => !Number.isNaN(Date.parse(String(value))) && /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(String(value)))) return "date"

  return "string"
}
