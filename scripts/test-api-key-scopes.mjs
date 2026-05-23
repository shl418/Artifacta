#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const tempDir = path.join(repoRoot, ".api-key-scope-test")

try {
  const scopes = await loadScopes()

  assert.deepEqual(scopes.normalizeApiKeyScopes(undefined), ["*"])
  assert.deepEqual(scopes.normalizeApiKeyScopes(["projects:read"]), ["projects:read"])
  assert.equal(scopes.apiKeyAllowsScope({ authType: "session", user: { id: "u1" } }, "projects:write"), true)
  assert.equal(
    scopes.apiKeyAllowsScope({ authType: "api-key", user: { id: "u1" }, apiKeyScopes: ["projects:read"] }, "projects:write"),
    false,
  )
  assert.equal(
    scopes.apiKeyAllowsScope({ authType: "api-key", user: { id: "u1" }, apiKeyScopes: ["*"] }, "sync:run"),
    true,
  )
  assert.deepEqual(scopes.parseRequestedScopes(["datasets:write", "sync:run"]), ["datasets:write", "sync:run"])
  assert.equal(scopes.parseRequestedScopes(["unknown:scope"]), null)

  console.log("API key scope tests passed.")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function loadScopes() {
  await rm(tempDir, { recursive: true, force: true })
  const aliasRoot = path.join(tempDir, "node_modules", "@", "lib", "server")
  await mkdir(aliasRoot, { recursive: true })
  await compileTs(path.join(repoRoot, "lib/server/api-key-scopes.ts"), path.join(aliasRoot, "api-key-scopes.js"))
  const require = createRequire(path.join(tempDir, "loader.cjs"))
  return require(path.join(aliasRoot, "api-key-scopes.js"))
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
