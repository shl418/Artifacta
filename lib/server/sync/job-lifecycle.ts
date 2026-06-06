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

// A worker/server crash (or a request that dies mid-run) can leave a job stuck
// in "running" forever, and since only one queued/running job is allowed per
// project, that permanently wedges the project. Reclaim leases that have clearly
// expired so the project can sync again.
export function reclaimStaleJobs<T extends BaseJob>(jobs: T[], leaseMs: number): void {
  const cutoff = Date.now() - leaseMs
  for (const job of jobs) {
    if (job.status !== "running") continue
    const started = job.startedAt ? Date.parse(job.startedAt) : Date.parse(job.createdAt)
    if (Number.isFinite(started) && started < cutoff) {
      job.status = "failed"
      job.completedAt = new Date().toISOString()
      job.error = "任务超过租约时间未完成，已自动回收（worker 可能已崩溃）。"
    }
  }
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
