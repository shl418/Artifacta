#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const tempDir = path.join(repoRoot, ".entrypoint-test")

try {
  const entrypoint = await loadCompiled("lib/server/artifacts/entrypoint.ts", "entrypoint.cjs")
  const errors = await loadCompiled("lib/server/artifacts/errors.ts", "errors.cjs")

  // pickDefaultIndex prefers a root index.html.
  assert.equal(entrypoint.pickDefaultIndex(["pages/index.html", "index.html"]), "index.html")
  // Case-insensitive root match returns the original casing.
  assert.equal(entrypoint.pickDefaultIndex(["Index.HTML"]), "Index.HTML")
  // Falls back to first nested index.html when no root file exists.
  assert.equal(entrypoint.pickDefaultIndex(["docs/about.html", "pages/index.html"]), "pages/index.html")
  // Returns null when no candidate exists.
  assert.equal(entrypoint.pickDefaultIndex(["docs/about.html"]), null)
  assert.equal(entrypoint.pickDefaultIndex([]), null)

  // resolveBundleEntryPath: manifest entry present and matches.
  assert.equal(
    entrypoint.resolveBundleEntryPath({
      htmlFiles: ["index.html", "pages/home.html"],
      defaultIndex: "index.html",
      manifestEntry: "pages/home.html",
    }),
    "pages/home.html",
  )

  // Manifest entry present but missing in bundle → MANIFEST_ENTRYPOINT_MISSING.
  assert.throws(
    () =>
      entrypoint.resolveBundleEntryPath({
        htmlFiles: ["index.html"],
        defaultIndex: "index.html",
        manifestEntry: "pages/home.html",
      }),
    (error) => {
      assert.ok(error instanceof entrypoint.InvalidBundleError)
      assert.equal(error.code, "MANIFEST_ENTRYPOINT_MISSING")
      return true
    },
  )

  // No manifest entry, has default index.
  assert.equal(
    entrypoint.resolveBundleEntryPath({
      htmlFiles: ["index.html"],
      defaultIndex: "index.html",
      manifestEntry: null,
    }),
    "index.html",
  )

  // No manifest entry, only nested index.html.
  assert.equal(
    entrypoint.resolveBundleEntryPath({
      htmlFiles: ["pages/index.html"],
      defaultIndex: "pages/index.html",
      manifestEntry: null,
    }),
    "pages/index.html",
  )

  // Nothing usable → NO_ENTRYPOINT.
  assert.throws(
    () =>
      entrypoint.resolveBundleEntryPath({
        htmlFiles: [],
        defaultIndex: null,
        manifestEntry: null,
      }),
    (error) => {
      assert.ok(error instanceof entrypoint.InvalidBundleError)
      assert.equal(error.code, "NO_ENTRYPOINT")
      return true
    },
  )

  // BundleIncompleteError (B5 placeholder removal): carries a stable code.
  const incomplete = new errors.BundleIncompleteError()
  assert.equal(incomplete.code, "BUNDLE_INCOMPLETE")
  assert.ok(incomplete instanceof Error)
  assert.ok(incomplete.message.length > 0)
  const customMessage = new errors.BundleIncompleteError("bad zip")
  assert.equal(customMessage.message, "bad zip")
  assert.equal(customMessage.code, "BUNDLE_INCOMPLETE")

  console.log("Entrypoint resolution tests passed.")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function loadCompiled(relativeSource, outputName) {
  const source = await readFile(path.join(repoRoot, relativeSource), "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativeSource,
  })

  await mkdir(tempDir, { recursive: true })
  const outputPath = path.join(tempDir, outputName)
  await writeFile(outputPath, compiled.outputText, "utf8")

  const require = createRequire(import.meta.url)
  return require(outputPath)
}
