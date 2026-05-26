#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const tempDir = path.join(repoRoot, ".asset-routing-test")

const sources = {
  "mime.cjs": "lib/server/artifacts/mime.ts",
  "zip-security.cjs": "lib/server/artifacts/zip-security.ts",
  "asset-routing.cjs": "lib/server/artifacts/asset-routing.ts",
}

try {
  await mkdir(tempDir, { recursive: true })
  for (const [outputName, relativeSource] of Object.entries(sources)) {
    await compile(relativeSource, outputName)
  }

  const require = createRequire(import.meta.url)
  const routing = require(path.join(tempDir, "asset-routing.cjs"))

  const zipProject = {
    htmlArtifact: { kind: "zip", originalName: "b.zip", path: "p/b.zip", size: 1, contentType: "application/zip", assetRoot: "projects/p/bundle", entryPath: "index.html" },
  }
  const htmlOnlyProject = {
    htmlArtifact: { kind: "html", originalName: "i.html", path: "p/i.html", size: 1, contentType: "text/html" },
  }
  const zipWithoutAssetRoot = {
    htmlArtifact: { kind: "zip", originalName: "b.zip", path: "p/b.zip", size: 1, contentType: "application/zip" },
  }

  // Ready: a normal CSS request resolves to a serveable asset path.
  const ready = routing.classifyDashboardAssetRequest(zipProject, ["assets", "styles.css"])
  assert.equal(ready.kind, "ready")
  assert.equal(ready.assetRoot, "projects/p/bundle")
  assert.equal(ready.safePath, "assets/styles.css")

  // Blocked: single-file HTML upload has no asset route.
  const htmlOnly = routing.classifyDashboardAssetRequest(htmlOnlyProject, ["assets", "styles.css"])
  assert.deepEqual(htmlOnly, { kind: "blocked", reason: "not_zip_bundle" })

  // Blocked: ZIP project without assetRoot (incomplete metadata) is treated as not-zip.
  const incomplete = routing.classifyDashboardAssetRequest(zipWithoutAssetRoot, ["assets", "styles.css"])
  assert.deepEqual(incomplete, { kind: "blocked", reason: "not_zip_bundle" })

  // Blocked: sibling .html requests are refused so the agent learns Artifacta serves only the entrypoint.
  const sibling = routing.classifyDashboardAssetRequest(zipProject, ["pages", "extra.html"])
  assert.deepEqual(sibling, { kind: "blocked", reason: "html_sibling" })
  const siblingHtm = routing.classifyDashboardAssetRequest(zipProject, ["pages", "extra.htm"])
  assert.deepEqual(siblingHtm, { kind: "blocked", reason: "html_sibling" })

  // Missing: zip-security strips traversal and reserved metadata names.
  const traversal = routing.classifyDashboardAssetRequest(zipProject, ["..", "..", "secret.txt"])
  assert.equal(traversal.kind, "missing")

  console.log("Asset routing tests passed.")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function compile(relativeSource, outputName) {
  const source = await readFile(path.join(repoRoot, relativeSource), "utf8")
  const rewritten = source
    .replace(/from "@\/lib\/server\/artifacts\/(\w[\w-]*)"/g, (_match, name) => `from "./${name}.cjs"`)
    .replace(/from "@\/lib\/types"/g, "from \"./_types.cjs\"")
  const compiled = ts.transpileModule(rewritten, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativeSource,
  })
  await writeFile(path.join(tempDir, outputName), compiled.outputText, "utf8")
  // Provide an empty types shim so the asset-routing module loads without
  // pulling in app type definitions.
  await writeFile(path.join(tempDir, "_types.cjs"), "module.exports = {}\n", "utf8")
}
