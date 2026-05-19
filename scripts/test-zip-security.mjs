#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import AdmZip from "adm-zip"
import ts from "typescript"

const repoRoot = process.cwd()
const sourcePath = path.join(repoRoot, "lib/server/artifacts/zip-security.ts")
const tempDir = path.join(repoRoot, ".zip-security-test")
const compiledPath = path.join(tempDir, "zip-security.cjs")

try {
  const zipSecurity = await loadZipSecurity()

  assert.equal(zipSecurity.normalizeBundleEntry("dashboards/index.html"), "dashboards/index.html")
  assert.equal(zipSecurity.normalizeBundleEntry("assets\\charts\\main.js"), "assets/charts/main.js")
  assert.equal(zipSecurity.normalizeBundleEntry("__MACOSX/._index.html"), null)

  for (const unsafePath of [
    "",
    ".",
    "/absolute/index.html",
    "\\absolute\\index.html",
    "../index.html",
    "dashboards/../index.html",
    "dashboards/../../index.html",
    "C:/index.html",
    "C:\\index.html",
    "C:index.html",
  ]) {
    assert.equal(zipSecurity.normalizeBundleEntry(unsafePath), null)
  }

  assert.throws(() => zipSecurity.validateZipBundle(zipWithFiles([["../index.html", "oops"]])), /path|traversal|absolute/i)
  assert.throws(() => zipSecurity.validateZipBundle(zipWithFiles([["__MACOSX/../index.html", "oops"]])), /path|traversal|absolute/i)

  assert.doesNotThrow(() => zipSecurity.validateZipBundle(zipWithFiles([["__MACOSX/._index.html", "metadata"]])))
  assert.throws(() => zipSecurity.validateZipBundle(zipWithFiles([["__MACOSX/tool.exe", "blocked"]])), /unsafe|blocked|executable|script/i)

  for (const blockedPath of [
    "bin/tool.exe",
    "bin/library.dll",
    "scripts/install.bat",
    "scripts/install.cmd",
    "scripts/deploy.ps1",
    "scripts/deploy.sh",
    "lib/app.jar",
  ]) {
    assert.throws(() => zipSecurity.validateZipBundle(zipWithFiles([[blockedPath, "blocked"]])), /blocked|executable|script/i)
  }

  withLimits(zipSecurity.zipSecurityLimits, { maxEntries: 1 }, () => {
    assert.throws(
      () =>
        zipSecurity.validateZipBundle(
          zipWithFiles([
            ["index.html", "<html></html>"],
            ["assets/app.js", "console.log('app')"],
          ]),
        ),
      /entries/i,
    )
  })

  withLimits(zipSecurity.zipSecurityLimits, { maxEntryBytes: 5 }, () => {
    assert.throws(() => zipSecurity.validateZipBundle(zipWithFiles([["index.html", "123456"]])), /entry|size|bytes/i)
  })

  withLimits(zipSecurity.zipSecurityLimits, { maxTotalBytes: 10 }, () => {
    assert.throws(
      () =>
        zipSecurity.validateZipBundle(
          zipWithFiles([
            ["index.html", "123456"],
            ["assets/app.js", "123456"],
          ]),
        ),
      /total|size|bytes/i,
    )
  })

  console.log("ZIP security tests passed.")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function loadZipSecurity() {
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

function zipWithFiles(files) {
  const zip = new AdmZip()
  files.forEach(([entryName, content], index) => {
    zip.addFile(`entry-${index}`, Buffer.from(content))
    zip.getEntries()[index].entryName = entryName
  })
  return zip
}

function withLimits(limits, overrides, fn) {
  const original = {}
  for (const key of Object.keys(overrides)) {
    original[key] = limits[key]
    limits[key] = overrides[key]
  }

  try {
    fn()
  } finally {
    for (const key of Object.keys(overrides)) {
      limits[key] = original[key]
    }
  }
}
