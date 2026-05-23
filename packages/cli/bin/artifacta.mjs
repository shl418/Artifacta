#!/usr/bin/env node
import { promises as fs } from "node:fs"
import { execFile } from "node:child_process"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const args = process.argv.slice(2)
const jsonOutput = consumeBooleanFlag(args, "json")
const command = args[0] ?? "help"

try {
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp()
  } else if (command === "projects") {
    await projectsCommand(args.slice(1))
  } else if (command === "datasets") {
    await datasetsCommand(args.slice(1))
  } else if (command === "doctor") {
    await doctorCommand(parseOptions(args.slice(1)))
  } else if (command === "upload") {
    await uploadProject(parseOptions(args.slice(1)))
  } else if (command === "sync") {
    await syncCommand(args.slice(1))
  } else {
    throw new Error(`Unknown command: ${command}`)
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  if (jsonOutput) console.error(JSON.stringify({ ok: false, error: { message } }, null, 2))
  else console.error(message)
  process.exitCode = 1
}

function printHelp() {
  console.log(`Artifacta CLI

Usage:
  artifacta --json <command>
  artifacta doctor [--app-url http://localhost:3000]
  artifacta projects list [--search text]
  artifacta projects upload --file dashboard.html --name "Sales" [--data-file data.csv] [--visibility team]
  artifacta projects update-html --project-id proj_x --file dashboard.zip
  artifacta datasets list [--source manual|cos|presto]
  artifacta datasets upload --project-id proj_x --file data.csv [--name "Sales Data"]
  artifacta datasets replace --project-id proj_x --dataset-id ds_x --file data.csv
  artifacta datasets sync set --project-id proj_x --dataset-id ds_x --source-type presto --config-file ./sync.json
  artifacta sync trigger --project-id proj_x --dataset-id ds_x

Legacy alias:
  artifacta upload --file dashboard.html --name "Sales" [--data-file data.csv] [--visibility team]

Environment:
  ARTIFACTA_URL       Defaults to http://localhost:3000
  ARTIFACTA_API_KEY   Required for API calls
`)
}

async function projectsCommand(projectArgs) {
  const subcommand = projectArgs[0] ?? "list"

  if (subcommand === "list") {
    await listProjects(parseOptions(projectArgs.slice(1)))
    return
  }

  if (subcommand === "upload") {
    await uploadProject(parseOptions(projectArgs.slice(1)))
    return
  }

  if (subcommand === "update-html") {
    await updateProjectHtml(parseOptions(projectArgs.slice(1)))
    return
  }

  throw new Error("Usage: artifacta projects <list|upload|update-html> ...")
}

async function datasetsCommand(datasetArgs) {
  const subcommand = datasetArgs[0] ?? "list"

  if (subcommand === "list") {
    await listDatasets(parseOptions(datasetArgs.slice(1)))
    return
  }

  if (subcommand === "upload") {
    await uploadDataset(parseOptions(datasetArgs.slice(1)))
    return
  }

  if (subcommand === "replace") {
    await replaceDataset(parseOptions(datasetArgs.slice(1)))
    return
  }

  if (subcommand === "sync") {
    await datasetSyncCommand(datasetArgs.slice(1))
    return
  }

  throw new Error("Usage: artifacta datasets <list|upload|replace|sync> ...")
}

async function listProjects(options) {
  const params = new URLSearchParams()
  if (options.search) params.set("search", String(options.search))
  const payload = await request(`/projects?${params.toString()}`)
  const rows = payload.data.map((project) => ({
    id: project.id,
    name: project.name,
    visibility: project.visibility,
    views: project.views_count,
    updated: project.updated_at,
  }))
  printOutput({ data: rows, pagination: payload.pagination ?? null }, () => console.table(rows))
}

async function listDatasets(options) {
  const params = new URLSearchParams()
  if (options.source) params.set("source", String(options.source))
  const payload = await request(`/datasets?${params.toString()}`)
  const rows = payload.data.map((dataset) => ({
    id: dataset.id,
    project: dataset.project.name,
    name: dataset.name,
    source: dataset.sync_config.source_type,
    status: dataset.sync_config.last_sync_status ?? "pending",
    rows: dataset.rows ?? "?",
  }))
  printOutput({ data: rows }, () => console.table(rows))
}

