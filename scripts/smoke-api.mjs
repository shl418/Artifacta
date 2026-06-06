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
  const syncConfig = await jsonRequest(`/projects/${project.id}/datasets/${dataset.id}/sync`)
  assert(syncConfig.source_type === "manual", "Dataset sync config source type should be manual.")

  const syncTrigger = await jsonRequestWithStatus(`/projects/${project.id}/datasets/${dataset.id}/sync/trigger`, { method: "POST" }, { expectStatuses: [410] })
  assert(syncTrigger.status === 410, "Dataset sync trigger should return 410 (replaced by sync scripts).")

  const claim = await jsonRequest("/sync/jobs/claim", { method: "POST" })
  assert(claim.job === null, "Sync job claim should return null (no dataset sync jobs).")

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

  console.log("Smoke API passed: login, API key, ZIP hosting, assets, dataset sync config, preview, versions, embed token, cleanup.")
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
  const zip = new AdmZip()
  zip.addFile("index.html", Buffer.from(`<!doctype html><html><head><title>Smoke ZIP Dashboard</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>Smoke ZIP Dashboard</h1><p id="status">ready</p><script src="app.js"></script></main></body></html>`))
  zip.addFile("styles.css", Buffer.from("body { margin: 0; background: #f6fbfa; font-family: system-ui, sans-serif; } main { padding: 32px; }"))
  zip.addFile("app.js", Buffer.from("document.getElementById('status').textContent = 'hydrated';"))
  zip.addFile("smoke.csv", Buffer.from("stage,users\nvisit,10\npaid,3\n"))

  const sessionForm = new FormData()
  sessionForm.append("file", new Blob([zip.toBuffer()], { type: "application/zip" }), "smoke-dashboard.zip")
  const session = await jsonRequest("/upload-sessions", { method: "POST", body: sessionForm })

  const form = new FormData()
  form.append("name", `Smoke ZIP ${Date.now()}`)
  form.append("description", "Temporary project created by scripts/smoke-api.mjs")
  form.append("visibility", "team")
  form.append("upload_session_id", session.session_id)

  return jsonRequest("/projects", { method: "POST", body: form })
}

async function jsonRequest(route, init = {}) {
  return (await jsonRequestWithStatus(route, init)).payload
}

async function jsonRequestWithStatus(route, init = {}, { expectStatuses } = {}) {
  const response = await fetch(`${apiBase}${route}`, withAuth(init))
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  const acceptable = expectStatuses ? expectStatuses.includes(response.status) : response.ok
  assert(acceptable, payload?.error?.message ?? `Request ${route} failed with ${response.status}`)
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
