#!/usr/bin/env node
import assert from "node:assert/strict"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"
import { createRequire } from "node:module"

const repoRoot = process.cwd()
const sourcePath = path.join(repoRoot, "lib/server/sync/job-lifecycle.ts")
const tempDir = path.join(repoRoot, ".job-lifecycle-test")
const compiledPath = path.join(tempDir, "job-lifecycle.cjs")

try {
  const { claimNext, completeJob, failJob } = await loadModule()

  function makeJob(overrides = {}) {
    return {
      id: `job_${Math.random().toString(36).slice(2)}`,
      status: "queued",
      organizationId: "org_1",
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      error: null,
      ...overrides,
    }
  }

  // claimNext — returns the oldest queued job
  {
    const a = makeJob({ createdAt: "2024-01-01T00:00:00.000Z" })
    const b = makeJob({ createdAt: "2024-01-02T00:00:00.000Z" })
    const jobs = [b, a]
    const claimed = claimNext(jobs)
    assert.equal(claimed.id, a.id)
    assert.equal(claimed.status, "running")
    assert.match(claimed.startedAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.equal(claimed.error, null)
  }

  // claimNext — returns null when no queued jobs
  {
    const job = makeJob({ status: "running" })
    assert.equal(claimNext([job]), null)
    assert.equal(claimNext([]), null)
  }

  // claimNext — scopes by organizationId
  {
    const org1 = makeJob({ organizationId: "org_1" })
    const org2 = makeJob({ organizationId: "org_2" })
    assert.equal(claimNext([org1, org2], "org_2").id, org2.id)
    assert.equal(claimNext([org1], "org_2"), null)
  }

  // claimNext — claims one job per call, exhaust all queued
  {
    const a = makeJob()
    const b = makeJob()
    const jobs = [a, b]
    const first = claimNext(jobs)
    assert.ok(first !== null)
    const second = claimNext(jobs)
    assert.ok(second !== null)
    assert.notEqual(second.id, first.id)
    assert.equal(claimNext(jobs), null)
  }

  // completeJob — marks success and sets completedAt
  {
    const job = makeJob({ status: "running" })
    const result = completeJob([job], job.id)
    assert.equal(result.id, job.id)
    assert.equal(result.status, "success")
    assert.match(result.completedAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.equal(result.error, null)
  }

  // completeJob — returns null for unknown id
  {
    assert.equal(completeJob([], "job_unknown"), null)
  }

  // failJob — marks failed and stores error
  {
    const job = makeJob({ status: "running" })
    const result = failJob([job], job.id, "source unavailable")
    assert.equal(result.id, job.id)
    assert.equal(result.status, "failed")
    assert.equal(result.error, "source unavailable")
    assert.match(result.completedAt, /^\d{4}-\d{2}-\d{2}T/)
  }

  // failJob — returns null for unknown id
  {
    assert.equal(failJob([], "job_unknown", "err"), null)
  }

  console.log("Job lifecycle tests passed.")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function loadModule() {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(sourcePath, "utf8"))

  await mkdir(tempDir, { recursive: true })

  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      strict: true,
      paths: {},
    },
    fileName: sourcePath,
  })

  // job-lifecycle.ts has no project-local imports — write directly
  await import("node:fs/promises").then((fs) => fs.writeFile(compiledPath, result.outputText))

  const req = createRequire(compiledPath)
  return req(compiledPath)
}
