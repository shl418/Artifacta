# Artifacta Platform Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the Artifacta MVP into a clearer open protocol and hosting platform for AI-generated data applications.

**Architecture:** Keep the current Next.js app and local-first runtime, but introduce stable protocol boundaries before deeper platform refactors. The next phase should harden artifact publishing, define bundle/data binding contracts, turn sync into explicit jobs, and make the API contract usable by CLI, agents, and external tools.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `better-sqlite3`, local file storage, `adm-zip`, REST API, pnpm.

---

## Scope

This phase is not a full enterprise rewrite. It deliberately avoids a broad ORM migration, full RBAC rewrite, and storage/provider abstraction until protocol and safety boundaries are stable.

**Status (2026-05-19):** Implemented on branch `feature/artifacta-platform-phase` in worktree `.worktrees/artifacta-platform-phase`. Verified with `pnpm typecheck`, `pnpm lint`, `pnpm build`, focused test scripts, and `pnpm test:smoke`.

This phase produces seven reviewable tracks:

1. Artifacta protocol and manifest.
2. Artifact upload and ZIP security hardening.
3. SSRF-safe dataset sync source loading.
4. Sync job/run model.
5. OpenAPI contract and typed client foundation.
6. Product positioning docs aligned with the current package description.
7. Web upload-session flow for bundle dataset binding.

## Current Repo Context

- The app already supports `.html` and `.zip` uploads, extracts ZIP assets under `projects/:projectId/bundle`, serves them through protected API routes, and applies CSP sandbox headers on the render route.
- Domain fields in `lib/types.ts` are camelCase; API responses in `lib/server/serializers.ts` are snake_case. Preserve that boundary in every route change.
- `readDatabase()` / `updateDatabase()` are the persistence boundary for both JSON and SQLite. Any new persisted field must be initialized for seeded data, existing JSON files, and SQLite rows.
- `runDatasetSync()` is async and mutates the loaded database object before `updateDatabase()` writes it. Queue code must `await` sync execution inside the updater or it will write stale/incomplete state.
- `docs/PRODUCT.md`, `README.md`, and `README.zh-CN.md` still describe Artifacta primarily as BI dashboard hosting, while `package.json` already uses the broader open-protocol/data-app positioning.

## File Structure

- Create: `docs/protocol/manifest-v1.md` - human-readable Artifacta bundle and manifest specification.
- Create: `docs/protocol/examples/basic-dashboard/artifacta.json` - minimal manifest example.
- Create: `docs/protocol/examples/basic-dashboard/index.html` - minimal dashboard example using declared datasets.
- Create: `lib/server/artifacts/manifest.ts` - Zod schema and parser for `artifacta.json`.
- Create: `lib/server/artifacts/zip-security.ts` - ZIP validation limits and safe entry extraction rules.
- Modify: `lib/server/storage.ts` - call ZIP security validator from existing artifact save/read paths, replace all `normalizeZipEntry` callers, and keep manifest enforcement for the later upload-session commit path.
- Create: `lib/server/sync/source-policy.ts` - URL and local path source policy checks.
- Modify: `lib/server/sync-runner.ts` - move URL/local loading through source policy helpers.
- Modify: `lib/types.ts` - add explicit sync job/run domain types without removing existing sync history yet.
- Create: `lib/server/sync/jobs.ts` - sync job creation, claiming, execution state transitions, and history compatibility helpers.
- Modify: `lib/server/db.ts` - add `syncJobs` table migration for SQLite, add to read/write helpers.
- Create: `app/api/v1/sync/jobs/claim/route.ts` - worker claims next queued job.
- Modify: `scripts/sync-worker.mjs` - process queued sync jobs first via claim endpoint, then enqueue due datasets.
- Create: `docs/openapi/artifacta.v1.yaml` - first checked-in API contract for publish, project, dataset, sync, and auth flows.
- Create: `packages/client/package.json` - publishable TypeScript client package metadata.
- Create: `packages/client/src/index.ts` - small typed client wrapping the v1 REST API.
- Modify: `pnpm-workspace.yaml` - add `packages` field alongside existing `allowBuilds`.
- Modify: `README.md` and `README.zh-CN.md` - align messaging with the Artifacta protocol and hosting story.

## Task 1: Protocol Manifest V1

**Files:**
- Create: `docs/protocol/manifest-v1.md`
- Create: `docs/protocol/examples/basic-dashboard/artifacta.json`
- Create: `docs/protocol/examples/basic-dashboard/index.html`
- Create: `lib/server/artifacts/manifest.ts`

- [ ] **Step 1: Write the manifest specification**

Create `docs/protocol/manifest-v1.md` with this structure:

```markdown
# Artifacta Manifest V1

Artifacta bundles are portable data application artifacts generated by humans, scripts, or coding agents. A bundle can be a single HTML file or a ZIP directory containing `artifacta.json`, `index.html`, assets, and optional data files.

## Required Fields

- `schema_version`: must be `1`.
- `name`: display name for the artifact.
- `entrypoint`: relative path to the HTML entry file.
- `datasets`: array of dataset bindings available to the artifact.

## Dataset Binding

Each dataset binding declares:

- `id`: stable machine-readable identifier.
- `name`: human-readable label.
- `kind`: one of `csv`, `json`.
- `path`: optional relative path inside the bundle.
- `refresh`: one of `manual`, `sync`.

## Safety Rules

- Paths are POSIX relative paths.
- Absolute paths and parent traversal are invalid.
- HTML is rendered in a sandboxed iframe.
- Remote data sources are not declared directly in the bundle; they are bound server-side by project sync configuration.
```

- [ ] **Step 2: Add a minimal manifest example**

Create `docs/protocol/examples/basic-dashboard/artifacta.json`:

```json
{
  "schema_version": 1,
  "name": "Basic Sales Dashboard",
  "entrypoint": "index.html",
  "datasets": [
    {
      "id": "sales",
      "name": "Sales CSV",
      "kind": "csv",
      "path": "data/sales.csv",
      "refresh": "manual"
    }
  ]
}
```

- [ ] **Step 3: Add a minimal HTML example**

Create `docs/protocol/examples/basic-dashboard/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Basic Sales Dashboard</title>
  </head>
  <body>
    <main>
      <h1>Basic Sales Dashboard</h1>
      <p>This dashboard declares its dataset binding in artifacta.json.</p>
    </main>
  </body>
</html>
```

