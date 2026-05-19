#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const sourcePath = path.join(repoRoot, "lib/server/artifacts/manifest.ts")
const tempDir = path.join(repoRoot, ".manifest-test")
const compiledPath = path.join(tempDir, "manifest.cjs")

try {
  const manifest = await loadManifestParser()

  assert.deepEqual(
    manifest.parseArtifactManifest({
      schema_version: 1,
      name: "Basic Sales Dashboard",
      entrypoint: "dashboards\\index.html",
      datasets: [
        {
          id: "sales",
          name: "Sales CSV",
          kind: "csv",
          path: "data\\sales.csv",
          refresh: "sync",
        },
      ],
    }),
    {
      schema_version: 1,
      name: "Basic Sales Dashboard",
      entrypoint: "dashboards/index.html",
      datasets: [
        {
          id: "sales",
          name: "Sales CSV",
          kind: "csv",
          path: "data/sales.csv",
          refresh: "sync",
        },
      ],
    },
  )

  assert.deepEqual(
    manifest.parseArtifactManifest({
      schema_version: 1,
      name: "No Dataset Dashboard",
      entrypoint: "index.html",
    }),
    {
      schema_version: 1,
      name: "No Dataset Dashboard",
      entrypoint: "index.html",
      datasets: [],
    },
  )

  assert.deepEqual(
    manifest.parseArtifactManifest({
      schema_version: 1,
      name: "Default Refresh Dashboard",
      entrypoint: "index.html",
      datasets: [{ id: "sales", name: "Sales CSV", kind: "csv", path: "data/sales.csv" }],
    }).datasets[0],
    {
      id: "sales",
      name: "Sales CSV",
      kind: "csv",
      path: "data/sales.csv",
      refresh: "manual",
    },
  )

  assert.throws(
    () =>
      manifest.parseArtifactManifest({
        schema_version: 1,
        name: "Traversal Dashboard",
        entrypoint: "dashboards/../index.html",
      }),
    /relative|traversal/i,
  )

  for (const entrypoint of [
    "/absolute/index.html",
    "C:\\dashboards\\index.html",
    "C:index.html",
    "\\\\server\\share\\index.html",
    "https://example.com/index.html",
  ]) {
    assert.throws(
      () =>
        manifest.parseArtifactManifest({
          schema_version: 1,
          name: "Unsafe Entrypoint Dashboard",
          entrypoint,
        }),
      /relative|traversal/i,
    )
  }

  assert.throws(
    () =>
      manifest.parseArtifactManifest({
        schema_version: 1,
        name: "Unsafe Dataset Path Dashboard",
        entrypoint: "index.html",
        datasets: [{ id: "sales", name: "Sales CSV", kind: "csv", path: "data/../sales.csv" }],
      }),
    /relative|traversal/i,
  )

  assert.throws(
    () =>
      manifest.parseArtifactManifest({
        schema_version: 1,
        name: "Bad Dataset ID Dashboard",
        entrypoint: "index.html",
        datasets: [{ id: "sales.csv", name: "Sales CSV", kind: "csv" }],
      }),
    /invalid/i,
  )

  console.log("Manifest parser tests passed.")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function loadManifestParser() {
  const source = await readFile(sourcePath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  })

  await mkdir(tempDir, { recursive: true })
  await writeFile(compiledPath, compiled.outputText, "utf8")

  const require = createRequire(import.meta.url)
  return require(compiledPath)
}
