import { spawn } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import type { Database, ProjectSyncScript, ScriptSyncHistory, ScriptSyncHistoryOutput } from "@/lib/types"
import { inspectDataset } from "@/lib/server/datasets"
import { now } from "@/lib/server/db"
import { readStorageObject } from "@/lib/server/object-storage"
import { absoluteUploadPath } from "@/lib/server/config"
import { recordDatasetVersion } from "@/lib/server/versions"
import { findProjectSyncScript } from "@/lib/server/sync/sync-scripts"

const SCRIPT_TIMEOUT_MS = Number(process.env.ARTIFACTA_SCRIPT_TIMEOUT_MS ?? 300_000)
// Cap captured stdout+stderr so a noisy or malicious script cannot OOM the
// server by streaming unbounded output into memory.
const SCRIPT_OUTPUT_LIMIT_BYTES = Number(process.env.ARTIFACTA_SCRIPT_OUTPUT_LIMIT_MB ?? 8) * 1024 * 1024

// The sync subprocess is untrusted (authored by project editors). Pass only the
// environment it needs rather than the parent process env, which may hold the
// database URL, object-storage credentials, and the auth secret.
function buildScriptEnv(bundleRoot: string, script: ProjectSyncScript): Record<string, string> {
  const passthrough = ["PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TMP", "TEMP", "SystemRoot", "ARTIFACTA_PYTHON"]
  const env: Record<string, string> = {}
  for (const key of passthrough) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  env.ARTIFACTA_BUNDLE_ROOT = bundleRoot
  env.ARTIFACTA_OUTPUT_PATHS = script.outputs.join(",")
  env.ARTIFACTA_SCRIPT_ID = script.manifestId
  env.ARTIFACTA_SOURCE_CONFIG = JSON.stringify(script.sourceConfig ?? {})
  return env
}

function bundleAbsoluteRoot(assetRoot: string) {
  return path.resolve(absoluteUploadPath(assetRoot))
}

function resolveBundlePath(bundleRoot: string, relativePath: string) {
  const absolute = path.resolve(bundleRoot, relativePath)
  const relative = path.relative(bundleRoot, absolute)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("SCRIPT_PATH_OUTSIDE_BUNDLE")
  }
  return absolute
}

export function validateScriptSyncPaths(script: ProjectSyncScript, assetRoot: string) {
  const bundleRoot = bundleAbsoluteRoot(assetRoot)
  resolveBundlePath(bundleRoot, script.scriptPath)
  for (const outputPath of script.outputs) {
    resolveBundlePath(bundleRoot, outputPath)
  }
}

export async function probeScriptSync(script: ProjectSyncScript, assetRoot: string) {
  validateScriptSyncPaths(script, assetRoot)
  const bundleRoot = bundleAbsoluteRoot(assetRoot)
  const scriptAbsolute = resolveBundlePath(bundleRoot, script.scriptPath)
  await fs.access(scriptAbsolute)
  return { ok: true as const }
}

interface RunScriptSyncInput {
  projectId: string
  scriptId: string
  userId?: string | null
  jobId: string
}

export async function runScriptSync(database: Database, input: RunScriptSyncInput): Promise<ScriptSyncHistory> {
  const project = database.projects.find((candidate) => candidate.id === input.projectId)
  const script = findProjectSyncScript(database, input.projectId, input.scriptId)
  const startedAt = now()

  if (!project || !script) throw new Error("SCRIPT_NOT_FOUND")
  if (!script.enabled) throw new Error("SCRIPT_DISABLED")

  const assetRoot = project.htmlArtifact.assetRoot
  if (!assetRoot) throw new Error("BUNDLE_ROOT_MISSING")

  validateScriptSyncPaths(script, assetRoot)
  const bundleRoot = bundleAbsoluteRoot(assetRoot)

  const outputResults: ScriptSyncHistoryOutput[] = []
  let status: ScriptSyncHistory["status"] = "success"
  let topLevelError: string | null = null

  try {
    await executeBundledScript(script, bundleRoot)
    for (const outputPath of script.outputs) {
      outputResults.push(await syncScriptOutput(database, project, script, outputPath, input.userId ?? null))
    }
    if (outputResults.some((entry) => entry.status === "failed")) {
      status = "failed"
      topLevelError = "One or more script outputs failed to import."
    }
  } catch (error) {
    status = "failed"
    topLevelError = error instanceof Error ? error.message : "Script execution failed."
    for (const outputPath of script.outputs) {
      if (!outputResults.some((entry) => entry.path === outputPath)) {
        outputResults.push({
          path: outputPath,
          datasetId: null,
          status: "failed",
          rowsSynced: 0,
          error: topLevelError,
        })
      }
    }
  }

  const completedAt = now()
  script.lastRunAt = completedAt
  script.lastRunStatus = status
  script.schedule = null
  script.nextRunAt = null
  script.updatedAt = completedAt

  const history: ScriptSyncHistory = {
    id: `ssync_${crypto.randomUUID()}`,
    projectId: input.projectId,
    scriptId: script.id,
    jobId: input.jobId,
    status,
    startedAt,
    completedAt,
    outputs: outputResults,
    error: topLevelError,
  }

  database.scriptSyncHistory ??= []
  database.scriptSyncHistory.unshift(history)
  database.scriptSyncHistory = database.scriptSyncHistory.slice(0, 500)

  return history
}

