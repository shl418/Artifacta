import type { Database, SyncHistory } from "@/lib/types"
import { inspectDataset } from "@/lib/server/datasets"
import { now } from "@/lib/server/db"
import { dispatch } from "@/lib/server/dispatch"
import { loadDatasetSource } from "@/lib/server/sync/source-adapters"
import { writeDatasetBuffer } from "@/lib/server/storage"
import { recordDatasetVersion } from "@/lib/server/versions"

interface RunDatasetSyncInput {
  projectId: string
  datasetId: string
  userId?: string
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

  dispatch(database, { type: "dataset.synced", organizationId: project.organizationId, actorId: input.userId, dataset: { id: input.datasetId, name: dataset.name, projectId: input.projectId }, result: { status, syncId: history.id, rowsSynced, error } })

  return history
}

export async function probeDatasetSyncSource(dataset: Parameters<typeof loadDatasetSource>[0]) {
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

function nextDailySync(completedAt: string) {
  const next = new Date(completedAt)
  next.setDate(next.getDate() + 1)
  return next.toISOString()
}
