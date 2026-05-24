import type { DatasetSourceType, DatasetUpdateMode } from "@/lib/types"
import { authenticateRequest, requireRequestAuth } from "@/lib/server/auth"
import { validateSyncSourceConfig } from "@/lib/server/sync/validate-config"
import { canEditProject, canViewProject } from "@/lib/server/access"
import { now, readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"
import { serializeSyncConfig } from "@/lib/server/serializers"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; datasetId: string }> }

const sources = new Set(["manual", "cos", "presto"])
const modes = new Set(["full", "incremental"])

export async function GET(request: Request, context: RouteContext) {
  const { projectId, datasetId } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const dataset = database.datasets.find((candidate) => candidate.id === datasetId && candidate.projectId === projectId)

  if (!project || !dataset) return apiError(404, "NOT_FOUND", "数据集不存在。")
  if (!canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问同步配置。")

  return ok(serializeSyncConfig(dataset))
}

export async function PUT(request: Request, context: RouteContext) {
  const { projectId, datasetId } = await context.params
  const auth = await requireRequestAuth(request, "sync:run")
  if (auth instanceof Response) return auth

  const body = await request.json().catch(() => null)
  const sourceType = String(body?.source_type ?? body?.sourceType ?? "manual")
  const updateMode = String(body?.update_mode ?? body?.updateMode ?? "full")
  const sourceConfig = (body?.source_config ?? body?.sourceConfig ?? {}) as Record<string, unknown>

  if (!sources.has(sourceType)) return apiError(400, "INVALID_REQUEST", "source_type 不合法。", { field: "source_type" })
  if (!modes.has(updateMode)) return apiError(400, "INVALID_REQUEST", "update_mode 不合法。", { field: "update_mode" })

  const validationError = validateSyncSourceConfig(sourceType as DatasetSourceType, sourceConfig)
  if (validationError) return apiError(400, "INVALID_REQUEST", validationError)

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const dataset = database.datasets.find((candidate) => candidate.id === datasetId && candidate.projectId === projectId)

  if (!project || !dataset) return apiError(404, "NOT_FOUND", "数据集不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权修改同步配置。")

  const updated = await updateDatabase((mutable) => {
    const record = mutable.datasets.find((candidate) => candidate.id === datasetId)!
    record.syncConfig = {
      enabled: Boolean(body?.enabled) && sourceType !== "manual",
      sourceType: sourceType as DatasetSourceType,
      sourceConfig,
      updateMode: updateMode as DatasetUpdateMode,
      schedule: body?.schedule ? String(body.schedule) : null,
      lastSyncAt: record.syncConfig.lastSyncAt,
      lastSyncStatus: record.syncConfig.lastSyncStatus,
      nextSyncAt: body?.next_sync_at ? String(body.next_sync_at) : undefined,
    }
    record.updatedAt = now()
    return record
  })

  return ok(serializeSyncConfig(updated))
}