- [ ] **Step 4: Implement manifest parsing**

Create `lib/server/artifacts/manifest.ts`:

```ts
import path from "node:path"
import { z } from "zod"

const relativePathSchema = z.string().min(1).refine((value) => {
  const clean = value.replace(/\\/g, "/")
  const normalized = path.posix.normalize(clean)
  return Boolean(normalized) && normalized !== "." && !normalized.startsWith("/") && !normalized.startsWith("../") && !normalized.split("/").includes("..")
}, "Path must be relative and must not contain parent traversal")

export const artifactManifestSchema = z.object({
  schema_version: z.literal(1),
  name: z.string().min(1).max(120),
  entrypoint: relativePathSchema,
  datasets: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(80),
    name: z.string().min(1).max(120),
    kind: z.enum(["csv", "json"]),
    path: relativePathSchema.optional(),
    refresh: z.enum(["manual", "sync"]).default("manual"),
  })).default([]),
})

export type ArtifactManifest = z.infer<typeof artifactManifestSchema>

export function parseArtifactManifest(input: unknown) {
  return artifactManifestSchema.parse(input)
}
```

- [ ] **Step 5: Verify manifest parser**

Run: `pnpm typecheck`

Expected: TypeScript exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add docs/protocol lib/server/artifacts/manifest.ts
git commit -m "feat: define artifacta manifest v1"
```

## Task 2: ZIP Security Hardening

**Files:**
- Create: `lib/server/artifacts/zip-security.ts`
- Modify: `lib/server/storage.ts`

- [ ] **Step 1: Add ZIP limits and validation helper**

Create `lib/server/artifacts/zip-security.ts`:

```ts
import path from "node:path"
import type AdmZip from "adm-zip"

export const zipSecurityLimits = {
  maxEntries: 500,
  maxEntryBytes: 25 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
}

const blockedExtensions = new Set([".exe", ".dll", ".bat", ".cmd", ".ps1", ".sh", ".jar"])

export function normalizeBundleEntry(entryName: string) {
  const cleanPath = entryName.replace(/\\/g, "/")
  const normalized = path.posix.normalize(cleanPath)
  if (!normalized || normalized === "." || normalized.startsWith("/") || normalized.startsWith("../")) return null
  if (normalized.split("/").includes("..")) return null
  if (normalized.startsWith("__MACOSX/")) return null
  return normalized
}

export function validateZipBundle(zip: AdmZip) {
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory)
  if (entries.length > zipSecurityLimits.maxEntries) {
    throw new Error(`ZIP bundle has too many files. Maximum allowed is ${zipSecurityLimits.maxEntries}.`)
  }

  let totalBytes = 0
  for (const entry of entries) {
    // Reject truly malicious paths (traversal, absolute) with an error.
    // Skip benign non-extractable entries (__MACOSX metadata) silently —
    // macOS Finder injects these and users cannot prevent them.
    const cleanPath = entry.entryName.replace(/\\/g, "/")
    const normalized = path.posix.normalize(cleanPath)
    if (normalized.startsWith("/") || normalized.startsWith("../") || normalized.split("/").includes("..")) {
      throw new Error(`ZIP bundle contains a path traversal attempt: ${entry.entryName}`)
    }

    const safePath = normalizeBundleEntry(entry.entryName)
    if (!safePath) continue

    const extension = path.posix.extname(safePath).toLowerCase()
    if (blockedExtensions.has(extension)) {
      throw new Error(`ZIP bundle contains blocked file type: ${extension}`)
    }

    const entryBytes = entry.header.size
    if (entryBytes > zipSecurityLimits.maxEntryBytes) {
      throw new Error(`ZIP entry is too large: ${safePath}`)
    }

    totalBytes += entryBytes
    if (totalBytes > zipSecurityLimits.maxTotalBytes) {
      throw new Error(`ZIP bundle is too large. Maximum uncompressed size is ${zipSecurityLimits.maxTotalBytes} bytes.`)
    }
  }
}
```

- [ ] **Step 2: Replace all normalizeZipEntry callers**

Modify `lib/server/storage.ts` imports:

```ts
import { normalizeBundleEntry, validateZipBundle } from "@/lib/server/artifacts/zip-security"
```

**Caller 1 — `extractProjectZip`:** Inside `extractProjectZip`, call validation after opening the archive and replace path normalization:

```ts
const zip = new AdmZip(buffer)
validateZipBundle(zip)
```

Replace `normalizeZipEntry(entry.entryName)` with `normalizeBundleEntry(entry.entryName)`. Also remove the now-redundant `__MACOSX` check since `normalizeBundleEntry` handles it. Traversal paths are already rejected by `validateZipBundle`; benign skippable entries (like `__MACOSX`) return `null` from `normalizeBundleEntry` without throwing. Keep the extraction guard as a defensive `continue`:

```ts
// Before:
const safePath = normalizeZipEntry(entry.entryName)
if (!safePath || safePath.startsWith("__MACOSX/")) continue

// After:
const safePath = normalizeBundleEntry(entry.entryName)
if (!safePath) continue
```

Also reject HTML entrypoints that resolve outside the bundle root. Keep `entryPath` as the safe normalized path returned by `normalizeBundleEntry`; do not trust the original ZIP entry name after validation.

**Caller 2 — `readDashboardAsset`:** Replace the `normalizeZipEntry` call:

```ts
// Before:
const safePath = normalizeZipEntry(assetPath.join("/"))

// After:
const safePath = normalizeBundleEntry(assetPath.join("/"))
```

- [ ] **Step 3: Remove the old local normalizer**

Delete the `normalizeZipEntry` function (lines 165–171 of `lib/server/storage.ts`) after confirming both callers (`extractProjectZip` and `readDashboardAsset`) now use `normalizeBundleEntry`.

- [ ] **Step 4: Verify ZIP hardening compiles**

Run: `pnpm typecheck`

Expected: TypeScript exits with code 0.

- [ ] **Step 5: Build verification**

Run: `pnpm build`

Expected: Next.js build completes successfully (touches route handlers that serve ZIP assets).

- [ ] **Step 6: Smoke test**

Run: `pnpm test:smoke` (against a running dev server)

Expected: Upload and ZIP rendering smoke tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/server/artifacts/zip-security.ts lib/server/storage.ts
git commit -m "fix: harden zip artifact validation"
```

