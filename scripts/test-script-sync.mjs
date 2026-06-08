#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const tempDir = path.join(repoRoot, ".script-sync-test")

async function compileModule(sourcePath, pathReplacements = {}) {
  let source = await readFile(sourcePath, "utf8")
  for (const [from, to] of Object.entries(pathReplacements)) {
    source = source.replaceAll(from, to)
  }
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  })
  const outputPath = path.join(tempDir, path.basename(sourcePath).replace(/\.ts$/, ".cjs"))
  await mkdir(tempDir, { recursive: true })
  await writeFile(outputPath, compiled.outputText, "utf8")
  const require = createRequire(import.meta.url)
  return require(outputPath)
}

try {
  const cron = await compileModule(path.join(repoRoot, "lib/server/sync/cron.ts"))
  const lifecycleCompiledPath = path.join(tempDir, "job-lifecycle.cjs")
  await compileModule(path.join(repoRoot, "lib/server/sync/job-lifecycle.ts"))
  const scriptJobs = await compileModule(
    path.join(repoRoot, "lib/server/sync/script-jobs.ts"),
    { "@/lib/server/sync/job-lifecycle": lifecycleCompiledPath }
  )
  await writeFile(path.join(tempDir, "db.cjs"), "exports.now=()=>new Date('2026-05-31T00:00:00.000Z').toISOString();\n", "utf8")
  const syncScripts = await compileModule(
    path.join(repoRoot, "lib/server/sync/sync-scripts.ts"),
    { "@/lib/server/db": path.join(tempDir, "db.cjs") }
  )

  const nextRun = cron.computeNextCronRun("0 8 * * *", new Date("2026-05-24T10:00:00.000Z"))
  assert.ok(nextRun)
  assert.ok(Date.parse(nextRun) > Date.parse("2026-05-24T10:00:00.000Z"))

  const database = {
    projectSyncScripts: [],
    scriptSyncJobs: [],
    datasets: [],
    projects: [{ id: "proj_test", htmlArtifact: { assetRoot: "projects/proj_test/bundle" } }],
  }

  const first = scriptJobs.enqueueScriptSyncJob(database, {
    projectId: "proj_test",
    scriptId: "sscript_a",
    organizationId: "org_demo",
    trigger: "manual",
    requestedBy: "user_admin",
  })
  const second = scriptJobs.enqueueScriptSyncJob(database, {
    projectId: "proj_test",
    scriptId: "sscript_b",
    organizationId: "org_demo",
    trigger: "manual",
    requestedBy: "user_admin",
  })
  assert.equal(first.id, second.id, "only one queued/running job per project")

  const syncScriptDatabase = { projectSyncScripts: [] }
  syncScripts.upsertProjectSyncScriptsFromManifest(syncScriptDatabase, "proj_test", {
    sync_scripts: [
      {
        id: "main",
        path: "scripts/sync.py",
        runtime: "python",
        outputs: ["data/metrics.csv"],
        schedule: "0 8 * * *",
      },
    ],
  })
  assert.equal(syncScriptDatabase.projectSyncScripts.length, 1)
  assert.equal(syncScriptDatabase.projectSyncScripts[0].schedule, "0 8 * * *")
  assert.deepEqual(syncScriptDatabase.projectSyncScripts[0].outputs, ["data/metrics.csv"])

  syncScripts.upsertProjectSyncScriptsFromManifest(syncScriptDatabase, "proj_test", {
    sync_scripts: [
      {
        id: "main",
        path: "scripts/refresh.py",
        runtime: "python",
        outputs: ["data/metrics.csv", "data/extra.csv"],
        schedule: "0 9 * * *",
      },
    ],
  })
  assert.equal(syncScriptDatabase.projectSyncScripts.length, 1)
  assert.equal(syncScriptDatabase.projectSyncScripts[0].scriptPath, "scripts/refresh.py")
  assert.equal(syncScriptDatabase.projectSyncScripts[0].schedule, "0 9 * * *")
  assert.deepEqual(syncScriptDatabase.projectSyncScripts[0].outputs, ["data/metrics.csv", "data/extra.csv"])

  console.log("Script sync helper tests passed.")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}
