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
  if (options["dry-run"]) {
    console.log("DRY RUN no-op: worker only claims queued script jobs.")
    return
  }

  const claimed = await drainScriptJobs()
  if (claimed === 0) console.log("No queued script jobs.")
}

async function drainScriptJobs() {
  let claimed = 0

  try {
    for (let index = 0; index < 100; index += 1) {
      const result = await request("/sync/script-jobs/claim", { method: "POST" })
      if (!result.job) break

      claimed += 1
      const job = result.job
      console.log(
        `SCRIPT ${job.project_id}/${job.script_id} -> ${job.status} error=${job.error ?? ""}`
      )
    }
  } catch (error) {
    console.error(`Script claim failed: ${error instanceof Error ? error.message : error}`)
  }

  return claimed
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