## Task 3: SSRF-Safe Sync Source Policy

**Files:**
- Create: `lib/server/sync/source-policy.ts`
- Modify: `lib/server/sync-runner.ts`
- Modify: `.env.example`
- Modify: `docs/DEPLOYMENT.md`

- [ ] **Step 1: Add source policy configuration**

Add to `.env.example`:

```bash
# Comma-separated host allowlist for dataset sync URL sources.
# Leave empty to disable remote URL sync in shared deployments.
SYNC_URL_ALLOWLIST=

# Base directory for local file sync sources.
# Paths outside this directory are rejected. Leave empty to allow any local path (dev only).
SYNC_LOCAL_BASE_DIR=
```

- [ ] **Step 2: Implement URL and local path policy checks**

Create `lib/server/sync/source-policy.ts`:

```ts
import dns from "node:dns/promises"
import net from "node:net"
import path from "node:path"

const blockedProtocols = new Set(["file:", "ftp:", "gopher:"])

export async function assertAllowedSyncUrl(rawUrl: string) {
  const url = new URL(rawUrl)
  if (blockedProtocols.has(url.protocol)) {
    throw new Error(`Sync URL protocol is not allowed: ${url.protocol}`)
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Sync URL protocol is not supported: ${url.protocol}`)
  }

  if (isLocalHostname(url.hostname)) {
    throw new Error("Sync URL host is not allowed")
  }

  const allowlist = parseAllowlist(process.env.SYNC_URL_ALLOWLIST)
  if (allowlist.length > 0 && !allowlist.includes(url.hostname.toLowerCase())) {
    throw new Error("Sync URL host is not in SYNC_URL_ALLOWLIST")
  }

  // DNS resolution check: skip if hostname is already in the allowlist (trusted)
  // to avoid adding latency on every sync. Only resolve untrusted/open-mode hostnames.
  if (allowlist.length === 0 && await resolvesToPrivateAddress(url.hostname)) {
    throw new Error("Sync URL host resolves to a private address")
  }

  if (allowlist.length === 0 && process.env.NODE_ENV === "production") {
    throw new Error("Remote URL sync requires SYNC_URL_ALLOWLIST in production")
  }

  return url
}

export function assertAllowedLocalPath(rawPath: string) {
  const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath)
  const normalizedPath = path.normalize(resolvedPath)

  const baseDir = process.env.SYNC_LOCAL_BASE_DIR?.trim()
  if (baseDir) {
    const normalizedBase = path.normalize(path.resolve(baseDir))
    const comparablePath = process.platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath
    const comparableBase = process.platform === "win32" ? normalizedBase.toLowerCase() : normalizedBase
    if (!comparablePath.startsWith(comparableBase + path.sep) && comparablePath !== comparableBase) {
      throw new Error(`Local sync path is outside allowed base directory: ${normalizedBase}`)
    }
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("Local file sync requires SYNC_LOCAL_BASE_DIR in production")
  }

  const blockedPrefixes = ["/etc", "/proc", "/sys", "/dev", "C:\\Windows\\System32"]
  for (const prefix of blockedPrefixes) {
    if (normalizedPath.startsWith(prefix)) {
      throw new Error("Local sync path is in a restricted system directory")
    }
  }

  return normalizedPath
}

function parseAllowlist(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function isLocalHostname(hostname: string) {
  const lower = hostname.toLowerCase()
  if (lower === "localhost" || lower.endsWith(".localhost")) return true
  if (net.isIP(lower) === 0) return false
  if (lower.startsWith("127.") || lower === "::1") return true
  if (lower.startsWith("10.") || lower.startsWith("192.168.")) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(lower)) return true
  if (lower.startsWith("169.254.")) return true
  return false
}

async function resolvesToPrivateAddress(hostname: string) {
  if (net.isIP(hostname) !== 0) return false
  const records = await dns.lookup(hostname, { all: true, verbatim: true }).catch(() => [])
  return records.some((record) => isLocalHostname(record.address))
}
```

- [ ] **Step 3: Use policy from sync runner**

In `lib/server/sync-runner.ts`, import the policy:

```ts
import { assertAllowedSyncUrl, assertAllowedLocalPath } from "@/lib/server/sync/source-policy"
```

Modify the `loadDatasetSource` function. For URL sources (line ~98):

```ts
// Before (inside loadDatasetSource):
const response = await fetch(url)

// After:
const allowedUrl = await assertAllowedSyncUrl(url)
const response = await fetch(allowedUrl)
```

For local file sources (line ~88):

```ts
// Before (inside loadDatasetSource):
const resolvedPath = path.isAbsolute(localPath) ? localPath : path.resolve(process.cwd(), localPath)
return { buffer: await fs.readFile(resolvedPath) }

// After:
const resolvedPath = assertAllowedLocalPath(localPath)
return { buffer: await fs.readFile(resolvedPath) }
```

- [ ] **Step 4: Document deployment policy**

Add to `docs/DEPLOYMENT.md`:

```markdown
## Dataset Sync Source Safety

### Remote URLs

Remote URL sync is disabled by default in production unless `SYNC_URL_ALLOWLIST` is set. Only add hosts that are intended dataset origins. Do not allow private network ranges, metadata service hosts, or user-controlled domains in shared deployments.

### Local File Paths

Local file sync reads from the filesystem. In production, set `SYNC_LOCAL_BASE_DIR` to restrict which directories sync can access. Without this, local file sync is blocked in production to prevent path traversal.

In development, both restrictions are relaxed to avoid configuration overhead.

### Known Limitation: DNS Rebinding

The hostname pre-flight check resolves DNS before the HTTP request. A malicious hostname could initially resolve to a public IP (passing validation), then resolve to a private IP by the time `fetch()` connects (DNS rebinding). For shared deployments, enforce network-level egress rules (security groups, iptables) that block outbound traffic to RFC1918 ranges, link-local addresses, and cloud metadata endpoints (169.254.169.254).
```

- [ ] **Step 5: Verify sync policy compiles**

Run: `pnpm typecheck`

Expected: TypeScript exits with code 0.

- [ ] **Step 6: Build verification**

Run: `pnpm build`

Expected: Next.js build completes successfully.

- [ ] **Step 7: Smoke test**

Run: `pnpm test:smoke`

Expected: Sync trigger smoke tests pass.

- [ ] **Step 8: Commit**

```bash
git add .env.example docs/DEPLOYMENT.md lib/server/sync/source-policy.ts lib/server/sync-runner.ts
git commit -m "fix: restrict remote and local dataset sync sources"
```

## Task 4: Sync Job Model

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/server/sync/jobs.ts`
- Modify: `lib/server/db.ts`
- Create: `app/api/v1/sync/jobs/claim/route.ts`
- Modify: `app/api/v1/projects/[projectId]/datasets/[datasetId]/sync/trigger/route.ts`
- Modify: `app/api/v1/projects/[projectId]/datasets/[datasetId]/sync/history/route.ts`
- Modify: `scripts/sync-worker.mjs`
- Modify: `scripts/smoke-api.mjs` — update trigger assertion from 201 to 202 and new response shape

