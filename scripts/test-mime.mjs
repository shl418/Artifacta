#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const sourcePath = path.join(repoRoot, "lib/server/artifacts/mime.ts")
const tempDir = path.join(repoRoot, ".mime-test")
const compiledPath = path.join(tempDir, "mime.cjs")

try {
  const mime = await loadModule()

  assert.equal(mime.contentTypeForPath("foo.css"), "text/css; charset=utf-8")
  assert.equal(mime.contentTypeForPath("foo.JS"), "text/javascript; charset=utf-8")
  assert.equal(mime.contentTypeForPath("a/b/c.mjs"), "text/javascript; charset=utf-8")
  assert.equal(mime.contentTypeForPath("data/sales.csv"), "text/csv; charset=utf-8")
  assert.equal(mime.contentTypeForPath("payload.json"), "application/json; charset=utf-8")
  assert.equal(mime.contentTypeForPath("image.png"), "image/png")
  assert.equal(mime.contentTypeForPath("image.svg"), "image/svg+xml")
  assert.equal(mime.contentTypeForPath("font.woff2"), "font/woff2")
  assert.equal(mime.contentTypeForPath("data/sales.tsv"), "application/octet-stream", "tsv must fall back to octet-stream")
  assert.equal(mime.contentTypeForPath("data/sales.xlsx"), "application/octet-stream", "xlsx must fall back to octet-stream")
  assert.equal(mime.contentTypeForPath("data/sales.jsonl"), "application/octet-stream", "jsonl must fall back to octet-stream")
  assert.equal(mime.contentTypeForPath("data/sales.parquet"), "application/octet-stream", "parquet must fall back to octet-stream")
  assert.equal(mime.contentTypeForPath("no-extension"), "application/octet-stream")

  assert.equal(mime.fileExtension("Index.HTML"), "html")
  assert.equal(mime.fileExtension("foo"), "")

  assert.equal(mime.isBlockedHostedExtension("page.html"), true)
  assert.equal(mime.isBlockedHostedExtension("page.HTM"), true, "uppercase .HTM must be blocked")
  assert.equal(mime.isBlockedHostedExtension("data/sales.csv"), false)
  assert.equal(mime.isBlockedHostedExtension("assets/app.js"), false)

  const blocked = new Set(mime.BLOCKED_HOSTED_EXTENSIONS)
  assert.ok(blocked.has(".html"))
  assert.ok(blocked.has(".htm"))

  console.log("MIME helper tests passed.")
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
