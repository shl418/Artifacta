#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const tempDir = path.join(repoRoot, ".get-project-by-id-test")
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
  await writeFile(
    path.join(jsonDataDir, "artifacta.json"),
    JSON.stringify(buildDatabase(20), null, 2),
    "utf8",
  )

  const jsonDb = await loadDb("json-build", {
    DATA_DIR: jsonDataDir,
    DATA_DRIVER: "",
    SQLITE_PATH: "",
    UPLOAD_DIR: "",
  })

  // Patch the CJS fs.promises.readFile so we can count how many times the JSON
  // driver hits disk per getProjectById call. The compiled db.js requires
  // "node:fs" via CommonJS, so its `promises.readFile` is mutable on this
  // shared object.
  const require = createRequire(import.meta.url)
  const cjsFs = require("node:fs")
  const original = cjsFs.promises.readFile
  let readCount = 0
  cjsFs.promises.readFile = async (...args) => {
    if (typeof args[0] === "string" && args[0].endsWith("artifacta.json")) readCount += 1
    return original.apply(cjsFs.promises, args)
  }
  try {
    const found = await jsonDb.getProjectById("proj_5")
    assert.equal(found?.id, "proj_5", "JSON driver must return the project by id")
    assert.equal(found?.name, "Project 5")

    const missing = await jsonDb.getProjectById("proj_999")
    assert.equal(missing, null, "Unknown project ids must return null")

    const startReadCount = readCount
    const ids = Array.from({ length: 20 }, (_, index) => `proj_${index}`)
    for (const id of ids) {
      const project = await jsonDb.getProjectById(id)
      assert.equal(project?.id, id, `getProjectById(${id}) should return the matching record`)
    }
    const reads = readCount - startReadCount
    // ensureDatabase() also reads artifacta.json for the seed-update check on
    // each call, so the JSON driver may legitimately read twice per lookup.
    // The guard here is against any future change that scales with project
    // count (e.g. one read per project).
    const ceiling = ids.length * 2
    assert.ok(
      reads <= ceiling,
      `JSON driver should read the file O(1) times per call (got ${reads} reads for ${ids.length} calls, ceiling ${ceiling})`,
    )
  } finally {
    cjsFs.promises.readFile = original
  }

  console.log("getProjectById tests passed.")
} finally {
  restoreEnv()
  await rm(tempDir, { recursive: true, force: true })
}

function buildDatabase(projectCount) {
  const now = "2026-05-25T00:00:00.000Z"
  const projects = Array.from({ length: projectCount }, (_, index) => ({
    id: `proj_${index}`,
    organizationId: "org_demo",
    ownerId: "user_admin",
    folderId: null,
    name: `Project ${index}`,
    description: "",
    visibility: "private",
    htmlArtifact: {
      kind: "html",
      originalName: "index.html",
      path: `projects/proj_${index}/index.html`,
      size: 1,
      contentType: "text/html",
    },
    viewsCount: 0,
    createdAt: now,
    updatedAt: now,
  }))
  return {
    version: 1,
    organizations: [],
    users: [],
    folders: [],
    projects,
    datasets: [],
    projectMembers: [],
    apiKeys: [],
    syncHistory: [],
    activities: [],
  }
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
