#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const tempDir = path.join(repoRoot, ".validate-bundle-test")
const moduleAlias = "@/lib/server/artifacts"

const sources = {
  "entrypoint.cjs": "lib/server/artifacts/entrypoint.ts",
  "mime.cjs": "lib/server/artifacts/mime.ts",
  "bundle-validation.cjs": "lib/server/artifacts/bundle-validation.ts",
  "manifest.cjs": "lib/server/artifacts/manifest.ts",
}

try {
  await mkdir(tempDir, { recursive: true })
  for (const [outputName, relativeSource] of Object.entries(sources)) {
    await compile(relativeSource, outputName)
  }

  const require = createRequire(import.meta.url)
  const entrypoint = require(path.join(tempDir, "entrypoint.cjs"))
  const validation = require(path.join(tempDir, "bundle-validation.cjs"))
  const manifest = require(path.join(tempDir, "manifest.cjs"))

  // No errors when one HTML file plus a CSV dataset.
  const happy = validation.validateBundleForHosting({
    htmlFiles: ["index.html"],
    manifest: manifest.parseArtifactManifest({
      schema_version: 1,
      name: "Sales",
      entrypoint: "index.html",
      datasets: [{ id: "sales", name: "Sales", kind: "csv", path: "data/sales.csv" }],
    }),
    entryPath: "index.html",
  })
  assert.equal(happy.errors.length, 0, "single HTML + CSV bundle must produce no errors")
  assert.equal(happy.warnings.length, 0, "CSV dataset must not raise MIME fallback warning")

  // Multiple HTML files -> MULTIPLE_HTML_FILES error.
  const multi = validation.validateBundleForHosting({
    htmlFiles: ["index.html", "pages/extra.html"],
    manifest: null,
    entryPath: "index.html",
  })
  assert.equal(multi.errors.length, 1, "multiple .html files must produce exactly one error")
  assert.equal(multi.errors[0].code, "MULTIPLE_HTML_FILES")
  assert.ok(/pages\/extra\.html/.test(multi.errors[0].message), "error message must list the offending files")

  // Dataset path with unmapped extension -> DATASET_MIME_FALLBACK warning.
  const fallback = validation.validateBundleForHosting({
    htmlFiles: ["index.html"],
    manifest: manifest.parseArtifactManifest({
      schema_version: 1,
      name: "Fallback",
      entrypoint: "index.html",
      datasets: [{ id: "raw", name: "Raw", kind: "other", path: "data/raw.parquet" }],
    }),
    entryPath: "index.html",
  })
  assert.equal(fallback.errors.length, 0)
  assert.equal(fallback.warnings.length, 1)
  assert.equal(fallback.warnings[0].code, "DATASET_MIME_FALLBACK")
  assert.equal(fallback.warnings[0].path, "data/raw.parquet")

  // throwOnBundleHostingErrors raises InvalidBundleError with the first code.
  assert.throws(
    () => validation.throwOnBundleHostingErrors(multi),
    (error) => {
      assert.ok(error instanceof entrypoint.InvalidBundleError)
      assert.equal(error.code, "MULTIPLE_HTML_FILES")
      assert.deepEqual(
        error.issues.map((issue) => issue.code),
        ["MULTIPLE_HTML_FILES"],
      )
      return true
    },
  )

  // No-op when only warnings exist.
  validation.throwOnBundleHostingErrors(fallback)

  // Manifest superRefine catches kind/extension mismatch.
  assert.throws(
    () =>
      manifest.parseArtifactManifest({
        schema_version: 1,
        name: "Mismatch",
        entrypoint: "index.html",
        datasets: [{ id: "sales", name: "Sales", kind: "csv", path: "data/sales.json" }],
      }),
    /DATASET_KIND_EXTENSION_MISMATCH/,
  )

  // kind: "other" remains a permitted escape hatch for unknown extensions.
  manifest.parseArtifactManifest({
    schema_version: 1,
    name: "Other",
    entrypoint: "index.html",
    datasets: [{ id: "raw", name: "Raw", kind: "other", path: "data/raw.parquet" }],
  })

  console.log("validateBundleForHosting tests passed.")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function compile(relativeSource, outputName) {
  const source = await readFile(path.join(repoRoot, relativeSource), "utf8")
  const rewritten = source.replace(/from "@\/lib\/server\/artifacts\/(\w[\w-]*)"/g, (_match, name) => `from "./${name}.cjs"`)
  const compiled = ts.transpileModule(rewritten, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativeSource,
  })
  await writeFile(path.join(tempDir, outputName), compiled.outputText, "utf8")
}
