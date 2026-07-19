#!/usr/bin/env node
import AdmZip from "adm-zip"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const baseUrl = (process.env.ARTIFACTA_URL ?? "http://localhost:3000").replace(/\/+$/, "")
const apiBase = `${baseUrl}/api/v1`
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
let apiKeyId = null
let apiKey = null
let projectId = null
let cliProjectId = null
let cliTempDir = null

try {
  const cookie = await login()
  const createdKey = await createApiKey(cookie)
  apiKeyId = createdKey.id
  apiKey = createdKey.key

  const doctor = runCli(["--json", "doctor"])
  assert(doctor.ok === true, "CLI doctor should connect with a freshly created API key.")

  cliTempDir = await mkdtemp(path.join(tmpdir(), "artifacta-cli-smoke-"))
  const cliHtmlPath = path.join(cliTempDir, "dashboard.html")
  await writeFile(cliHtmlPath, "<!doctype html><html><body><h1>Smoke CLI Dashboard</h1></body></html>", "utf8")
  const cliProject = runCli([
    "--json",
    "projects",
    "upload",
    "--file",
    cliHtmlPath,
    "--name",
    `Smoke CLI ${Date.now()}`,
    "--visibility",
    "private",
  ])
  cliProjectId = cliProject.id
  assert(cliProject.preview_url?.includes(cliProject.id), "CLI publish should return a project id and preview URL.")
  const cliRenderedHtml = await textRequest(`/projects/${cliProject.id}/html/render`)
  assert(cliRenderedHtml.includes("Smoke CLI Dashboard"), "CLI-published HTML should render through the hosted route.")

  const project = await uploadZipDashboard()
  projectId = project.id
  assert(project.artifact.kind === "zip", "Uploaded artifact should be ZIP.")
  assert(project.datasets.length === 1, "Smoke upload should attach one dataset.")

  const renderedHtml = await textRequest(`/projects/${project.id}/html/render`)
  assert(renderedHtml.includes("Smoke ZIP Dashboard"), "Rendered HTML should come from extracted ZIP entry.")

  const renderedCss = await textRequest(`/projects/${project.id}/html/styles.css`)
  assert(renderedCss.includes("background"), "ZIP asset route should serve CSS.")

  const editorSession = await jsonRequest(`/projects/${project.id}/text-editor/session`, { method: "POST" })
  const editorHtml = await textRequest(editorSession.edit_url.replace("/api/v1", ""))
  const titleMarker = editorHtml.match(/artifacta-text-start:([a-f0-9]+)-->Smoke ZIP Dashboard/)
  assert(titleMarker, "ZIP editor render should source-map the entrypoint heading.")

  const edited = await jsonRequest(`/projects/${project.id}/text-edits`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base_revision_id: editorSession.base_revision_id,
      edits: [{
        text_key: titleMarker[1],
        before: "Smoke ZIP Dashboard",
        after: "Smoke ZIP Dashboard Edited",
      }],
      notes: "Smoke inline ZIP text edit",
    }),
  })
  assert(edited.version.operation === "text_edit", "ZIP text edit should create a text_edit version.")
  const editedHtml = await textRequest(`/projects/${project.id}/html/render`)
  assert(editedHtml.includes("Smoke ZIP Dashboard Edited"), "ZIP entrypoint should render the published text edit.")
  const editedCss = await textRequest(`/projects/${project.id}/html/styles.css`)
  assert(editedCss.includes("background"), "ZIP text revision should continue serving parent bundle assets.")

  await uploadZipDashboard(project.id, "Republished ZIP Dashboard")
  const republishedHtml = await textRequest(`/projects/${project.id}/html/render`)
  assert(republishedHtml.includes("Republished ZIP Dashboard"), "A new ZIP upload should become the active artifact.")
  assert(!republishedHtml.includes("Smoke ZIP Dashboard Edited"), "A new upload should replace prior online text edits.")

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
  const textEditVersion = versionList.data.find((version) => version.operation === "text_edit")
  assert(textEditVersion, "ZIP text edit should remain available as an immutable version.")
  await jsonRequest(`/projects/${project.id}/versions/${textEditVersion.id}/rollback`, { method: "POST" })
  const restoredEditHtml = await textRequest(`/projects/${project.id}/html/render`)
  assert(restoredEditHtml.includes("Smoke ZIP Dashboard Edited"), "Rollback should restore the immutable text-edit revision.")

  const uploadVersion = versionList.data
    .filter((version) => version.operation === "upload")
    .sort((left, right) => left.version - right.version)[0]
  assert(uploadVersion, "ZIP upload should retain an immutable upload version.")
  await jsonRequest(`/projects/${project.id}/versions/${uploadVersion.id}/rollback`, { method: "POST" })
  const rolledBackHtml = await textRequest(`/projects/${project.id}/html/render`)
  assert(rolledBackHtml.includes("Smoke ZIP Dashboard"), "Rollback should restore the immutable ZIP entrypoint.")
  assert(!rolledBackHtml.includes("Smoke ZIP Dashboard Edited"), "Rollback should remove the later inline text edit.")

  const embed = await jsonRequestWithStatus(`/projects/${project.id}/embed-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expires_in_seconds: 300 }),
  })
  assert(embed.status === 201, "Embed token creation should return 201.")
  assert(embed.payload.embed_url?.includes(project.id), "Embed URL should target the project.")

  console.log("Smoke API passed: login, API key, CLI doctor/publish, ZIP hosting, inline text edit, re-upload replacement, assets, dataset sync config, preview, immutable rollback, versions, embed token, cleanup.")
} finally {
  if (cliProjectId && apiKey) await jsonRequest(`/projects/${cliProjectId}`, { method: "DELETE" }).catch(() => null)
  if (projectId && apiKey) await jsonRequest(`/projects/${projectId}`, { method: "DELETE" }).catch(() => null)
  if (apiKeyId && apiKey) await jsonRequest(`/api-keys/${apiKeyId}`, { method: "DELETE" }).catch(() => null)
  if (cliTempDir) await rm(cliTempDir, { recursive: true, force: true })
}

function runCli(args) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, "packages/cli/bin/artifacta.mjs"), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ARTIFACTA_URL: baseUrl,
      ARTIFACTA_API_KEY: apiKey,
    },
  })
  assert(result.status === 0, result.stderr || `CLI exited with ${result.status}`)
  try {
    return JSON.parse(result.stdout)
  } catch {
    throw new Error(`CLI did not return JSON: ${result.stdout}`)
  }
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

async function uploadZipDashboard(existingProjectId = null, heading = "Smoke ZIP Dashboard") {
  const zip = new AdmZip()
  zip.addFile("index.html", Buffer.from(`<!doctype html><html><head><title>${heading}</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>${heading}</h1><p id="status">ready</p><script src="app.js"></script></main></body></html>`))
  zip.addFile("styles.css", Buffer.from("body { margin: 0; background: #f6fbfa; font-family: system-ui, sans-serif; } main { padding: 32px; }"))
  zip.addFile("app.js", Buffer.from("document.getElementById('status').textContent = 'hydrated';"))
  zip.addFile("smoke.csv", Buffer.from("stage,users\nvisit,10\npaid,3\n"))

  const sessionForm = new FormData()
  sessionForm.append("file", new Blob([zip.toBuffer()], { type: "application/zip" }), "smoke-dashboard.zip")
  if (existingProjectId) sessionForm.append("project_id", existingProjectId)
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