- [ ] **Step 1: Add domain types**

Add to `lib/types.ts`:

```ts
export type SyncJobStatus = "queued" | "running" | "success" | "failed"

export interface SyncJob {
  id: string
  projectId: string
  datasetId: string
  organizationId: string
  status: SyncJobStatus
  trigger: "manual" | "scheduled"
  requestedBy: string | null
  error: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}
```

Add `syncJobs: SyncJob[]` to the `Database` interface:

```ts
export interface Database {
  version: number
  organizations: Organization[]
  users: User[]
  folders: Folder[]
  projects: Project[]
  datasets: Dataset[]
  projectMembers: ProjectMember[]
  apiKeys: ApiKey[]
  syncHistory: SyncHistory[]
  syncJobs: SyncJob[]
  activities: Activity[]
}
```

Update `seedDatabase()` and any JSON/SQLite normalization path so existing databases without `syncJobs` are upgraded to `syncJobs: []` before route handlers read them. This field is persisted state, so do not rely on TypeScript casts alone.

- [ ] **Step 2: Add SQLite migration and read/write support**

In `lib/server/db.ts`:

**Migration:** Add a new migration (id 2) after the initial one:

```ts
applySqliteMigration(
  database,
  2,
  "sync_jobs_table",
  `
    CREATE TABLE IF NOT EXISTS sync_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      dataset_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      data TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs (status, created_at);
    CREATE INDEX IF NOT EXISTS idx_sync_jobs_dataset ON sync_jobs (dataset_id);
  `
)
```

**Read:** Add to `readSqliteDatabase()`:

```ts
syncJobs: readSqliteRows<SyncJob>(database, "sync_jobs").sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
```

**Write:** Add to `writeSqliteDatabase()`:

```ts
database.prepare("DELETE FROM sync_jobs").run()
// ...
const insertSyncJob = database.prepare("INSERT INTO sync_jobs (id, project_id, dataset_id, organization_id, status, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)")
// ...
for (const job of appDatabase.syncJobs) insertSyncJob.run(job.id, job.projectId, job.datasetId, job.organizationId, job.status, job.createdAt, stringifySqliteRow(job))
```

**Type:** Add `"sync_jobs"` to the `SqliteTable` type union.

**Seed:** Add `syncJobs: []` to `seedDatabase()`.

- [ ] **Step 3: Add queue helpers**

Create `lib/server/sync/jobs.ts`:

```ts
import type { Database, SyncJob } from "@/lib/types"
import { now } from "@/lib/server/db"

export function enqueueSyncJob(database: Database, input: Omit<SyncJob, "id" | "status" | "error" | "createdAt" | "startedAt" | "completedAt">) {
  const existing = database.syncJobs.find(
    (job) =>
      job.projectId === input.projectId &&
      job.datasetId === input.datasetId &&
      (job.status === "queued" || job.status === "running")
  )
  if (existing) return existing

  const job: SyncJob = {
    ...input,
    id: `sync_job_${crypto.randomUUID()}`,
    status: "queued",
    error: null,
    createdAt: now(),
    startedAt: null,
    completedAt: null,
  }
  database.syncJobs.unshift(job)
  return job
}

export function claimNextSyncJob(database: Database) {
  const job = database.syncJobs.find((candidate) => candidate.status === "queued")
  if (!job) return null
  job.status = "running"
  job.startedAt = now()
  return job
}

export function completeSyncJob(job: SyncJob) {
  job.status = "success"
  job.completedAt = now()
}

export function failSyncJob(job: SyncJob, error: string) {
  job.status = "failed"
  job.error = error
  job.completedAt = now()
}
```

- [ ] **Step 4: Add claim endpoint for the worker**

Create `app/api/v1/sync/jobs/claim/route.ts`:

```ts
import { authenticateRequest } from "@/lib/server/auth"
import { updateDatabase } from "@/lib/server/db"
import { apiError, jsonResponse } from "@/lib/server/responses"
import { claimNextSyncJob, completeSyncJob, failSyncJob } from "@/lib/server/sync/jobs"
import { runDatasetSync } from "@/lib/server/sync-runner"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

  const result = await updateDatabase(async (database) => {
    const syncJob = claimNextSyncJob(database)
    if (!syncJob) return null

    try {
      const history = await runDatasetSync(database, {
        projectId: syncJob.projectId,
        datasetId: syncJob.datasetId,
        userId: syncJob.requestedBy ?? undefined,
      })
      if (history.status === "success") completeSyncJob(syncJob)
      else failSyncJob(syncJob, history.error ?? "Sync failed")
      return { job: syncJob, history }
    } catch (error) {
      failSyncJob(syncJob, error instanceof Error ? error.message : "Unknown error")
      return { job: syncJob, history: null }
    }
  })

  if (!result) return jsonResponse({ job: null }, { status: 200 })

  return jsonResponse({
    job: {
      job_id: result.job.id,
      project_id: result.job.projectId,
      dataset_id: result.job.datasetId,
      status: result.job.status,
      rows_synced: result.history?.rowsSynced ?? 0,
      error: result.job.error,
    },
  })
}
```

Why this shape matters: `runDatasetSync()` is async and mutates the database object. The claim endpoint must run it inside the same awaited `updateDatabase()` callback so job status, sync history, dataset metadata, and failed job state are written together.

Known limitation: In JSON driver mode, long-running sync execution inside `updateDatabase` holds the write window open. Any concurrent `updateDatabase` call (project creation, dataset upload) that completes while a sync is running will read stale data and could overwrite sync results. This is inherited from the existing trigger endpoint's design and is acceptable for single-user/dev mode. For multi-user production, prefer SQLite (WAL mode provides better concurrency) or split claim/execute into two writes with optimistic locking.

