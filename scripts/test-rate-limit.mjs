#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const tempDir = path.join(repoRoot, ".rate-limit-test")
const originalEnv = {
  ARTIFACTA_RATE_LIMIT_MAX: process.env.ARTIFACTA_RATE_LIMIT_MAX,
  ARTIFACTA_RATE_LIMIT_WINDOW_MS: process.env.ARTIFACTA_RATE_LIMIT_WINDOW_MS,
}

try {
  process.env.ARTIFACTA_RATE_LIMIT_MAX = "2"
  process.env.ARTIFACTA_RATE_LIMIT_WINDOW_MS = "60000"

  const { rateLimitResponse } = await loadRateLimit()
  const request = new Request("http://localhost/api/v1/auth/login", {
    headers: { "x-forwarded-for": "203.0.113.10" },
  })

  assert.equal(rateLimitResponse(request, "auth-login", 2), null)
  assert.equal(rateLimitResponse(request, "auth-login", 2), null)

  const limited = rateLimitResponse(request, "auth-login", 2)
  assert(limited)
  assert.equal(limited.status, 429)
  const payload = await limited.json()
  assert.equal(payload.error.code, "RATE_LIMITED")
  assert.equal(typeof payload.error.details.retry_after_seconds, "number")

  const otherScope = rateLimitResponse(request, "sync-trigger", 2)
  assert.equal(otherScope, null)

  console.log("Rate limit tests passed.")
} finally {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await rm(tempDir, { recursive: true, force: true })
}

async function loadRateLimit() {
  await rm(tempDir, { recursive: true, force: true })
  const aliasRoot = path.join(tempDir, "node_modules", "@", "lib", "server")
  await mkdir(aliasRoot, { recursive: true })
  await compileTs(path.join(repoRoot, "lib/server/config.ts"), path.join(aliasRoot, "config.js"))
  await compileTs(path.join(repoRoot, "lib/server/responses.ts"), path.join(aliasRoot, "responses.js"))
  await compileTs(path.join(repoRoot, "lib/server/rate-limit.ts"), path.join(aliasRoot, "rate-limit.js"))

  const require = createRequire(path.join(tempDir, "loader.cjs"))
  return require(path.join(aliasRoot, "rate-limit.js"))
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