async function uploadProject(options) {
  const filePath = requiredOption(options, "file")
  const name = String(options.name ?? path.basename(filePath, path.extname(filePath)))
  const form = new FormData()

  form.append("name", name)
  form.append("description", String(options.description ?? "Uploaded with Artifacta CLI"))
  form.append("visibility", String(options.visibility ?? "team"))
  if (options["folder-id"]) form.append("folder_id", String(options["folder-id"]))
  await appendFile(form, "html_file", filePath)

  const dataFiles = arrayOption(options, "data-file").concat(arrayOption(options, "data"))
  for (const dataFile of dataFiles) {
    await appendFile(form, "data_files", dataFile)
  }

  const payload = await request("/projects", { method: "POST", body: form })
  const result = { id: payload.id, name: payload.name, preview_url: payload.preview_url }
  printOutput(result, () => printSummary("Project published", result))
}

async function updateProjectHtml(options) {
  const projectId = requiredOption(options, "project-id")
  const filePath = requiredOption(options, "file")
  const form = new FormData()

  await appendFile(form, "html_file", filePath)

  const payload = await request(`/projects/${projectId}/html`, { method: "PUT", body: form })
  const result = { id: payload.id, name: payload.name, preview_url: payload.preview_url }
  printOutput(result, () => printSummary("Project HTML updated", result))
}

async function uploadDataset(options) {
  const projectId = requiredOption(options, "project-id")
  const filePath = requiredOption(options, "file")
  const form = new FormData()

  if (options.name) form.append("name", String(options.name))
  await appendFile(form, "file", filePath)

  const payload = await request(`/projects/${projectId}/datasets`, { method: "POST", body: form })
  const result = { id: payload.id, name: payload.name, project_id: payload.project_id }
  printOutput(result, () => printSummary("Dataset uploaded", result))
}

async function replaceDataset(options) {
  const projectId = requiredOption(options, "project-id")
  const datasetId = requiredOption(options, "dataset-id")
  const filePath = requiredOption(options, "file")
  const form = new FormData()

  await appendFile(form, "file", filePath)

  const payload = await request(`/projects/${projectId}/datasets/${datasetId}`, { method: "PUT", body: form })
  const result = { id: payload.id, name: payload.name, version: payload.version }
  printOutput(result, () => printSummary("Dataset replaced", result))
}