- [ ] **Step 5: Make manual trigger enqueue jobs**

In `app/api/v1/projects/[projectId]/datasets/[datasetId]/sync/trigger/route.ts`, replace direct sync execution with `enqueueSyncJob(...)` inside `updateDatabase`. Return the queued job id in the API response:

```ts
import { enqueueSyncJob } from "@/lib/server/sync/jobs"

// Replace the existing updateDatabase call with:
const job = await updateDatabase((mutable) =>
  enqueueSyncJob(mutable, {
    projectId,
    datasetId,
    organizationId: project.organizationId,
    trigger: "manual",
    requestedBy: auth.user.id,
  })
)

return jsonResponse({ job_id: job.id, status: job.status }, { status: 202 })
```

Note: This is a **breaking change** for the sync trigger response. The old response returned `sync_id`, `status`, `rows_synced` synchronously. The new response returns `job_id` and `status: "queued"` with HTTP 202.

- [ ] **Step 6: Update worker to use claim endpoint**

Modify `scripts/sync-worker.mjs` to process queued jobs before scanning scheduled datasets:

```js
async function runOnce(options) {
  // Phase 1: Drain already queued jobs via claim endpoint
  let claimed = 0
  claimed += await drainQueuedJobs()

  // Phase 2: Enqueue due datasets (existing logic)
  const payload = await request("/datasets")
  const datasets = payload.data.filter((dataset) => dataset.sync_config.enabled)
  const dueDatasets = datasets.filter((dataset) => options.all || isDue(dataset))

  for (const dataset of dueDatasets) {
    const label = `${dataset.project.name}/${dataset.name}`
    if (options["dry-run"]) {
      console.log(`DRY RUN sync ${label}`)
      continue
    }

    const result = await request(`/projects/${dataset.project_id}/datasets/${dataset.id}/sync/trigger`, { method: "POST" })
    console.log(`ENQUEUED ${label} -> ${result.status} job_id=${result.job_id}`)
  }

  // Phase 3: Process jobs enqueued by this pass so --once still does useful work.
  if (!options["dry-run"]) claimed += await drainQueuedJobs()

  if (dueDatasets.length === 0 && claimed === 0) {
    console.log("No datasets due for sync.")
  }
}

async function drainQueuedJobs() {
  let claimed = 0
  while (claimed < 100) {
    let result
    try {
      result = await request("/sync/jobs/claim", { method: "POST" })
    } catch (error) {
      console.error(`Claim request failed: ${error.message}`)
      break
    }
    if (!result.job) break

    const job = result.job
    const label = `${job.project_id}/${job.dataset_id}`
    console.log(`CLAIMED ${label} -> ${job.status} rows=${job.rows_synced} error=${job.error ?? ""}`)
    claimed += 1
  }
  return claimed
}
```

- [ ] **Step 7: Keep history endpoint backward compatible**

In `app/api/v1/projects/[projectId]/datasets/[datasetId]/sync/history/route.ts`, keep returning existing `data` and `pagination` fields exactly as they work today. Add a sibling `jobs` array for clients that want queue visibility; use the same `canViewProject` gate already used by the route and do not remove or rename `data`.

```ts
jobs: database.syncJobs
  .filter((job) => job.projectId === projectId && job.datasetId === datasetId)
  .map((job) => ({
    job_id: job.id,
    status: job.status,
    trigger: job.trigger,
    created_at: job.createdAt,
    started_at: job.startedAt,
    completed_at: job.completedAt,
    error: job.error,
  }))
```

- [ ] **Step 8: Verify sync job flow**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all commands exit with code 0.

- [ ] **Step 9: Update smoke test for new trigger response**

Modify `scripts/smoke-api.mjs`: the sync trigger assertion must expect HTTP 202 (was 201) and the response body now contains `job_id` and `status` (was `sync_id`, `status`, `rows_synced`). Update accordingly:

```js
// Before:
// assert(response.status === 201)
// assert(body.sync_id)

// After:
// assert(response.status === 202)
// assert(body.job_id)
// assert(body.status === "queued")
```

- [ ] **Step 10: Smoke test**

Run: `pnpm test:smoke`

Expected: Sync trigger and history endpoints pass with the updated assertions.

- [ ] **Step 11: Commit**

```bash
git add lib/types.ts lib/server/db.ts lib/server/sync/jobs.ts app/api/v1/sync scripts/sync-worker.mjs scripts/smoke-api.mjs "app/api/v1/projects/[projectId]/datasets/[datasetId]/sync"
git commit -m "feat: queue dataset sync jobs"
```

## Task 5: OpenAPI and Typed Client Foundation

**Files:**
- Create: `docs/openapi/artifacta.v1.yaml`
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/src/index.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `docs/API.md`

- [ ] **Step 1: Add OpenAPI document**

Create `docs/openapi/artifacta.v1.yaml` with paths for:

```yaml
openapi: 3.1.0
info:
  title: Artifacta API
  version: 1.0.0
paths:
  /api/v1/projects:
    get:
      summary: List projects
    post:
      summary: Publish an artifact
  /api/v1/projects/{projectId}:
    get:
      summary: Get project
  /api/v1/projects/{projectId}/html:
    put:
      summary: Replace project artifact
  /api/v1/projects/{projectId}/datasets:
    get:
      summary: List project datasets
    post:
      summary: Upload project dataset
  /api/v1/projects/{projectId}/datasets/{datasetId}/sync/trigger:
    post:
      summary: Queue dataset sync
  /api/v1/sync/jobs/claim:
    post:
      summary: Claim next queued sync job (worker use)
```

- [ ] **Step 2: Add client package metadata**

Create `packages/client/package.json`:

```json
{
  "name": "@artifacta/client",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "license": "MIT"
}
```

- [ ] **Step 3: Add client tsconfig**

Create `packages/client/tsconfig.json` so `pnpm typecheck` in the workspace root covers the client package:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

Without this, the root `pnpm typecheck` (which uses the root tsconfig scoped to `app/`, `lib/`, etc.) will silently skip the client source, giving a false green.

- [ ] **Step 4: Add typed client**

Create `packages/client/src/index.ts`:

