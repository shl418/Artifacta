import { authenticateRequest } from "@/lib/server/auth"
import { updateDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"
import { runDatasetSync } from "@/lib/server/sync-runner"
import { applySyncJobPatch, claimNextSyncJob, completeSyncJob, failSyncJob, serializeSyncJobClaim } from "@/lib/server/sync/jobs"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

  const job = await updateDatabase((database) => claimNextSyncJob(database, auth.user.organizationId))
  if (!job) return ok({ job: null })

  const claimed = await updateDatabase(async (database) => {
    applySyncJobPatch(database, job.id, {
      status: "running",
      startedAt: job.startedAt,
      completedAt: null,
      error: null,
    })
    let rowsSynced = 0
    let completedJob = job
    try {
      const history = await runDatasetSync(database, {
        projectId: job.projectId,
        datasetId: job.datasetId,
        userId: job.requestedBy ?? auth.user.id,
      })
      rowsSynced = history.rowsSynced
      if (history.status === "success") {
        completedJob = completeSyncJob(database, job.id) ?? completedJob
      } else {
        completedJob = failSyncJob(database, job.id, history.error ?? "同步失败。") ?? completedJob
      }
    } catch (error) {
      completedJob = failSyncJob(database, job.id, error instanceof Error ? error.message : "同步失败。") ?? completedJob
    }

    return serializeSyncJobClaim(completedJob, { rowsSynced })
  })

  return ok({ job: claimed })
}
