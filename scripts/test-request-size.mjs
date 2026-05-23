#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const tempDir = path.join(repoRoot, ".request-size-test")
const originalMax = process.env.ARTIFACTA_MAX_REQUEST_BYTES

try {
  process.env.ARTIFACTA_MAX_REQUEST_BYTES = String(1024)
  const { requestPayloadTooLarge } = await loadRequestSize()

  assert.equal(requestPayloadTooLarge(new Request("http://localhost", { method: "POST" })), null)
  assert.equal(
    requestPayloadTooLarge(
      new Request("http://localhost", { method: "POST", headers: { "content-length": "512" } }),
    ),
    null,
  )

  const tooLarge = requestPayloadTooLarge(
    new Request("http://localhost", { method: "POST", headers: { "content-length": "2048" } }),
  )
  assert(tooLarge)
  assert.equal(tooLarge.status, 413)
  const payload = await tooLarge.json()
  assert.equal(payload.error.code, "PAYLOAD_TOO_LARGE")

  console.log("Request size tests passed.")
} finally {
  if (originalMax === undefined) delete process.env.ARTIFACTA_MAX_REQUEST_BYTES
  else process.env.ARTIFACTA_MAX_REQUEST_BYTES = originalMax
  await rm(tempDir, { recursive: true, force: true })
}

async function loadRequestSize() {
  await rm(tempDir, { recursive: true, force: true })
  const aliasRoot = path.join(tempDir, "node_modules", "@", "lib", "server")
  await mkdir(aliasRoot, { recursive: true })
  await compileTs(path.join(repoRoot, "lib/server/config.ts"), path.join(aliasRoot, "config.js"))
  await compileTs(path.join(repoRoot, "lib/server/responses.ts"), path.join(aliasRoot, "responses.js"))
  await compileTs(path.join(repoRoot, "lib/server/request-size.ts"), path.join(aliasRoot, "request-size.js"))

  const require = createRequire(path.join(tempDir, "loader.cjs"))
  return require(path.join(aliasRoot, "request-size.js"))
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