async function datasetSyncCommand(syncArgs) {
  const subcommand = syncArgs[0]
  if (subcommand !== "set") {
    throw new Error("Usage: artifacta datasets sync set --project-id proj_x --dataset-id ds_x [--source-type presto] [--config-file ./sync.json]")
  }

  const options = parseOptions(syncArgs.slice(1))
  const projectId = requiredOption(options, "project-id")
  const datasetId = requiredOption(options, "dataset-id")
  const sourceType = String(options["source-type"] ?? options.source ?? "manual")
  const body = {
    enabled: resolveSyncEnabled(options, sourceType),
    source_type: sourceType,
    source_config: await readJsonConfig(options),
    update_mode: String(options["update-mode"] ?? "full"),
    schedule: sourceType === "manual" ? null : optionalString(options, "schedule") ?? "0 8 * * *",
    next_sync_at: optionalString(options, "next-sync-at") ?? undefined,
  }

  const payload = await request(`/projects/${projectId}/datasets/${datasetId}/sync`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  printOutput(payload, () => printSummary("Sync config saved", payload))
}

async function syncCommand(syncArgs) {
  const subcommand = syncArgs[0]
  if (subcommand !== "trigger") throw new Error("Usage: artifacta sync trigger --project-id proj_x --dataset-id ds_x")

  const options = parseOptions(syncArgs.slice(1))
  const projectId = requiredOption(options, "project-id")
  const datasetId = requiredOption(options, "dataset-id")
  const payload = await request(`/projects/${projectId}/datasets/${datasetId}/sync/trigger`, { method: "POST" })
  printOutput(payload, () => printSummary("Sync queued", payload))
}

async function doctorCommand(options) {
  const checks = []
  checks.push({
    name: "node",
    ok: Number(process.versions.node.split(".")[0]) >= 22,
    details: `v${process.versions.node}`,
  })

  try {
    const { stdout } = await execFileAsync("pnpm", ["-v"])
    checks.push({ name: "pnpm", ok: true, details: stdout.trim() })
  } catch {
    checks.push({ name: "pnpm", ok: false, details: "pnpm was not found on PATH" })
  }

  const appUrl = String(options["app-url"] ?? process.env.ARTIFACTA_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
  checks.push({ name: "app_url", ok: /^https?:\/\//.test(appUrl), details: appUrl })
  checks.push({
    name: "api_key",
    ok: Boolean(process.env.ARTIFACTA_API_KEY),
    details: process.env.ARTIFACTA_API_KEY ? "ARTIFACTA_API_KEY is set" : "ARTIFACTA_API_KEY is missing",
  })

  const connectivity = await checkConnectivity(appUrl)
  checks.push(connectivity)

  const ok = checks.every((check) => check.ok)
  const result = { ok, checks }
  printOutput(result, () => {
    console.log("Artifacta doctor")
    for (const check of checks) {
      console.log(`${check.ok ? "ok" : "fail"}  ${check.name.padEnd(12)} ${check.details}`)
    }
  })
  if (!ok) process.exitCode = 1
}

async function checkConnectivity(appUrl) {
  const base = appUrl.replace(/\/api\/v1\/?$/, "").replace(/\/+$/, "")
  const apiKey = process.env.ARTIFACTA_API_KEY
  const target = apiKey ? `${base}/api/v1/projects?per_page=1` : base

  try {
    const response = await fetch(target, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    })
    const ok = apiKey ? response.ok : response.status < 500
    return {
      name: "connectivity",
      ok,
      details: `${target} -> ${response.status}`,
    }
  } catch (error) {
    return {
      name: "connectivity",
      ok: false,
      details: error instanceof Error ? error.message : "request failed",
    }
  }
}

async function readJsonConfig(options) {
  const filePath = optionalString(options, "config-file")
  const inlineJson = optionalString(options, "config-json") ?? optionalString(options, "config")
  let config = {}

  if (filePath) {
    config = parseJsonObject(await fs.readFile(path.resolve(filePath), "utf8"), `--config-file ${filePath}`)
  }

  if (inlineJson) {
    config = { ...config, ...parseJsonObject(inlineJson, "--config-json") }
  }

  return config
}

function resolveSyncEnabled(options, sourceType) {
  if (options.disabled || options.disable) return false
  if (options.enabled || options.enable) return sourceType !== "manual"
  return sourceType !== "manual"
}

async function appendFile(form, field, filePath) {
  const absolutePath = path.resolve(filePath)
  const buffer = await fs.readFile(absolutePath)
  form.append(field, new Blob([buffer], { type: contentTypeForPath(absolutePath) }), path.basename(absolutePath))
}

async function request(route, init = {}) {
  const apiKey = process.env.ARTIFACTA_API_KEY
  if (!apiKey) throw new Error("ARTIFACTA_API_KEY is required for this command.")

  const response = await fetch(`${apiBase()}${route}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers ?? {}),
    },
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) {
    const message = payload?.error?.message ?? `Request failed with ${response.status}`
    throw new Error(message)
  }
  return payload
}

function apiBase() {
  const base = process.env.ARTIFACTA_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  return base.replace(/\/api\/v1\/?$/, "").replace(/\/+$/, "") + "/api/v1"
}

function parseOptions(optionArgs) {
  const options = {}
  for (let index = 0; index < optionArgs.length; index += 1) {
    const token = optionArgs[index]
    if (!token.startsWith("--")) continue

    const key = token.slice(2)
    const next = optionArgs[index + 1]
    const value = !next || next.startsWith("--") ? true : next
    if (value !== true) index += 1

    if (options[key] === undefined) options[key] = value
    else if (Array.isArray(options[key])) options[key].push(value)
    else options[key] = [options[key], value]
  }
  return options
}

function consumeBooleanFlag(optionArgs, name) {
  const flag = `--${name}`
  const index = optionArgs.indexOf(flag)
  if (index === -1) return false
  optionArgs.splice(index, 1)
  return true
}

function printOutput(value, humanPrinter) {
  if (jsonOutput) {
    console.log(JSON.stringify(value, null, 2))
    return
  }
  humanPrinter()
}

function printSummary(title, value) {
  console.log(title)
  for (const [key, entryValue] of Object.entries(value)) {
    console.log(`${key}: ${entryValue ?? ""}`)
  }
}

function requiredOption(options, name) {
  const value = options[name]
  if (!value || Array.isArray(value)) throw new Error(`--${name} is required.`)
  return String(value)
}

function optionalString(options, name) {
  const value = options[name]
  if (value === undefined || value === true || Array.isArray(value)) return null
  return String(value)
}

function arrayOption(options, name) {
  const value = options[name]
  if (!value) return []
  return Array.isArray(value) ? value.map(String) : [String(value)]
}

function parseJsonObject(value, label) {
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`${label} must be valid JSON.`)
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`)
  }

  return parsed
}

function contentTypeForPath(filePath) {
  const extension = path.extname(filePath).slice(1).toLowerCase()
  return {
    csv: "text/csv",
    html: "text/html",
    json: "application/json",
    zip: "application/zip",
  }[extension] ?? "application/octet-stream"
}
