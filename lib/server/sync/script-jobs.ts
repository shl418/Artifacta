import type { Database, ScriptSyncJob } from "@/lib/types"
import { claimNext, completeJob, failJob } from "@/lib/server/sync/job-lifecycle"

interface EnqueueScriptSyncJobInput {
  projectId: string
  scriptId: string
  organizationId: string
  trigger: ScriptSyncJob["trigger"]
  requestedBy: string | null
}

export function enqueueScriptSyncJob(database: Database, input: EnqueueScriptSyncJobInput) {
  database.scriptSyncJobs ??= []

  const existing = database.scriptSyncJobs.find(
    (job) =>
      job.projectId === input.projectId && (job.status === "queued" || job.status === "running")
  )
  if (existing) return existing

  const duplicateScript = database.scriptSyncJobs.find(
    (job) =>
      job.scriptId === input.scriptId && job.projectId === input.projectId && (job.status === "queued" || job.status === "running")
  )
  if (duplicateScript) return duplicateScript

  const createdAt = new Date().toISOString()
  const job: ScriptSyncJob = {
    id: `sjob_${crypto.randomUUID()}`,
    projectId: input.projectId,
    scriptId: input.scriptId,
    organizationId: input.organizationId,
    status: "queued",
    trigger: input.trigger,
    requestedBy: input.requestedBy,
    error: null,
    createdAt,
    startedAt: null,
    completedAt: null,
  }

  database.scriptSyncJobs.push(job)
  return job
}

export function claimNextScriptSyncJob(database: Database, organizationId?: string) {
  database.scriptSyncJobs ??= []
  return claimNext(database.scriptSyncJobs, organizationId)
}

export function completeScriptSyncJob(database: Database, jobId: string) {
  return completeJob(database.scriptSyncJobs ?? [], jobId)
}

export function failScriptSyncJob(database: Database, jobId: string, error: string) {
  return failJob(database.scriptSyncJobs ?? [], jobId, error)
}

export function serializeScriptSyncJobClaim(job: ScriptSyncJob) {
  return {
    job_id: job.id,
    project_id: job.projectId,
    script_id: job.scriptId,
    status: job.status,
    error: job.error,
  }
}
