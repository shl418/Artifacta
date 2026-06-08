#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import AdmZip from "adm-zip"
import ts from "typescript"

const repoRoot = process.cwd()
const manifestSourcePath = path.join(repoRoot, "lib/server/artifacts/manifest.ts")
const uploadSessionSourcePath = path.join(repoRoot, "lib/server/artifacts/upload-session.ts")
const zipSecuritySourcePath = path.join(repoRoot, "lib/server/artifacts/zip-security.ts")
const tempDir = path.join(repoRoot, ".upload-session-test")
const compiledPath = path.join(tempDir, "manifest.cjs")

const DATASET_EXTENSIONS = new Set([".csv", ".tsv", ".json", ".jsonl", ".parquet", ".xlsx"])

function inferDatasetFromExtension(extension) {
  return DATASET_EXTENSIONS.has(extension.toLowerCase())
}

try {
  const manifest = await loadManifestModule()
  const uploadSession = await loadUploadSessionModule()

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

  const folderZip = new AdmZip()
  folderZip.addFile("5-add-one-script/index.html", Buffer.from("<html></html>"))
  folderZip.addFile("5-add-one-script/artifacta.json", Buffer.from("{}"))
  folderZip.addFile("5-add-one-script/data/metrics.csv", Buffer.from("stage,users\nVisit,10\n"))
  folderZip.addFile("5-add-one-script/scripts/sync.py", Buffer.from("print('sync')\n"))
  folderZip.addFile("__MACOSX/5-add-one-script/._index.html", Buffer.from("metadata"))

  const fileTree = uploadSession.buildFileTreeFromZipBuffer(folderZip.toBuffer())
  assert.deepEqual(
    fileTree.map((entry) => ({ path: entry.path, inferredDataset: entry.inferredDataset })),
    [
      { path: "artifacta.json", inferredDataset: false },
      { path: "data/metrics.csv", inferredDataset: true },
      { path: "index.html", inferredDataset: false },
      { path: "scripts/sync.py", inferredDataset: false },
    ],
  )
  assert.equal(uploadSession.detectManifestInFileTree(fileTree), true)
  assert.deepEqual(uploadSession.autoDiscoverDatasetsFromFileTree(fileTree), [
    { bundle_path: "data/metrics.csv", name: "metrics.csv", refresh: "manual" },
  ])

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

async function loadUploadSessionModule() {
  await mkdir(tempDir, { recursive: true })
  await compile(zipSecuritySourcePath, "zip-security.cjs")
  await writeFile(path.join(tempDir, "config.cjs"), "exports.dataDir='.'; exports.maxArtifactBytes=104857600;\n", "utf8")
  await writeFile(path.join(tempDir, "db.cjs"), "exports.now=()=>new Date('2026-05-31T00:00:00.000Z').toISOString();\n", "utf8")
  await writeFile(path.join(tempDir, "_types.cjs"), "module.exports = {}\n", "utf8")
  await compile(uploadSessionSourcePath, "upload-session.cjs", {
    "@/lib/server/artifacts/zip-security": "./zip-security.cjs",
    "@/lib/server/config": "./config.cjs",
    "@/lib/server/db": "./db.cjs",
    "@/lib/types": "./_types.cjs",
  })

  const require = createRequire(import.meta.url)
  return require(path.join(tempDir, "upload-session.cjs"))
}

async function compile(sourcePath, outputName, replacements = {}) {
  let source = await readFile(sourcePath, "utf8")
  for (const [from, to] of Object.entries(replacements)) {
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

  await writeFile(path.join(tempDir, outputName), compiled.outputText, "utf8")
}
