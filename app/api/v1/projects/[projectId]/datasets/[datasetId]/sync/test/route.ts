import type { DatasetSourceType } from "@/lib/types"
import { canEditProject } from "@/lib/server/access"
import { requireRequestAuth } from "@/lib/server/auth"
import { readDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"
import { probeDatasetSyncSource } from "@/lib/server/sync-runner"
import { validateSyncSourceConfig } from "@/lib/server/sync/validate-config"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; datasetId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const { projectId, datasetId } = await context.params
  const auth = await requireRequestAuth(request, "sync:run")
  if (auth instanceof Response) return auth

  const body = await request.json().catch(() => null)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const dataset = database.datasets.find((candidate) => candidate.id === datasetId && candidate.projectId === projectId)

  if (!project || !dataset) return apiError(404, "NOT_FOUND", "数据集不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权测试该数据集的同步来源。")

  const sourceType = String(body?.source_type ?? body?.sourceType ?? dataset.syncConfig.sourceType) as DatasetSourceType
  const sourceConfig = (body?.source_config ?? body?.sourceConfig ?? dataset.syncConfig.sourceConfig) as Record<string, unknown>
  const validationError = validateSyncSourceConfig(sourceType, sourceConfig)
  if (validationError) return apiError(400, "INVALID_REQUEST", validationError)

  const probeTarget = {
    ...dataset,
    syncConfig: {
      ...dataset.syncConfig,
      enabled: sourceType !== "manual",
      sourceType,
      sourceConfig,
    },
  }

  const result = await probeDatasetSyncSource(probeTarget)
  return ok(result)
}
