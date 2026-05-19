import type { Database, SyncJob } from "@/lib/types"

interface EnqueueSyncJobInput {
  projectId: string
  datasetId: string
  organizationId: string
  trigger: SyncJob["trigger"]
  requestedBy: string | null
}

interface SyncJobClaimResult {
  rowsSynced?: number
}

interface SyncJobPatch {
  status: SyncJob["status"]
  error?: string | null
  startedAt?: string | null
  completedAt?: string | null
}

export function enqueueSyncJob(database: Database, input: EnqueueSyncJobInput) {
  const existing = database.syncJobs.find(
    (job) =>
      job.projectId === input.projectId &&
      job.datasetId === input.datasetId &&
      (job.status === "queued" || job.status === "running")
  )
  if (existing) return existing

  const createdAt = new Date().toISOString()
  const job: SyncJob = {
    id: `job_${crypto.randomUUID()}`,
    projectId: input.projectId,
    datasetId: input.datasetId,
    organizationId: input.organizationId,
    status: "queued",
    trigger: input.trigger,
    requestedBy: input.requestedBy,
    error: null,
    createdAt,
    startedAt: null,
    completedAt: null,
  }

  database.syncJobs.push(job)
  return job
}

export function claimNextSyncJob(database: Database, organizationId?: string) {
  const job = database.syncJobs
    .filter((candidate) => candidate.status === "queued" && (!organizationId || candidate.organizationId === organizationId))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]

  if (!job) return null

  job.status = "running"
  job.startedAt = new Date().toISOString()
  job.error = null
  return job
}

export function completeSyncJob(database: Database, jobId: string) {
  const job = database.syncJobs.find((candidate) => candidate.id === jobId)
  if (!job) return null

  job.status = "success"
  job.completedAt = new Date().toISOString()
  job.error = null
  return job
}

export function failSyncJob(database: Database, jobId: string, error: string) {
  const job = database.syncJobs.find((candidate) => candidate.id === jobId)
  if (!job) return null

  job.status = "failed"
  job.completedAt = new Date().toISOString()
  job.error = error
  return job
}

export function applySyncJobPatch(database: Database, jobId: string, patch: SyncJobPatch) {
  const job = database.syncJobs.find((candidate) => candidate.id === jobId)
  if (!job) return null

  job.status = patch.status
  if ("error" in patch) job.error = patch.error ?? null
  if ("startedAt" in patch) job.startedAt = patch.startedAt ?? null
  if ("completedAt" in patch) job.completedAt = patch.completedAt ?? null
  return job
}

export function serializeSyncJobClaim(job: SyncJob, result: SyncJobClaimResult = {}) {
  return {
    job_id: job.id,
    project_id: job.projectId,
    dataset_id: job.datasetId,
    status: job.status,
    rows_synced: result.rowsSynced ?? 0,
    error: job.error,
  }
}
