#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const tempDir = path.join(repoRoot, ".sync-config-test")

try {
  const { validateSyncSourceConfig } = await loadValidator()

  assert.equal(validateSyncSourceConfig("manual", {}), null)

  const cosError = validateSyncSourceConfig("cos", {})
  assert.ok(cosError !== null, "cos source should return a validation error")
  assert.ok(typeof cosError === "string")

  const prestoError = validateSyncSourceConfig("presto", {})
  assert.ok(prestoError !== null, "presto source should return a validation error")
  assert.ok(typeof prestoError === "string")

  console.log("Sync config validation tests passed.")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function loadValidator() {
  await rm(tempDir, { recursive: true, force: true })
  const aliasRoot = path.join(tempDir, "node_modules", "@", "lib", "server", "sync")
  await mkdir(aliasRoot, { recursive: true })
  await compileTs(path.join(repoRoot, "lib/server/sync/validate-config.ts"), path.join(aliasRoot, "validate-config.js"))
  const require = createRequire(path.join(tempDir, "loader.cjs"))
  return require(path.join(aliasRoot, "validate-config.js"))
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
