#!/usr/bin/env node
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const openapi = await readFile(new URL("../docs/openapi/artifacta.v1.yaml", import.meta.url), "utf8")

const requiredPaths = [
  "/api/v1/auth/login",
  "/api/v1/auth/me",
  "/api/v1/auth/logout",
  "/api/v1/auth/oidc/login",
  "/api/v1/auth/oidc/callback",
  "/api/v1/stats",
  "/api/v1/folders",
  "/api/v1/folders/{folderId}",
  "/api/v1/upload-sessions",
  "/api/v1/datasets",
  "/api/v1/projects",
  "/api/v1/projects/{projectId}",
  "/api/v1/projects/{projectId}/folder",
  "/api/v1/projects/{projectId}/html",
  "/api/v1/projects/{projectId}/html/render",
  "/api/v1/projects/{projectId}/html/{assetPath}",
  "/api/v1/projects/{projectId}/versions",
  "/api/v1/projects/{projectId}/versions/{versionId}/rollback",
  "/api/v1/projects/{projectId}/embed-token",
  "/api/v1/projects/{projectId}/datasets",
  "/api/v1/projects/{projectId}/datasets/{datasetId}",
  "/api/v1/projects/{projectId}/datasets/{datasetId}/preview",
  "/api/v1/projects/{projectId}/datasets/{datasetId}/versions",
  "/api/v1/projects/{projectId}/datasets/{datasetId}/sync",
  "/api/v1/projects/{projectId}/datasets/{datasetId}/sync/status",
  "/api/v1/projects/{projectId}/datasets/{datasetId}/sync/history",
  "/api/v1/projects/{projectId}/datasets/{datasetId}/sync/trigger",
  "/api/v1/projects/{projectId}/datasets/{datasetId}/sync/test",
  "/api/v1/projects/{projectId}/permissions",
  "/api/v1/projects/{projectId}/permissions/{userId}",
  "/api/v1/team/members",
  "/api/v1/team/members/{userId}",
  "/api/v1/team/invitations",
  "/api/v1/api-keys",
  "/api/v1/api-keys/{keyId}",
  "/api/v1/sync/jobs/claim",
  "/api/v1/webhooks",
  "/api/v1/webhooks/{webhookId}",
  "/api/v1/audit-logs",
]

for (const route of requiredPaths) {
  assert.match(openapi, new RegExp(`^  ${escapeRegExp(route)}:`, "m"), `OpenAPI is missing ${route}`)
}

for (const snakeCaseField of ["project_id", "dataset_id", "sync_config", "created_at", "updated_at", "error"]) {
  assert.match(openapi, new RegExp(snakeCaseField), `OpenAPI should document ${snakeCaseField}`)
}

assert.match(openapi, /ErrorEnvelope:/, "OpenAPI should define ErrorEnvelope")
assert.doesNotMatch(openapi, /cdn\.artifacta\.io|app\.artifacta\.io/, "OpenAPI should use local or relative examples, not aspirational domains")

console.log(`API contract coverage passed for ${requiredPaths.length} public routes.`)

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
