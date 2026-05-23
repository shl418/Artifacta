import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import ts from "typescript"

const sourcePath = new URL("../packages/client/src/index.ts", import.meta.url)
const source = await readFile(sourcePath, "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const tempDir = await mkdtemp(join(tmpdir(), "artifacta-client-"))
const compiledPath = join(tempDir, "client.mjs")
await writeFile(compiledPath, compiled)

const { ArtifactaApiError, ArtifactaClient } = await import(`file://${compiledPath.replaceAll("\\", "/")}`)

const calls = []
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init })

  if (String(url).endsWith("/api/v1/projects") && init.method === "POST") {
    return Response.json({ id: "proj_new", name: "Uploaded", visibility: "team" })
  }

  if (String(url).endsWith("/api/v1/projects")) {
    return Response.json({
      data: [{ id: "proj_1", name: "Demo", visibility: "team", preview_url: "/view/proj_1" }],
      pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
    })
  }

  if (String(url).endsWith("/api/v1/projects/proj_1/datasets/ds_1/sync/trigger")) {
    return Response.json({ job_id: "job_1", status: "queued" }, { status: 202 })
  }

  if (String(url).endsWith("/api/v1/datasets?source=manual")) {
    return Response.json({ data: [] })
  }

  if (String(url).endsWith("/api/v1/projects/proj_1/datasets/ds_1/sync")) {
    return Response.json({
      enabled: true,
      source_type: "presto",
      source_config: { mock_rows: [] },
      update_mode: "full",
      schedule: "0 8 * * *",
    })
  }

  if (String(url).endsWith("/api/v1/projects/proj_1/html") && init.method === "PUT") {
    return Response.json({ id: "proj_1", name: "Updated HTML" })
  }

  return Response.json({ error: { code: "NOT_FOUND", message: "No route" } }, { status: 404 })
}

const client = new ArtifactaClient({
  baseUrl: "https://artifacta.test",
  apiKey: "ak_test",
})

const projects = await client.listProjects()
assert.equal(projects.data[0].id, "proj_1")
assert.equal(calls[0].url, "https://artifacta.test/api/v1/projects")
assert.equal(calls[0].init.headers.Authorization, "Bearer ak_test")

const queued = await client.triggerSync("proj_1", "ds_1")
assert.deepEqual(queued, { job_id: "job_1", status: "queued" })
assert.equal(calls[1].url, "https://artifacta.test/api/v1/projects/proj_1/datasets/ds_1/sync/trigger")
assert.equal(calls[1].init.method, "POST")

const datasets = await client.listDatasets({ source: "manual" })
assert.deepEqual(datasets, { data: [] })

const syncConfig = await client.setSyncConfig({
  projectId: "proj_1",
  datasetId: "ds_1",
  enabled: true,
  sourceType: "presto",
  sourceConfig: { mock_rows: [] },
  schedule: "0 8 * * *",
})
assert.equal(syncConfig.source_type, "presto")

const uploaded = await client.uploadProject({
  name: "Smoke",
  htmlFile: new Blob(["<html></html>"], { type: "text/html" }),
  htmlFileName: "index.html",
})
assert.equal(uploaded.id, "proj_new")
assert(calls.some((call) => call.init.method === "POST" && call.url.endsWith("/api/v1/projects")))

const updated = await client.updateHtml("proj_1", new Blob(["<html></html>"], { type: "text/html" }), "index.html")
assert.equal(updated.id, "proj_1")
assert(calls.some((call) => call.init.method === "PUT" && call.url.endsWith("/api/v1/projects/proj_1/html")))

globalThis.fetch = async () => Response.json({ error: { code: "NOPE", message: "Denied" } }, { status: 403 })
await assert.rejects(async () => client.triggerSync("proj_1", "ds_1"), (error) => {
  assert(error instanceof ArtifactaApiError)
  assert.equal(error.status, 403)
  assert.equal(error.code, "NOPE")
  assert.equal(error.message, "Denied")
  return true
})
