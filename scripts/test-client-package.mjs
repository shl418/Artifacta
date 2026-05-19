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

const { ArtifactaClient } = await import(`file://${compiledPath.replaceAll("\\", "/")}`)

const calls = []
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init })

  if (String(url).endsWith("/api/v1/projects")) {
    return Response.json({
      data: [{ id: "proj_1", name: "Demo", visibility: "team", preview_url: "/view/proj_1" }],
      pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
    })
  }

  if (String(url).endsWith("/api/v1/projects/proj_1/datasets/ds_1/sync/trigger")) {
    return Response.json({ job_id: "job_1", status: "queued" }, { status: 202 })
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

globalThis.fetch = async () => Response.json({ error: { code: "NOPE", message: "Denied" } }, { status: 403 })
await assert.rejects(
  () => client.triggerSync("proj_1", "ds_1"),
  /Artifacta request failed: 403/
)
