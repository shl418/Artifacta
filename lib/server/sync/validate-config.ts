import type { DatasetSourceType } from "@/lib/types"

export function validateSyncSourceConfig(sourceType: DatasetSourceType, sourceConfig: Record<string, unknown>) {
  if (sourceType === "manual") return null
  if (hasGenericSourceHandle(sourceConfig)) return null

  if (sourceType === "cos") {
    const bucket = firstString(sourceConfig, ["bucket", "s3_bucket", "cos_bucket"])
    const key = firstString(sourceConfig, ["key", "object_key", "s3_key", "cos_key"])
    if (bucket && key) return null
    return "对象存储同步需要 bucket 和 key，或使用 upload_path、local_path、url、mock_rows。"
  }

  if (sourceType === "presto") {
    const endpoint = firstString(sourceConfig, ["endpoint", "trino_endpoint", "presto_endpoint"])
    const query = firstString(sourceConfig, ["query", "sql"])
    if (endpoint && query) return null
    return "Presto/Trino 同步需要 endpoint 和 query，或使用 mock_rows、url、local_path、upload_path。"
  }

  return "source_type 不合法。"
}

function hasGenericSourceHandle(sourceConfig: Record<string, unknown>) {
  if (firstString(sourceConfig, ["local_path", "localPath", "path", "file_path"])) return true
  if (firstString(sourceConfig, ["upload_path", "uploadPath"])) return true
  if (firstString(sourceConfig, ["url"])) return true
  if (Array.isArray(sourceConfig.mock_rows) || Array.isArray(sourceConfig.sample_rows)) return true
  return false
}

function firstString(config: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = config[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}
