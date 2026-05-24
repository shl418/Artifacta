#!/usr/bin/env node
import AdmZip from "adm-zip"

const baseUrl = (process.env.ARTIFACTA_URL ?? "http://localhost:3000").replace(/\/+$/, "")
const apiBase = `${baseUrl}/api/v1`
let apiKeyId = null
let apiKey = null
let projectId = null

try {
  const cookie = await login()
  const createdKey = await createApiKey(cookie)
  apiKeyId = createdKey.id
  apiKey = createdKey.key

  const project = await uploadZipDashboard()
  projectId = project.id
  assert(project.artifact.kind === "zip", "Uploaded artifact should be ZIP.")
  assert(project.datasets.length === 1, "Smoke upload should attach one dataset.")

  const renderedHtml = await textRequest(`/projects/${project.id}/html/render`)
  assert(renderedHtml.includes("Smoke ZIP Dashboard"), "Rendered HTML should come from extracted ZIP entry.")

  const renderedCss = await textRequest(`/projects/${project.id}/html/styles.css`)
  assert(renderedCss.includes("background"), "ZIP asset route should serve CSS.")

  const dataset = project.datasets[0]
  await jsonRequest(`/projects/${project.id}/datasets/${dataset.id}/sync`, {
    method: "PUT",
    body: JSON.stringify({
      enabled: true,
      source_type: "presto",
      update_mode: "full",
      schedule: "0 8 * * *",
      source_config: {
        mock_rows: [
          { stage: "visit", users: 10 },
          { stage: "paid", users: 3 },
        ],
      },
    }),
    headers: { "Content-Type": "application/json" },
  })

  const sync = await jsonRequestWithStatus(`/projects/${project.id}/datasets/${dataset.id}/sync/trigger`, { method: "POST" })
  assert(sync.status === 202, "Sync trigger should enqueue a job.")
  assert(sync.payload.job_id, "Sync trigger should return a job_id.")
  assert(sync.payload.status === "queued", "Sync trigger should return queued status.")

  const claim = await jsonRequest("/sync/jobs/claim", { method: "POST" })
  assert(claim.job?.job_id === sync.payload.job_id, "Claim should run the enqueued sync job.")
  assert(claim.job.status === "success", "Claimed sync job should finish successfully.")
  assert(claim.job.rows_synced === 2, "Claimed sync job should write mock_rows data.")

  const preview = await jsonRequest(`/projects/${project.id}/datasets/${dataset.id}/preview`)
  assert(preview.parsed === true, "CSV preview should parse uploaded dataset.")
  assert(Array.isArray(preview.rows) && preview.rows.length > 0, "Preview should return sample rows.")

  const versionList = await jsonRequest(`/projects/${project.id}/versions`)
  assert(Array.isArray(versionList.data) && versionList.data.length > 0, "Project versions should be recorded after upload.")

  const embed = await jsonRequestWithStatus(`/projects/${project.id}/embed-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expires_in_seconds: 300 }),
  })
  assert(embed.status === 201, "Embed token creation should return 201.")
  assert(embed.payload.embed_url?.includes(project.id), "Embed URL should target the project.")

  console.log("Smoke API passed: login, API key, ZIP hosting, assets, sync, preview, versions, embed token, cleanup.")
} finally {
  if (projectId && apiKey) await jsonRequest(`/projects/${projectId}`, { method: "DELETE" }).catch(() => null)
  if (apiKeyId && apiKey) await jsonRequest(`/api-keys/${apiKeyId}`, { method: "DELETE" }).catch(() => null)
}

async function login() {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@artifacta.local", name: "Smoke Tester" }),
  })
  assert(response.ok, `Login failed with ${response.status}`)
  const setCookie = response.headers.get("set-cookie")
  assert(setCookie, "Login response should set a session cookie.")
  return setCookie.split(";")[0]
}

async function createApiKey(cookie) {
  const response = await fetch(`${apiBase}/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: `smoke-${Date.now()}` }),
  })
  const payload = await response.json()
  assert(response.ok, payload?.error?.message ?? `API key creation failed with ${response.status}`)
  return payload
}

async function uploadZipDashboard() {
  const form = new FormData()
  const zip = new AdmZip()
  zip.addFile("index.html", Buffer.from(`<!doctype html><html><head><title>Smoke ZIP Dashboard</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>Smoke ZIP Dashboard</h1><p id="status">ready</p><script src="app.js"></script></main></body></html>`))
  zip.addFile("styles.css", Buffer.from("body { margin: 0; background: #f6fbfa; font-family: system-ui, sans-serif; } main { padding: 32px; }"))
  zip.addFile("app.js", Buffer.from("document.getElementById('status').textContent = 'hydrated';"))

  form.append("name", `Smoke ZIP ${Date.now()}`)
  form.append("description", "Temporary project created by scripts/smoke-api.mjs")
  form.append("visibility", "team")
  form.append("html_file", new Blob([zip.toBuffer()], { type: "application/zip" }), "smoke-dashboard.zip")
  form.append("data_files", new Blob(["stage,users\nvisit,10\npaid,3\n"], { type: "text/csv" }), "smoke.csv")

  return jsonRequest("/projects", { method: "POST", body: form })
}

async function jsonRequest(route, init = {}) {
  return (await jsonRequestWithStatus(route, init)).payload
}

async function jsonRequestWithStatus(route, init = {}) {
  const response = await fetch(`${apiBase}${route}`, withAuth(init))
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  assert(response.ok, payload?.error?.message ?? `Request ${route} failed with ${response.status}`)
  return { status: response.status, payload }
}

async function textRequest(route, init = {}) {
  const response = await fetch(`${apiBase}${route}`, withAuth(init))
  const text = await response.text()
  assert(response.ok, `Request ${route} failed with ${response.status}: ${text}`)
  return text
}

function withAuth(init) {
  return {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers ?? {}),
    },
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
