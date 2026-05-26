#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const sourcePath = path.join(repoRoot, "lib/server/sync/jobs.ts")
const tempDir = path.join(repoRoot, ".sync-jobs-test")
const compiledPath = path.join(tempDir, "jobs.cjs")

try {
  const jobs = await loadSyncJobs()

  const database = createDatabase()
  const first = jobs.enqueueSyncJob(database, {
    projectId: "proj_1",
    datasetId: "ds_1",
    organizationId: "org_1",
    trigger: "manual",
    requestedBy: "user_1",
  })
  const duplicate = jobs.enqueueSyncJob(database, {
    projectId: "proj_1",
    datasetId: "ds_1",
    organizationId: "org_1",
    trigger: "scheduled",
    requestedBy: null,
  })

  assert.equal(first.id, duplicate.id)
  assert.equal(database.syncJobs.length, 1)
  assert.equal(first.status, "queued")
  assert.equal(first.error, null)
  assert.equal(first.startedAt, null)
  assert.equal(first.completedAt, null)

  const claimed = jobs.claimNextSyncJob(database)
  assert.equal(claimed.id, first.id)
  assert.equal(claimed.status, "running")
  assert.match(claimed.startedAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(jobs.claimNextSyncJob(database), null)

  const scopedDatabase = createDatabase()
  jobs.enqueueSyncJob(scopedDatabase, {
    projectId: "proj_2",
    datasetId: "ds_2",
    organizationId: "org_2",
    trigger: "manual",
    requestedBy: "user_2",
  })
  assert.equal(jobs.claimNextSyncJob(scopedDatabase, "org_1"), null)
  assert.equal(jobs.claimNextSyncJob(scopedDatabase, "org_2").organizationId, "org_2")

  jobs.completeSyncJob(database, claimed.id)
  assert.equal(database.syncJobs[0].status, "success")
  assert.equal(database.syncJobs[0].error, null)
  assert.match(database.syncJobs[0].completedAt, /^\d{4}-\d{2}-\d{2}T/)

  const retry = jobs.enqueueSyncJob(database, {
    projectId: "proj_1",
    datasetId: "ds_1",
    organizationId: "org_1",
    trigger: "scheduled",
    requestedBy: null,
  })
  assert.notEqual(retry.id, first.id)

  jobs.failSyncJob(database, retry.id, "source unavailable")
  assert.equal(database.syncJobs.find((job) => job.id === retry.id).status, "failed")
  assert.equal(database.syncJobs.find((job) => job.id === retry.id).error, "source unavailable")

  assert.deepEqual(jobs.serializeSyncJobClaim(database.syncJobs[0], { rowsSynced: 3 }), {
    job_id: database.syncJobs[0].id,
    project_id: "proj_1",
    dataset_id: "ds_1",
    status: "success",
    rows_synced: 3,
    error: null,
  })

  const workerDatabase = createDatabase()
  jobs.enqueueSyncJob(workerDatabase, {
    projectId: "proj_1",
    datasetId: "ds_1",
    organizationId: "org_1",
    trigger: "manual",
    requestedBy: "user_1",
  })
  const claimedForWorker = jobs.claimNextSyncJob(workerDatabase)
  const reloadedDatabase = structuredClone(workerDatabase)
  assert.equal(jobs.claimNextSyncJob(reloadedDatabase), null)

  console.log("Sync job tests passed.")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function loadSyncJobs() {
  await mkdir(tempDir, { recursive: true })

  const lifecyclePath = path.join(repoRoot, "lib/server/sync/job-lifecycle.ts")
  const lifecycleCompiled = path.join(tempDir, "job-lifecycle.cjs")
  const lifecycleSource = await readFile(lifecyclePath, "utf8")
  const lifecycleResult = ts.transpileModule(lifecycleSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: lifecyclePath,
  })
  await writeFile(lifecycleCompiled, lifecycleResult.outputText, "utf8")

  const source = (await readFile(sourcePath, "utf8"))
    .replace(/@\/lib\/server\/sync\/job-lifecycle/g, lifecycleCompiled)
  const compiled = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  })
  await writeFile(compiledPath, compiled.outputText, "utf8")

  const require = createRequire(import.meta.url)
  return require(compiledPath)
}

function createDatabase() {
  return {
    version: 1,
    organizations: [],
    users: [],
    folders: [],
    projects: [],
    datasets: [],
    projectMembers: [],
    apiKeys: [],
    syncHistory: [],
    syncJobs: [],
    activities: [],
  }
}
