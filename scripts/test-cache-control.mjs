#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const sourcePath = path.join(repoRoot, "lib/server/artifacts/cache-control.ts")
const tempDir = path.join(repoRoot, ".cache-control-test")
const compiledPath = path.join(tempDir, "cache-control.cjs")

try {
  const cacheControl = await loadModule()

  assert.equal(
    cacheControl.cacheControlForVisibility("public"),
    "public, max-age=300",
    "public projects keep public cache so the shared CDN can serve them",
  )
  assert.equal(
    cacheControl.cacheControlForVisibility("team"),
    "private, no-store",
    "team-only assets must not be cached (may be reached via short-lived embed token)",
  )
  assert.equal(
    cacheControl.cacheControlForVisibility("private"),
    "private, no-store",
    "private assets must not be cached (may be reached via short-lived embed token)",
  )

  console.log("Cache-Control visibility tests passed.")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function loadModule() {
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