```ts
export interface ArtifactaClientOptions {
  baseUrl: string
  apiKey: string
}

export interface ArtifactaProject {
  id: string
  name: string
  visibility: "private" | "team" | "public"
  preview_url?: string
}

export class ArtifactaClient {
  constructor(private readonly options: ArtifactaClientOptions) {}

  async listProjects() {
    return this.request<{ projects: ArtifactaProject[] }>("/api/v1/projects")
  }

  async triggerSync(projectId: string, datasetId: string) {
    return this.request<{ job_id: string; status: string }>(
      `/api/v1/projects/${projectId}/datasets/${datasetId}/sync/trigger`,
      { method: "POST" }
    )
  }

  private async request<T>(path: string, init: RequestInit = {}) {
    const response = await fetch(new URL(path, this.options.baseUrl), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        ...(init.headers ?? {}),
      },
    })

    if (!response.ok) {
      throw new Error(`Artifacta API request failed: ${response.status}`)
    }

    return response.json() as Promise<T>
  }
}
```

- [ ] **Step 5: Include client package in workspace**

Modify `pnpm-workspace.yaml` to add the `packages` field while preserving the existing `allowBuilds` config:

```yaml
packages:
  - "packages/*"

allowBuilds:
  better-sqlite3: true
```

**Important:** Do not remove the `allowBuilds` key. The existing `packages/cli` will also be picked up by this glob.

- [ ] **Step 6: Link API docs**

Add a short section to `docs/API.md`:

```markdown
## OpenAPI

The first checked-in OpenAPI contract lives at `docs/openapi/artifacta.v1.yaml`. Treat route handlers as the source of truth until contract tests are added, then use the OpenAPI file as the compatibility gate for CLI, client, and agent integrations.
```

- [ ] **Step 7: Verify client package**

Run:

```bash
pnpm install
pnpm typecheck
```

Expected: both commands exit with code 0. Verify that `packages/client` appears in `pnpm list --recursive`.

- [ ] **Step 8: Commit**

```bash
git add docs/openapi docs/API.md packages/client pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: add artifacta api contract and client"
```

## Task 6: Brand and Product Repositioning

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/PRODUCT.md`
- Modify: `AGENTS.md`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Update product language**

Replace lead language that says the project is only a BI dashboard hosting platform with:

```markdown
Artifacta is an open protocol and hosting platform for AI-generated data applications. It lets local AI tools, scripts, and analysts publish HTML/JS artifacts, bind datasets, and share live applications with teams.
```

Chinese equivalent:

```markdown
Artifacta 是面向 AI 生成数据应用的开放协议与托管平台。它让本地 AI 工具、脚本和分析师可以发布 HTML/JS 产物，绑定数据源，并把可更新的数据应用共享给团队。
```

Note: root `package.json` already matches this positioning ("open protocol and hosting for AI-generated data applications") — no change needed there. `packages/cli/package.json` still says "HTML dashboards"; update its description and keywords so npm metadata matches the broader protocol story.

- [ ] **Step 2: Update AGENTS.md product intent**

Replace the current product intent line:

```markdown
Artifacta hosts HTML dashboards generated locally by users and coding agents.
```

with:

```markdown
Artifacta is an open protocol and hosting platform for AI-generated data applications (HTML/JS artifacts, datasets, sync, sharing).
```

- [ ] **Step 3: Align docs with protocol positioning**

Ensure README and product docs describe Artifacta as an open protocol and hosting platform for AI-generated data applications, not only as a BI dashboard host.

- [ ] **Step 4: Align CLI package metadata**

Modify `packages/cli/package.json`:

```json
{
  "description": "CLI for publishing AI-generated data applications, datasets, and sync configs to Artifacta.",
  "keywords": ["artifacta", "cli", "data-apps", "protocol", "agents"]
}
```

Keep `@artifacta/cli` and `"publishConfig": { "access": "public" }` unless the npm organization changes.

- [ ] **Step 5: Verify docs and package metadata**

Run:

```bash
pnpm typecheck
pnpm lint
```

Expected: both commands exit with code 0.

- [ ] **Step 6: Commit**

```bash
git add README.md README.zh-CN.md docs/PRODUCT.md AGENTS.md packages/cli/package.json
git commit -m "docs: reposition project around artifacta protocol"
```

## Task 7: Bundle Upload Interaction and Dataset Binding

**Goal:** Let Web UI users upload a ZIP containing HTML + data files, interactively tag data files, and configure dataset bindings — while CLI/agents continue to use the manifest-first path.

**Design Decisions:**

- **Dual mode:** CLI/Agent uploads include `artifacta.json` and skip interactive config (Mode A). Web UI uploads without a manifest trigger guided configuration; the server generates the manifest (Mode B).
- **Data file inference:** Files with extensions `.csv`, `.tsv`, `.json`, `.jsonl`, `.parquet`, `.xlsx` are auto-preselected as candidate datasets. User confirms/adjusts.
- **Static vs dynamic:** User tags each dataset as `manual` (static, frozen in bundle) or `sync` (dynamic, refreshable). Dynamic data source configuration is deferred to project settings.
- **Bundle path preservation:** Dataset files remain at their original paths inside the bundle directory. HTML relative references (`fetch("data/sales.csv")`) continue working without rewriting.
- **Re-upload protection:** When a bundle is re-uploaded, files belonging to datasets with `refresh: "sync"` are skipped during extraction, preserving sync-updated versions.
- **Storage model:** Dataset records for bundle-origin files set `filePath` directly to the bundle path. A new `origin: "bundle" | "upload" | "sync"` field distinguishes bundle-origin datasets from independently uploaded ones. Both coexist.
- **Cache and refresh:** All bundle assets use `Cache-Control: public, max-age=300`. The outer preview page provides a "Refresh Data" button that reloads the iframe with a cache-busting query parameter (`?_t=timestamp`).
- **Validation:** All datasets declared with a `path` must have corresponding files physically present in the ZIP. Purely remote datasets (no bundle file) omit `path` and are served through the dataset API, not the bundle asset route.
- **Update paths:** Quick HTML/CSS fixes use `PUT /projects/{id}/html` (no dataset reconfig). Full bundle reconfig uses the upload-session flow with `project_id` parameter.

**Files:**
- Create: `app/api/v1/upload-sessions/route.ts`
- Create: `lib/server/artifacts/upload-session.ts`
- Modify: `app/api/v1/projects/route.ts` — accept `upload_session_id`
- Modify: `lib/server/storage.ts` — `extractProjectZip` accepts `skipPaths` set; change cleanup to selective deletion
- Modify: `lib/types.ts` — add `UploadSession` type, `origin` field on `Dataset`
- Modify: `lib/server/db.ts` — add upload-session persistence/defaults and existing dataset-origin defaults
- Modify: `lib/server/dataset-records.ts` — default standalone uploads to `origin: "upload"`
- Modify: `lib/server/serializers.ts` — expose dataset `origin` in API responses
- Modify: `lib/server/artifacts/manifest.ts` — add manifest generation from user config
- Create: `app/(main)/publish/page.tsx` — 3-step upload wizard UI
- Modify: `app/view/[projectId]/page.tsx` — add refresh button

### Step 1: Add upload session types

Add to `lib/types.ts`:

```ts
export interface UploadSession {
  id: string
  userId: string
  organizationId: string
  projectId: string | null
  fileTree: BundleFileEntry[]
  originalName: string
  tempPath: string
  createdAt: string
  expiresAt: string
}

