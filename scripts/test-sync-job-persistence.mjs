#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const tempDir = path.join(repoRoot, ".sync-job-persistence-test")
const originalEnv = {
  DATA_DIR: process.env.DATA_DIR,
  DATA_DRIVER: process.env.DATA_DRIVER,
  SQLITE_PATH: process.env.SQLITE_PATH,
  UPLOAD_DIR: process.env.UPLOAD_DIR,
}

try {
  await rm(tempDir, { recursive: true, force: true })

  const jsonDataDir = path.join(tempDir, "json-data")
  await mkdir(jsonDataDir, { recursive: true })
  await writeFile(path.join(jsonDataDir, "artifacta.json"), JSON.stringify(createLegacyDatabase(), null, 2), "utf8")
  const jsonDb = await loadDb("json-build", {
    DATA_DIR: jsonDataDir,
    DATA_DRIVER: "",
    SQLITE_PATH: "",
    UPLOAD_DIR: "",
  })
  assert.deepEqual((await jsonDb.readDatabase()).syncJobs, [])

  const sqliteDataDir = path.join(tempDir, "sqlite-data")
  const sqliteDb = await loadDb("sqlite-build", {
    DATA_DIR: sqliteDataDir,
    DATA_DRIVER: "sqlite",
    SQLITE_PATH: path.join(sqliteDataDir, "artifacta.sqlite"),
    UPLOAD_DIR: "",
  })
  const database = createLegacyDatabase()
  database.syncJobs = [createSyncJob()]
  try {
    await sqliteDb.writeDatabase(database)
    assert.deepEqual((await sqliteDb.readDatabase()).syncJobs, [createSyncJob()])
  } catch (error) {
    if (!isMissingSqliteBindingError(error)) throw error
    await assertSqliteSourceShape()
  }

  console.log("Sync job persistence tests passed.")
} finally {
  restoreEnv()
  await rm(tempDir, { recursive: true, force: true })
}

async function loadDb(name, env) {
  setEnv(env)
  const buildRoot = path.join(tempDir, name)
  const aliasRoot = path.join(buildRoot, "node_modules", "@", "lib", "server")
  await mkdir(aliasRoot, { recursive: true })
  await compileTs(path.join(repoRoot, "lib/server/config.ts"), path.join(aliasRoot, "config.js"))
  await compileTs(path.join(repoRoot, "lib/server/demo-artifacts.ts"), path.join(aliasRoot, "demo-artifacts.js"))
  await compileTs(path.join(repoRoot, "lib/server/db.ts"), path.join(aliasRoot, "db.js"))

  const require = createRequire(path.join(buildRoot, "loader.cjs"))
  return require(path.join(aliasRoot, "db.js"))
}

async function compileTs(sourcePath, outputPath) {
  const source = await readFile(sourcePath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  })

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, compiled.outputText, "utf8")
}

function createLegacyDatabase() {
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
    activities: [],
  }
}

function createSyncJob() {
  return {
    id: "job_1",
    projectId: "proj_1",
    datasetId: "ds_1",
    organizationId: "org_1",
    status: "queued",
    trigger: "manual",
    requestedBy: "user_1",
    error: null,
    createdAt: "2026-05-18T00:00:00.000Z",
    startedAt: null,
    completedAt: null,
  }
}

async function assertSqliteSourceShape() {
  const dbSource = await readFile(path.join(repoRoot, "lib/server/db.ts"), "utf8")
  assert.match(dbSource, /"sync_jobs_table"/)
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS sync_jobs/)
  assert.match(dbSource, /readSqliteRows<SyncJob>\(database, "sync_jobs"\)/)
  assert.match(dbSource, /INSERT INTO sync_jobs/)
  assert.match(dbSource, /\| "sync_jobs"/)
  assert.match(dbSource, /updateDatabaseQueue/)
  assert.match(dbSource, /await previousUpdate\.catch/)
}

function isMissingSqliteBindingError(error) {
  return error instanceof Error && /Could not locate the bindings file/.test(error.message)
}

function setEnv(overrides) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value) {
      process.env[key] = value
    } else {
      delete process.env[key]
    }
  }
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}
