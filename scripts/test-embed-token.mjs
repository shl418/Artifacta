#!/usr/bin/env node
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const tempDir = path.join(repoRoot, ".embed-token-test")

try {
  const embed = await loadEmbed()
  const token = embed.createEmbedToken("proj_smoke", 120)
  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)

  const request = new Request(`http://localhost/embed/proj_smoke?embed_token=${encodeURIComponent(token)}`)
  assert.equal(embed.verifyEmbedToken(embed.embedTokenFromRequest(request), "proj_smoke"), true)
  assert.equal(embed.verifyEmbedToken(token, "proj_other"), false)
  assert.equal(embed.verifyEmbedToken("not-a-token", "proj_smoke"), false)

  const url = new URL(embed.embedUrl("proj_smoke", token))
  assert.equal(url.pathname, "/embed/proj_smoke")
  assert.equal(url.searchParams.get("token"), token)

  console.log("Embed token tests passed.")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function loadEmbed() {
  await rm(tempDir, { recursive: true, force: true })
  const aliasRoot = path.join(tempDir, "node_modules", "@", "lib", "server")
  await mkdir(aliasRoot, { recursive: true })
  await compileTs(path.join(repoRoot, "lib/server/config.ts"), path.join(aliasRoot, "config.js"))
  await compileTs(path.join(repoRoot, "lib/server/cookies.ts"), path.join(aliasRoot, "cookies.js"))
  await compileTs(path.join(repoRoot, "lib/server/embed.ts"), path.join(aliasRoot, "embed.js"))

  const require = createRequire(path.join(tempDir, "loader.cjs"))
  return require(path.join(aliasRoot, "embed.js"))
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
