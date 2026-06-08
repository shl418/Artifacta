import { parse as parseCsv } from "csv-parse/sync"
import { authenticateRequest } from "@/lib/server/auth"
import { canViewProject } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { readStorageObject } from "@/lib/server/object-storage"
import { apiError, ok } from "@/lib/server/responses"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; datasetId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { projectId, datasetId } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const dataset = database.datasets.find((candidate) => candidate.id === datasetId && candidate.projectId === projectId)

  if (!project || !dataset) return apiError(404, "NOT_FOUND", "数据集不存在。")
  if (!canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问该数据集。")

  if (!["csv", "tsv", "json", "jsonl"].includes(dataset.fileType)) {
    return ok({
      parsed: false,
      message: "该文件已存储，但当前版本只结构化预览 CSV、TSV、JSON 和 JSONL。",
      schema: dataset.schema,
      rows: [],
    })
  }

  const buffer = await readStorageObject(dataset.filePath).catch(() => null)
  if (!buffer) return apiError(404, "NOT_FOUND", "数据集文件不存在。")

  let rows: Array<Record<string, unknown>>
  try {
    rows = previewRows(dataset.fileType, buffer.toString("utf8"))
  } catch {
    // A corrupt or hand-edited file must not surface as an unhandled 500.
    return apiError(422, "UNPROCESSABLE_DATASET", "数据集文件无法解析，可能已损坏或格式不正确。", { field: "file" })
  }
  return ok({
    parsed: true,
    schema: dataset.schema,
    rows,
    sample_size: rows.length,
  })
}

function previewRows(fileType: string, content: string) {
  if (fileType === "json" || fileType === "jsonl") {
    const parsed = fileType === "jsonl" ? parseJsonLines(content) : JSON.parse(content)
    const records = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray(parsed.data) ? parsed.data : [parsed]
    return records.slice(0, 25)
  }

  return parseCsv(content, {
    bom: true,
    columns: true,
    delimiter: fileType === "tsv" ? "\t" : ",",
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
    to: 25,
  }) as Array<Record<string, string>>
}

function parseJsonLines(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}