export interface BundleFileEntry {
  path: string
  size: number
  extension: string
  inferredDataset: boolean
}
```

Add `origin` field to the existing `Dataset` interface:

```ts
origin: "bundle" | "upload" | "sync"
```

Add `uploadSessions: UploadSession[]` to the `Database` interface. Update `seedDatabase()`, JSON read normalization, and SQLite read/write paths so existing records are upgraded as follows:

```ts
database.uploadSessions ??= []
for (const dataset of database.datasets) {
  dataset.origin ??= "upload"
}
```

**SQLite migration (id 3):** Add to `lib/server/db.ts` after the sync_jobs migration:

```ts
applySqliteMigration(
  database,
  3,
  "upload_sessions_and_dataset_origin",
  `
    CREATE TABLE IF NOT EXISTS upload_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      data TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_upload_sessions_user ON upload_sessions (user_id);
    CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires ON upload_sessions (expires_at);
  `
)
```

Add `"upload_sessions"` to the `SqliteTable` union. Add read/write support in `readSqliteDatabase()` and `writeSqliteDatabase()` following the same pattern as `sync_jobs`.

**JSON read normalization:** In `readDatabase()` for JSON driver, ensure defaults are applied after `JSON.parse` and before returning:

```ts
const database = JSON.parse(content) as Database
database.syncJobs ??= []
database.uploadSessions ??= []
for (const dataset of database.datasets) {
  (dataset as any).origin ??= "upload"
}
return database
```

This prevents runtime `undefined` access even though the TypeScript type declares `origin` as required.

Update `buildDatasetRecord()` so datasets created from `data_files` use `origin: "upload"`.

Update `lib/server/serializers.ts` to include `origin` in the dataset API response object so clients can distinguish bundle-origin datasets from uploaded or synced ones.

- [ ] **Step 1: Add upload session, bundle file entry, dataset origin, persistence defaults, SQLite migration, and serializer update**

### Step 2: Implement upload session backend

Create `lib/server/artifacts/upload-session.ts` and persist sessions in `database.uploadSessions` through `updateDatabase()`:

- `createUploadSession(file: File, userId, organizationId, projectId?)` saves the ZIP to `.artifacta/tmp/{sessionId}/bundle.zip`, parses the file tree, infers dataset candidates by extension, stores the session record, and returns it.
- `getUploadSession(database, sessionId, userId)` retrieves an unexpired session owned by the authenticated user.
- `cleanExpiredSessions(database)` removes expired session records and best-effort deletes `.artifacta/tmp/{sessionId}`.
- `commitUploadSession(database, sessionId, config)` moves/extracts the temp ZIP to the final bundle path, generates `artifacta.json`, creates dataset records, removes the session record, and returns the project artifact plus dataset records.

Dataset candidate inference extensions: `.csv`, `.tsv`, `.json`, `.jsonl`, `.parquet`, `.xlsx`.

- [ ] **Step 2: Implement upload session creation, retrieval, cleanup, and commit**

### Step 3: Add upload session API route

Create `app/api/v1/upload-sessions/route.ts`:

```ts
// POST /api/v1/upload-sessions
// Accepts: multipart form with `file` (ZIP), optional `project_id`
// Returns: { session_id, file_tree: BundleFileEntry[], expires_at }
```

Auth required. Validates ZIP security (reuse `validateZipBundle`). Calls `createUploadSession`.

- [ ] **Step 3: Create `POST /api/v1/upload-sessions` route**

### Step 4: Extend project creation to accept upload sessions

Modify `app/api/v1/projects/route.ts`:

- Accept optional `upload_session_id` field in the form data.
- When present, skip `html_file` requirement. Instead call `commitUploadSession` with the dataset configuration payload:

```ts
// Additional form fields when using upload_session_id:
// datasets: JSON string of array:
//   [{ bundle_path: string, name: string, refresh: "manual" | "sync" }]
```

- `commitUploadSession` moves bundle from temp to final, generates `artifacta.json`, creates dataset records with `origin: "bundle"` and `filePath` pointing to bundle paths.

- [ ] **Step 4: Extend `POST /api/v1/projects` to support `upload_session_id`**

### Step 5: Protect dynamic datasets on re-upload

Modify `lib/server/storage.ts` `extractProjectZip`:

- Add parameter `skipPaths?: Set<string>` — relative paths to skip during extraction.
- **Change the cleanup strategy:** Instead of `fs.rm(absoluteRoot, { recursive: true, force: true })` which wipes the entire bundle directory (and destroys sync-updated files before skipPaths can protect them), use selective deletion:

```ts
// Before:
await fs.rm(absoluteRoot, { recursive: true, force: true })
await fs.mkdir(absoluteRoot, { recursive: true })

