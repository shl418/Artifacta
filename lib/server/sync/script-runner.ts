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
const SCRIPT_RSS_LIMIT_BYTES = Number(process.env.ARTIFACTA_SCRIPT_RSS_LIMIT_MB ?? 512) * 1024 * 1024

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
  const runtimeArgs = script.runtime === "python" ? [scriptAbsolute] : [scriptAbsolute]

  await new Promise<void>((resolve, reject) => {
    const child = spawn(runtimeCommand, runtimeArgs, {
      cwd: bundleRoot,
      env: {
        ...process.env,
        ARTIFACTA_BUNDLE_ROOT: bundleRoot,
        ARTIFACTA_OUTPUT_PATHS: script.outputs.join(","),
        ARTIFACTA_SCRIPT_ID: script.manifestId,
        ARTIFACTA_SOURCE_CONFIG: JSON.stringify(script.sourceConfig ?? {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    })

    const timeout = setTimeout(() => {
      child.kill("SIGKILL")
      reject(new Error("Script execution timed out."))
    }, SCRIPT_TIMEOUT_MS)

    let stderr = ""
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })

    child.on("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })

    child.on("close", (code) => {
      clearTimeout(timeout)
      void SCRIPT_RSS_LIMIT_BYTES
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `Script exited with code ${code ?? "unknown"}.`))
    })
  })
}
