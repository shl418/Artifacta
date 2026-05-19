#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const manifestSourcePath = path.join(repoRoot, "lib/server/artifacts/manifest.ts")
const tempDir = path.join(repoRoot, ".upload-session-test")
const compiledPath = path.join(tempDir, "manifest.cjs")

const DATASET_EXTENSIONS = new Set([".csv", ".tsv", ".json", ".jsonl", ".parquet", ".xlsx"])

function inferDatasetFromExtension(extension) {
  return DATASET_EXTENSIONS.has(extension.toLowerCase())
}

try {
  const manifest = await loadManifestModule()

  assert.equal(inferDatasetFromExtension(".csv"), true)
  assert.equal(inferDatasetFromExtension(".js"), false)

  const manifestObject = manifest.generateManifest("Demo", "index.html", [
    {
      id: manifest.datasetIdFromBundlePath("data/sales.csv"),
      name: "Sales",
      bundlePath: "data/sales.csv",
      refresh: "manual",
    },
  ])

  assert.equal(manifestObject.schema_version, 1)
  assert.equal(manifestObject.entrypoint, "index.html")
  assert.equal(manifestObject.datasets[0].kind, "csv")
  assert.equal(manifestObject.datasets[0].path, "data/sales.csv")

  console.log("Upload session helper tests passed.")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function loadManifestModule() {
  const source = await readFile(manifestSourcePath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: manifestSourcePath,
  })

  await mkdir(tempDir, { recursive: true })
  await writeFile(compiledPath, compiled.outputText, "utf8")

  const require = createRequire(import.meta.url)
  return require(compiledPath)
}