// After:
if (skipPaths && skipPaths.size > 0) {
  // Selective cleanup: only remove files that will be replaced
  const existingFiles = await listFilesRecursive(absoluteRoot)
  for (const existingFile of existingFiles) {
    const relative = path.relative(absoluteRoot, existingFile).split(path.sep).join("/")
    if (!skipPaths.has(relative)) {
      await fs.rm(existingFile, { force: true })
    }
  }
} else {
  // Full cleanup when no files need protection
  await fs.rm(absoluteRoot, { recursive: true, force: true })
}
await fs.mkdir(absoluteRoot, { recursive: true })
```

Add a local `listFilesRecursive(root: string)` helper in `lib/server/storage.ts` that returns absolute file paths only. It must tolerate a missing `absoluteRoot` by returning `[]`, because first-time ZIP uploads will not have an existing bundle directory.

- Before writing each entry, check if `safePath` is in `skipPaths`. If yes, skip.
- Caller (`saveProjectArtifact` or `commitUploadSession`) queries existing datasets with `refresh: "sync"` for the project and builds the skip set from their `filePath` values (relativized to the bundle root).

- [ ] **Step 5: Add `skipPaths` parameter to `extractProjectZip` and change cleanup to selective deletion**

### Step 6: Add manifest generation

Modify `lib/server/artifacts/manifest.ts`:

- Add `generateManifest(projectName, entryPath, datasets)` function that produces a valid `artifacta.json` object.
- `commitUploadSession` calls this and writes the file to the bundle root.

- [ ] **Step 6: Implement manifest generation from user configuration**

### Step 7: Build 3-step upload wizard UI

Create `app/(main)/publish/page.tsx`:

**Screen 1 — Basic Info + Upload:**
- Project name (required)
- Description (optional)
- Visibility selector (required)
- ZIP file drop/select

On file selection → call `POST /api/v1/upload-sessions` → advance to screen 2.

**Screen 2 — Dataset Configuration:**
- File tree display with checkboxes (pre-selected for inferred data files)
- For each checked file: name input (default: filename) + refresh toggle (manual/sync)
- "Select All Data Files" / "Clear" convenience buttons

**Screen 3 — Confirm & Publish:**
- Summary: project name, visibility, file count, dataset count with types
- "Publish" button → `POST /api/v1/projects` with `upload_session_id` + config

- [ ] **Step 7: Build the 3-step publish wizard page**

### Step 8: Add refresh button to preview page

Modify `app/view/[projectId]/page.tsx`:

- Add a "Refresh Data" button in the toolbar/header area.
- Store iframe URL in local state after project load.
- On click: update iframe `src` by appending/replacing `?_t=${Date.now()}` while preserving the original `project.html_url`.

```tsx
const [iframeSrc, setIframeSrc] = useState("")

useEffect(() => {
  if (project) setIframeSrc(project.html_url)
}, [project])

function refreshIframe() {
  if (!project) return
  const url = new URL(project.html_url, window.location.origin)
  url.searchParams.set("_t", String(Date.now()))
  setIframeSrc(url.toString())
}
```

- [ ] **Step 8: Add refresh data button to the preview page**

### Step 9: Support upload-session for existing project updates

Extend `POST /api/v1/upload-sessions` to accept `project_id`:

- When `project_id` is present, validate user has edit permission on that project.
- `file_tree` response marks files that are already known datasets (include `existing_dataset_id` and current `refresh` value).
- `commitUploadSession` with a `project_id` updates the existing project instead of creating a new one.

- [ ] **Step 9: Support project update via upload-session with `project_id`**

### Step 10: Verify upload flow

Run:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all commands exit with code 0.

- [ ] **Step 10: Verify types, lint, and build pass**

### Step 11: Smoke test

Run: `pnpm test:smoke`

Expected: Upload and rendering smoke tests pass.

- [ ] **Step 11: Smoke test the upload flow**

### Step 12: Commit

```bash
git add lib/types.ts lib/server/db.ts lib/server/artifacts/ lib/server/serializers.ts app/api/v1/upload-sessions/ app/api/v1/projects/route.ts lib/server/storage.ts "app/(main)/publish/" app/view/
git commit -m "feat: interactive bundle upload with dataset binding"
```

- [ ] **Step 12: Commit**

## Review Checklist

- [ ] Protocol comes before platform abstraction.
- [ ] ZIP and SSRF hardening happen before shared/team production deployment.
- [ ] Sync queue is introduced before adding real Presto/S3/COS connectors.
- [ ] OpenAPI and typed client support the distribution-protocol positioning.
- [ ] Storage provider and full RBAC remain scoped follow-ups, not blocking P0 work.
- [ ] Existing local JSON mode remains easy to run.
- [ ] SQLite remains available, but ORM migration is not treated as P0.
- [ ] Upload-session flow preserves bundle path hierarchy and HTML relative references.
- [ ] Dynamic dataset files are protected during bundle re-upload (selective cleanup, not full wipe).
- [ ] CLI/Agent manifest-first path remains fully functional without upload sessions.
- [ ] All route handler changes verified with `pnpm build`.
- [ ] Sync, upload, and ZIP changes verified with `pnpm test:smoke`.
- [ ] SQLite migration id 2 added for `sync_jobs` table.
- [ ] SQLite migration id 3 added for `upload_sessions` table.
- [ ] JSON and SQLite normalization/defaults added for `syncJobs`, `uploadSessions`, and existing dataset `origin`.
- [ ] Worker updated to use claim endpoint instead of expecting synchronous sync response.
- [ ] Worker `drainQueuedJobs` handles server errors without crashing interval loop.
- [ ] Local file path sync restricted by `SYNC_LOCAL_BASE_DIR` in production.
- [ ] DNS rebinding limitation documented in deployment guide.
- [ ] `packages/client/tsconfig.json` ensures `pnpm typecheck` covers client source.
- [ ] `scripts/smoke-api.mjs` updated to expect 202 from sync trigger.
- [ ] `lib/server/serializers.ts` exposes dataset `origin` field in API responses.
- [ ] ZIP validation skips `__MACOSX` silently but throws on traversal attempts (no macOS UX regression).

## Execution Order

Recommended order:

1. Task 1: Protocol Manifest V1.
2. Task 2: ZIP Security Hardening.
3. Task 3: SSRF-Safe Sync Source Policy.
4. Task 4: Sync Job Model.
5. Task 5: OpenAPI and Typed Client Foundation.
6. Task 6: Brand and Product Repositioning.
7. Task 7: Bundle Upload Interaction and Dataset Binding.

Task 5 should follow Task 4 because the OpenAPI contract and typed client need the queued sync response shape.

Task 7 depends on Task 1 (manifest schema) and Task 2 (ZIP security). It can run in parallel with Tasks 3, 4, and 6 once Tasks 1–2 are complete, but should merge after the persisted-data defaults from Task 4 are understood.

Tasks 1–3 are independent of each other and can be parallelized.

Plan complete and saved for review. Choose Subagent-Driven execution for implementation after reviewing this document.
