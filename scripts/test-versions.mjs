#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const tempDir = path.join(repoRoot, ".versions-test")

try {
  const versions = await loadVersions()
  const database = createDatabase()
  const project = {
    id: "proj_1",
    organizationId: "org_1",
    name: "Demo",
    htmlArtifact: { kind: "html", originalName: "index.html", size: 10, entryPath: "index.html" },
  }
  const dataset = {
    id: "ds_1",
    projectId: "proj_1",
    organizationId: "org_1",
    fileName: "sales.csv",
    filePath: "datasets/sales.csv",
    fileType: "csv",
    size: 20,
    rows: 2,
    columns: 2,
    schema: [],
    version: 1,
  }

  versions.recordDashboardVersion(database, project, "user_1", "Initial publish")
  versions.recordDashboardVersion(database, project, "user_1", "Updated dashboard")
  assert.equal(database.dashboardVersions.length, 2)
  assert.equal(database.dashboardVersions[0].version, 2)
  assert.equal(database.dashboardVersions[1].version, 1)

  versions.recordDatasetVersion(database, dataset, "user_1")
  assert.equal(database.datasetVersions.length, 1)
  assert.equal(database.datasetVersions[0].version, 1)

  console.log("Version history tests passed.")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function loadVersions() {
  await rm(tempDir, { recursive: true, force: true })
  const aliasRoot = path.join(tempDir, "node_modules", "@", "lib", "server")
  await mkdir(aliasRoot, { recursive: true })
  await compileTs(path.join(repoRoot, "lib/server/config.ts"), path.join(aliasRoot, "config.js"))
  await compileTs(path.join(repoRoot, "lib/server/demo-artifacts.ts"), path.join(aliasRoot, "demo-artifacts.js"))
  await compileTs(path.join(repoRoot, "lib/server/db.ts"), path.join(aliasRoot, "db.js"))
  await compileTs(path.join(repoRoot, "lib/server/versions.ts"), path.join(aliasRoot, "versions.js"))

  const require = createRequire(path.join(tempDir, "loader.cjs"))
  return require(path.join(aliasRoot, "versions.js"))
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

function createDatabase() {
  return {
    dashboardVersions: [],
    datasetVersions: [],
  }
}
