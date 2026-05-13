#!/usr/bin/env node
const args = process.argv.slice(2)
const options = parseOptions(args)

if (options.help || options.h) {
  printHelp()
  process.exit(0)
}

try {
  if (options.once || options.all || !options.interval) {
    await runOnce(options)
  } else {
    const intervalSeconds = Number(options.interval)
    if (!Number.isFinite(intervalSeconds) || intervalSeconds < 10) throw new Error("--interval must be at least 10 seconds.")
    await runLoop(options, intervalSeconds)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}

function printHelp() {
  console.log(`Artifacta sync worker

Usage:
  pnpm worker:once
  node scripts/sync-worker.mjs --once [--all] [--dry-run]
  node scripts/sync-worker.mjs --interval 60

Environment:
  ARTIFACTA_URL       Defaults to http://localhost:3000
  ARTIFACTA_API_KEY   Required
`)
}

async function runLoop(options, intervalSeconds) {
  console.log(`Artifacta worker started. interval=${intervalSeconds}s`)
  while (true) {
    await runOnce(options)
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000))
  }
}

async function runOnce(options) {
  const payload = await request("/datasets")
  const datasets = payload.data.filter((dataset) => dataset.sync_config.enabled)
  const dueDatasets = datasets.filter((dataset) => options.all || isDue(dataset))

  if (dueDatasets.length === 0) {
    console.log("No datasets due for sync.")
    return
  }

  for (const dataset of dueDatasets) {
    const label = `${dataset.project.name}/${dataset.name}`
    if (options["dry-run"]) {
      console.log(`DRY RUN sync ${label}`)
      continue
    }

    const result = await request(`/projects/${dataset.project_id}/datasets/${dataset.id}/sync/trigger`, { method: "POST" })
    console.log(`SYNC ${label} -> ${result.status} rows=${result.rows_synced}`)
  }
}

function isDue(dataset) {
  const nextSyncAt = dataset.sync_config.next_sync_at
  if (nextSyncAt && Date.parse(nextSyncAt) <= Date.now()) return true

  const lastSyncAt = dataset.sync_config.last_sync_at
  if (!lastSyncAt) return true

  const lastTime = Date.parse(lastSyncAt)
  if (!Number.isFinite(lastTime)) return true

  const hoursSinceLastSync = (Date.now() - lastTime) / 1000 / 60 / 60
  return hoursSinceLastSync >= 24
}

async function request(route, init = {}) {
  const apiKey = process.env.ARTIFACTA_API_KEY
  if (!apiKey) throw new Error("ARTIFACTA_API_KEY is required.")

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
    options[key] = value
  }
  return options
}
