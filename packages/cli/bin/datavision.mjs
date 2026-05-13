#!/usr/bin/env node
import { promises as fs } from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const command = args[0] ?? "help"

try {
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp()
  } else if (command === "projects") {
    await projectsCommand(args.slice(1))
  } else if (command === "datasets") {
    await datasetsCommand(args.slice(1))
  } else if (command === "upload") {
    await uploadProject(parseOptions(args.slice(1)))
  } else if (command === "sync") {
    await syncCommand(args.slice(1))
  } else {
    throw new Error(`Unknown command: ${command}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}

function printHelp() {
  console.log(`DataVision CLI

Usage:
  datavision projects list [--search text]
  datavision projects upload --file dashboard.html --name "Sales" [--data-file data.csv] [--visibility team]
  datavision projects update-html --project-id proj_x --file dashboard.zip
  datavision datasets list [--source manual|cos|presto]
  datavision datasets upload --project-id proj_x --file data.csv [--name "Sales Data"]
  datavision datasets replace --project-id proj_x --dataset-id ds_x --file data.csv
  datavision datasets sync set --project-id proj_x --dataset-id ds_x --source-type presto --config-file ./sync.json
  datavision sync trigger --project-id proj_x --dataset-id ds_x

Legacy alias:
  datavision upload --file dashboard.html --name "Sales" [--data-file data.csv] [--visibility team]

Environment:
  DATAVISION_URL       Defaults to http://localhost:3000
  DATAVISION_API_KEY   Required for API calls
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

  throw new Error("Usage: datavision projects <list|upload|update-html> ...")
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

  throw new Error("Usage: datavision datasets <list|upload|replace|sync> ...")
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
  console.table(rows)
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
  console.table(rows)
}

async function uploadProject(options) {
  const filePath = requiredOption(options, "file")
  const name = String(options.name ?? path.basename(filePath, path.extname(filePath)))
  const form = new FormData()

  form.append("name", name)
  form.append("description", String(options.description ?? "Uploaded with DataVision CLI"))
  form.append("visibility", String(options.visibility ?? "team"))
  if (options["folder-id"]) form.append("folder_id", String(options["folder-id"]))
  await appendFile(form, "html_file", filePath)

  const dataFiles = arrayOption(options, "data-file").concat(arrayOption(options, "data"))
  for (const dataFile of dataFiles) {
    await appendFile(form, "data_files", dataFile)
  }

  const payload = await request("/projects", { method: "POST", body: form })
  console.log(JSON.stringify({ id: payload.id, name: payload.name, preview_url: payload.preview_url }, null, 2))
}

async function updateProjectHtml(options) {
  const projectId = requiredOption(options, "project-id")
  const filePath = requiredOption(options, "file")
  const form = new FormData()

  await appendFile(form, "html_file", filePath)

  const payload = await request(`/projects/${projectId}/html`, { method: "PUT", body: form })
  console.log(JSON.stringify({ id: payload.id, name: payload.name, preview_url: payload.preview_url }, null, 2))
}

async function uploadDataset(options) {
  const projectId = requiredOption(options, "project-id")
  const filePath = requiredOption(options, "file")
  const form = new FormData()

  if (options.name) form.append("name", String(options.name))
  await appendFile(form, "file", filePath)

  const payload = await request(`/projects/${projectId}/datasets`, { method: "POST", body: form })
  console.log(JSON.stringify({ id: payload.id, name: payload.name, project_id: payload.project_id }, null, 2))
}

async function replaceDataset(options) {
  const projectId = requiredOption(options, "project-id")
  const datasetId = requiredOption(options, "dataset-id")
  const filePath = requiredOption(options, "file")
  const form = new FormData()

  await appendFile(form, "file", filePath)

  const payload = await request(`/projects/${projectId}/datasets/${datasetId}`, { method: "PUT", body: form })
  console.log(JSON.stringify({ id: payload.id, name: payload.name, version: payload.version }, null, 2))
}

async function datasetSyncCommand(syncArgs) {
  const subcommand = syncArgs[0]
  if (subcommand !== "set") {
    throw new Error("Usage: datavision datasets sync set --project-id proj_x --dataset-id ds_x [--source-type presto] [--config-file ./sync.json]")
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

  console.log(JSON.stringify(payload, null, 2))
}

async function syncCommand(syncArgs) {
  const subcommand = syncArgs[0]
  if (subcommand !== "trigger") throw new Error("Usage: datavision sync trigger --project-id proj_x --dataset-id ds_x")

  const options = parseOptions(syncArgs.slice(1))
  const projectId = requiredOption(options, "project-id")
  const datasetId = requiredOption(options, "dataset-id")
  const payload = await request(`/projects/${projectId}/datasets/${datasetId}/sync/trigger`, { method: "POST" })
  console.log(JSON.stringify(payload, null, 2))
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
  const apiKey = process.env.DATAVISION_API_KEY
  if (!apiKey) throw new Error("DATAVISION_API_KEY is required for this command.")

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
  const base = process.env.DATAVISION_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
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