import type { SyncJobStatus } from "@/lib/types"

interface BaseJob {
  id: string
  status: SyncJobStatus
  organizationId: string
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  error: string | null
}

export function claimNext<T extends BaseJob>(jobs: T[], organizationId?: string): T | null {
  const job = jobs
    .filter((candidate) => candidate.status === "queued" && (!organizationId || candidate.organizationId === organizationId))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]

  if (!job) return null

  job.status = "running"
  job.startedAt = new Date().toISOString()
  job.error = null
  return job
}

export function completeJob<T extends BaseJob>(jobs: T[], jobId: string): T | null {
  const job = jobs.find((candidate) => candidate.id === jobId)
  if (!job) return null

  job.status = "success"
  job.completedAt = new Date().toISOString()
  job.error = null
  return job
}

export function failJob<T extends BaseJob>(jobs: T[], jobId: string, error: string): T | null {
  const job = jobs.find((candidate) => candidate.id === jobId)
  if (!job) return null

  job.status = "failed"
  job.completedAt = new Date().toISOString()
  job.error = error
  return job
}
