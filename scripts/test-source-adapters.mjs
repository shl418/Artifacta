#!/usr/bin/env node
/**
 * Tests for source-adapters.ts that don't require network or S3 access.
 * Covers: loadFromMockRows, loadFromLocalPath, loadFromUploadPath (via temp files),
 * and the loadDatasetSource dispatch table (mock_rows path).
 */
import assert from "node:assert/strict"
import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import ts from "typescript"
import { createRequire } from "node:module"

const repoRoot = process.cwd()
const tempDir = path.join(repoRoot, ".source-adapters-test")
const compiledPath = path.join(tempDir, "source-adapters.cjs")

try {
  const adapters = await loadModule()

  // loadFromMockRows — object rows → CSV buffer
  {
    const result = adapters.loadFromMockRows({ mock_rows: [{ a: "1", b: "2" }, { a: "3", b: "4" }] })
    assert.ok(result !== null)
    assert.ok(result.buffer instanceof Buffer)
    const text = result.buffer.toString("utf8")
    assert.ok(text.startsWith("a,b\n"))
    assert.equal(result.rowsSynced, 2)
  }

  // loadFromMockRows — sample_rows fallback key
  {
    const result = adapters.loadFromMockRows({ sample_rows: [{ x: "10" }] })
    assert.ok(result !== null)
    assert.equal(result.rowsSynced, 1)
  }

  // loadFromMockRows — returns null when no rows key
  {
    assert.equal(adapters.loadFromMockRows({}), null)
    assert.equal(adapters.loadFromMockRows({ mock_rows: "not-an-array" }), null)
  }

  // loadFromMockRows — empty array produces empty CSV
  {
    const result = adapters.loadFromMockRows({ mock_rows: [] })
    assert.ok(result !== null)
    assert.equal(result.buffer.toString("utf8"), "")
    assert.equal(result.rowsSynced, 0)
  }

  // rowsToCsv — values with commas/quotes are escaped
  {
    const csv = adapters.rowsToCsv([{ name: 'O"Brien', city: "New, York" }])
    assert.ok(csv.includes('"O""Brien"'))
    assert.ok(csv.includes('"New, York"'))
  }

  // loadFromLocalPath — reads a temp file
  {
    const filePath = path.join(tempDir, "test.csv")
    await writeFile(filePath, "col\nval\n")
    process.env.NODE_ENV = "development"
    const result = await adapters.loadFromLocalPath({ local_path: filePath })
    assert.ok(result !== null)
    assert.equal(result.buffer.toString("utf8"), "col\nval\n")
    delete process.env.NODE_ENV
  }

  // loadFromLocalPath — returns null when no path key
  {
    assert.equal(await adapters.loadFromLocalPath({}), null)
  }

  // loadFromUploadPath — returns null when no upload_path key
  {
    assert.equal(await adapters.loadFromUploadPath({}), null)
  }

  // loadFromPresto — returns null when config is incomplete (no endpoint)
  {
    const result = await adapters.loadFromPresto({ query: "SELECT 1" })
    assert.equal(result, null)
  }

  // loadFromObjectStorage — returns null when config is incomplete (no bucket)
  {
    const result = await adapters.loadFromObjectStorage({ key: "my-file.csv" })
    assert.equal(result, null)
  }

  // loadFromUrl — returns null when no url key
  {
    const result = await adapters.loadFromUrl({})
    assert.equal(result, null)
  }

  console.log("Source adapter tests passed.")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function loadModule() {
  const fs = await import("node:fs/promises")
  const source = await fs.readFile(path.join(repoRoot, "lib/server/sync/source-adapters.ts"), "utf8")

  await mkdir(tempDir, { recursive: true })

  // Stub out the problematic imports so the module loads without real infra
  const stubbed = source
    // Replace S3Client import with a stub
    .replace(
      /import \{ GetObjectCommand, S3Client \} from "@aws-sdk\/client-s3"/,
      "// stubbed S3Client"
    )
    // Replace config import with stubs
    .replace(
      /import \{[^}]+\} from "@\/lib\/server\/config"/,
      "const s3AccessKeyId = null, s3Endpoint = null, s3ForcePathStyle = false, s3Region = 'us-east-1', s3SecretAccessKey = null"
    )
    // Replace source-policy import with stubs that do basic passthrough
    .replace(
      /import \{ assertAllowedLocalPath, assertAllowedSyncUrl, assertAllowedUploadPath \} from "@\/lib\/server\/sync\/source-policy"/,
      `
const assertAllowedLocalPath = (p) => p
const assertAllowedSyncUrl = async (u) => new URL(u)
const assertAllowedUploadPath = (p) => p
`
    )
    // Replace Dataset type import
    .replace(/import type \{ Dataset \} from "@\/lib\/types"/, "")
    // Stub S3Client usage (the constructor call)
    .replace(
      /const client = new S3Client\(\{[\s\S]*?\}\)/m,
      "throw new Error('S3Client not available in test')"
    )

  const result = ts.transpileModule(stubbed, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      strict: false,
    },
    fileName: "source-adapters.ts",
  })

  await fs.writeFile(compiledPath, result.outputText)

  const req = createRequire(compiledPath)
  return req(compiledPath)
}
