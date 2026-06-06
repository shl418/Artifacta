import { requireRequestAuth } from "@/lib/server/auth"
import { updateDatabase } from "@/lib/server/db"
import { ok } from "@/lib/server/responses"
import { runScriptSync } from "@/lib/server/sync/script-runner"
import {
  claimNextScriptSyncJob,
  completeScriptSyncJob,
  failScriptSyncJob,
  serializeScriptSyncJobClaim,
} from "@/lib/server/sync/script-jobs"
import { findProjectSyncScript } from "@/lib/server/sync/sync-scripts"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await requireRequestAuth(request, "sync:run")
  if (auth instanceof Response) return auth

  const job = await updateDatabase((database) => claimNextScriptSyncJob(database, auth.user.organizationId))
  if (!job) return ok({ job: null })

  const claimed = await updateDatabase(async (database) => {
    const script = findProjectSyncScript(database, job.projectId, job.scriptId)
    if (!script) {
      failScriptSyncJob(database, job.id, "同步脚本不存在。")
      return serializeScriptSyncJobClaim(job)
    }

    try {
      const history = await runScriptSync(database, {
        projectId: job.projectId,
        scriptId: job.scriptId,
        userId: job.requestedBy ?? auth.user.id,
        jobId: job.id,
      })
      if (history.status === "success") {
        completeScriptSyncJob(database, job.id)
      } else {
        failScriptSyncJob(database, job.id, history.error ?? "脚本同步失败。")
      }
    } catch (error) {
      failScriptSyncJob(database, job.id, error instanceof Error ? error.message : "脚本同步失败。")
    }

    const refreshed = database.scriptSyncJobs?.find((candidate) => candidate.id === job.id) ?? job
    return serializeScriptSyncJobClaim(refreshed)
  })

  return ok({ job: claimed })
}