async function syncScriptOutput(
  database: Database,
  project: { id: string; htmlArtifact: { assetRoot?: string } },
  script: ProjectSyncScript,
  outputPath: string,
  userId: string | null
): Promise<ScriptSyncHistoryOutput> {
  const assetRoot = project.htmlArtifact.assetRoot
  if (!assetRoot) {
    return { path: outputPath, datasetId: null, status: "failed", rowsSynced: 0, error: "Bundle root missing." }
  }

  const dataset = database.datasets.find(
    (candidate) =>
      candidate.projectId === project.id &&
      candidate.origin === "bundle" &&
      candidate.filePath === path.posix.join(assetRoot, outputPath)
  )

  if (!dataset) {
    return { path: outputPath, datasetId: null, status: "failed", rowsSynced: 0, error: "No matching bundle dataset for output path." }
  }

  try {
    const buffer = await readStorageObject(path.posix.join(assetRoot, outputPath))
    const inspection = inspectDataset(dataset.fileName, buffer)
    dataset.size = buffer.byteLength
    dataset.fileType = inspection.fileType
    dataset.rows = inspection.rows
    dataset.columns = inspection.columns
    dataset.schema = inspection.schema
    dataset.version += 1
    dataset.updatedAt = now()
    recordDatasetVersion(database, dataset, userId)
    return {
      path: outputPath,
      datasetId: dataset.id,
      status: "success",
      rowsSynced: inspection.rows ?? 0,
      error: null,
    }
  } catch (error) {
    return {
      path: outputPath,
      datasetId: dataset.id,
      status: "failed",
      rowsSynced: 0,
      error: error instanceof Error ? error.message : "Failed to import script output.",
    }
  }
}

async function executeBundledScript(script: ProjectSyncScript, bundleRoot: string) {
  const scriptAbsolute = resolveBundlePath(bundleRoot, script.scriptPath)
  await fs.access(scriptAbsolute)

  const runtimeCommand = script.runtime === "python" ? process.env.ARTIFACTA_PYTHON ?? "python3" : process.execPath

  await new Promise<void>((resolve, reject) => {
    const child = spawn(runtimeCommand, [scriptAbsolute], {
      cwd: bundleRoot,
      env: buildScriptEnv(bundleRoot, script) as NodeJS.ProcessEnv,
      // detached so the child leads its own process group and we can SIGKILL the
      // whole group (including any grandchildren it spawned) on timeout/overflow.
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    })

    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      fn()
    }

    const killTree = () => {
      if (child.pid && process.platform !== "win32") {
        try {
          process.kill(-child.pid, "SIGKILL")
          return
        } catch {
          // fall through to direct kill if the group is already gone
        }
      }
      child.kill("SIGKILL")
    }

    const timeout = setTimeout(() => {
      killTree()
      finish(() => reject(new Error("Script execution timed out.")))
    }, SCRIPT_TIMEOUT_MS)

    // Drain both streams. An undrained stdout pipe fills its OS buffer and blocks
    // the child until the timeout fires; capture (bounded) so failures are useful.
    let captured = ""
    let capturedBytes = 0
    let overflowed = false
    const collect = (chunk: Buffer) => {
      capturedBytes += chunk.length
      if (capturedBytes > SCRIPT_OUTPUT_LIMIT_BYTES) {
        if (!overflowed) {
          overflowed = true
          killTree()
          finish(() => reject(new Error("Script output exceeded the allowed size limit.")))
        }
        return
      }
      captured += String(chunk)
    }
    child.stdout?.on("data", collect)
    child.stderr?.on("data", collect)

    child.on("error", (error) => finish(() => reject(error)))

    child.on("close", (code) => {
      finish(() => {
        if (code === 0) resolve()
        else reject(new Error(captured.trim() || `Script exited with code ${code ?? "unknown"}.`))
      })
    })
  })
}
