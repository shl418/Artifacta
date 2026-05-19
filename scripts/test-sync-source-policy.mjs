#!/usr/bin/env node
import assert from "node:assert/strict"
import dns from "node:dns/promises"
import { createRequire } from "node:module"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const sourcePath = path.join(repoRoot, "lib/server/sync/source-policy.ts")
const tempDir = path.join(repoRoot, ".sync-source-policy-test")
const compiledPath = path.join(tempDir, "source-policy.cjs")
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  SYNC_URL_ALLOWLIST: process.env.SYNC_URL_ALLOWLIST,
  SYNC_LOCAL_BASE_DIR: process.env.SYNC_LOCAL_BASE_DIR,
}
const originalLookup = dns.lookup

try {
  const sourcePolicy = await loadSourcePolicy()

  await withLookup([{ address: "8.8.8.8", family: 4 }], async () => {
    await withEnv({ SYNC_URL_ALLOWLIST: "data.example.com" }, async () => {
      assert.equal((await sourcePolicy.assertAllowedSyncUrl("https://data.example.com/feed.csv")).hostname, "data.example.com")
      await assert.rejects(
        sourcePolicy.assertAllowedSyncUrl("https://other.example.com/feed.csv"),
        /allowlist|not allowed/i,
      )
    })
  })

  await withLookup([{ address: "10.0.0.5", family: 4 }], async () => {
    await withEnv({ SYNC_URL_ALLOWLIST: "data.example.com" }, async () => {
      await assert.rejects(sourcePolicy.assertAllowedSyncUrl("https://data.example.com/feed.csv"), /private|DNS|link-local/i)
    })
  })

  for (const rawUrl of ["file:///tmp/source.csv", "ftp://example.com/source.csv", "gopher://example.com/source.csv"]) {
    await assert.rejects(sourcePolicy.assertAllowedSyncUrl(rawUrl), /protocol|unsupported/i)
  }

  for (const rawUrl of [
    "http://localhost/source.csv",
    "http://app.localhost/source.csv",
    "http://127.0.0.1/source.csv",
    "http://10.1.2.3/source.csv",
    "http://192.168.1.10/source.csv",
    "http://172.16.0.1/source.csv",
    "http://172.31.255.255/source.csv",
    "http://169.254.10.20/source.csv",
    "http://0.0.0.0/source.csv",
    "http://100.64.0.1/source.csv",
    "http://198.18.0.1/source.csv",
    "http://203.0.113.10/source.csv",
    "http://224.0.0.1/source.csv",
    "http://[::1]/source.csv",
    "http://[::]/source.csv",
    "http://[fe80::1]/source.csv",
    "http://[fc00::1]/source.csv",
    "http://[fd00::1]/source.csv",
    "http://[::ffff:127.0.0.1]/source.csv",
    "http://[ff00::1]/source.csv",
    "http://[2001:db8::1]/source.csv",
  ]) {
    await assert.rejects(sourcePolicy.assertAllowedSyncUrl(rawUrl), /private|localhost|link-local/i)
  }

  await withEnv({ NODE_ENV: "production", SYNC_URL_ALLOWLIST: "" }, async () => {
    await assert.rejects(
      sourcePolicy.assertAllowedSyncUrl("https://data.example.com/feed.csv"),
      /production|allowlist|remote URL sync/i,
    )
  })

  await withLookup([{ address: "8.8.8.8", family: 4 }], async () => {
    await withEnv({ NODE_ENV: "development", SYNC_URL_ALLOWLIST: "" }, async () => {
      assert.equal((await sourcePolicy.assertAllowedSyncUrl("https://public.example.com/feed.csv")).hostname, "public.example.com")
    })
  })

  await withLookup([{ address: "10.0.0.5", family: 4 }], async () => {
    await assert.rejects(sourcePolicy.assertAllowedSyncUrl("https://private.example.com/feed.csv"), /private|DNS/i)
  })

  const baseDir = path.join(os.tmpdir(), "artifacta-sync-policy-base")
  const insidePath = path.join(baseDir, "nested", "source.csv")
  const outsidePath = path.join(os.tmpdir(), "artifacta-sync-policy-outside.csv")
  const symlinkBaseDir = await mkdtemp(path.join(os.tmpdir(), "artifacta-sync-policy-base-"))
  const symlinkTargetDir = await mkdtemp(path.join(os.tmpdir(), "artifacta-sync-policy-target-"))
  const symlinkTargetFile = path.join(symlinkTargetDir, "secret.csv")
  const symlinkPath = path.join(symlinkBaseDir, "linked-secret.csv")
  await writeFile(symlinkTargetFile, "secret\n")
  await symlink(symlinkTargetFile, symlinkPath)

  withEnvSync({ SYNC_LOCAL_BASE_DIR: baseDir }, () => {
    assert.equal(sourcePolicy.assertAllowedLocalPath(insidePath), path.normalize(insidePath))
    assert.equal(sourcePolicy.assertAllowedLocalPath(baseDir), path.normalize(baseDir))
    assert.throws(() => sourcePolicy.assertAllowedLocalPath(outsidePath), /base directory|outside/i)
  })

  withEnvSync({ SYNC_LOCAL_BASE_DIR: symlinkBaseDir }, () => {
    assert.throws(() => sourcePolicy.assertAllowedLocalPath(symlinkPath), /base directory|outside/i)
  })

  assert.throws(() => sourcePolicy.assertAllowedUploadPath("../artifacta.json"), /upload|outside|traversal/i)
  assert.throws(() => sourcePolicy.assertAllowedUploadPath("/etc/passwd"), /upload|outside|traversal/i)
  assert.match(sourcePolicy.assertAllowedUploadPath("projects/proj_1/data.csv"), /projects/)

  withEnvSync({ NODE_ENV: "production", SYNC_LOCAL_BASE_DIR: "" }, () => {
    assert.throws(() => sourcePolicy.assertAllowedLocalPath(insidePath), /production|base directory|local file sync/i)
  })

  for (const restrictedPath of [
    "/etc/passwd",
    "/proc/cpuinfo",
    "/sys/kernel",
    "/dev/null",
    "C:\\Windows\\System32\\drivers\\etc\\hosts",
    "C:/Windows/System32/drivers/etc/hosts",
  ]) {
    assert.throws(() => sourcePolicy.assertAllowedLocalPath(restrictedPath), /restricted|system/i)
  }

  console.log("Sync source policy tests passed.")
} finally {
  dns.lookup = originalLookup
  restoreEnv()
  await rm(tempDir, { recursive: true, force: true })
}

async function loadSourcePolicy() {
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

async function withEnv(overrides, fn) {
  setEnv(overrides)
  try {
    await fn()
  } finally {
    restoreEnv()
  }
}

function withEnvSync(overrides, fn) {
  setEnv(overrides)

  try {
    return fn()
  } finally {
    restoreEnv()
  }
}

async function withLookup(addresses, fn) {
  dns.lookup = async () => addresses
  try {
    await fn()
  } finally {
    dns.lookup = originalLookup
  }
}

function setEnv(overrides) {
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value
  }
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

