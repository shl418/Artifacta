# Implemented Feature Index

This file is the maintenance checklist for keeping code and documentation in sync. If a route, CLI command, page, or server capability changes, update the matching docs in the same PR.

## User-Facing Surfaces

| Surface | Implemented Code | Primary Docs |
| --- | --- | --- |
| Web console shell, dashboard home, project list, upload, settings | `app/page.tsx`, `app/dashboards/page.tsx`, `app/upload/page.tsx`, `app/settings/**` (`app/datasets/page.tsx` now redirects to `/dashboards`) | `README.md`, `README-EN.md`, `docs/PRODUCT.md` |
| Project management surface (datasets + bundle sync scripts) | `app/projects/[projectId]/page.tsx` | `README.md`, `docs/API.md` |
| Bundle ZIP upload wizard | `app/upload/page.tsx` | `docs/API.md`, `docs/ONBOARDING.md`, `docs/protocol/manifest-v1.md` |
| Dashboard preview | `app/view/[projectId]/page.tsx`, `app/api/v1/projects/[projectId]/html/render/route.ts`, `app/api/v1/projects/[projectId]/html/[...assetPath]/route.ts` | `docs/API.md`, `docs/DEPLOYMENT.md` |
| API key and CLI onboarding | `app/settings/api/page.tsx`, `app/api/v1/api-keys/**`, `packages/cli/bin/artifacta.mjs` | `docs/API.md`, `docs/ONBOARDING.md`, `docs/ONBOARDING.zh-CN.md`, `packages/cli/README.md` |
| Team and project permissions | `app/settings/team/page.tsx`, `app/settings/permissions/page.tsx`, `app/settings/operations/page.tsx`, `app/api/v1/team/**`, `app/api/v1/projects/[projectId]/permissions/**`, `app/api/v1/webhooks/**`, `app/api/v1/audit-logs` | `docs/API.md`, `docs/PRODUCT.md` |

## API Routes

| Capability | Routes | Notes |
| --- | --- | --- |
| Auth | `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout` | Email login for local/open-source use. |
| OIDC | `GET /api/v1/auth/oidc/login`, `GET /api/v1/auth/oidc/callback` | Enabled when OIDC environment variables are configured. |
| Projects | `GET/POST /api/v1/projects`, `GET/PATCH/DELETE /api/v1/projects/:projectId`, `PATCH /api/v1/projects/:projectId/folder` | Responses use snake_case through serializers. |
| Dashboard artifacts | `PUT /api/v1/projects/:projectId/html`, `GET /api/v1/projects/:projectId/html/render`, `GET /api/v1/projects/:projectId/html/:assetPath` | Single `.html` updates via `PUT /html`. ZIP create/update uses upload sessions only. |
| Dashboard versions and embeds | `GET /api/v1/projects/:projectId/versions`, `POST /api/v1/projects/:projectId/versions/:versionId/rollback`, `POST /api/v1/projects/:projectId/embed-token`, `GET /embed/:projectId` | Embed access uses signed short-lived tokens and sandboxed previews. |
| Upload sessions | `POST /api/v1/upload-sessions` | ZIP inspect + commit via `POST /projects` with `upload_session_id`. Returns `manifest_detected` when `artifacta.json` is present. Bundle datasets imported from manifest or auto-discovered. Supports `project_id` for updates. |
| Bundle manifest import | `lib/server/artifacts/manifest.ts`, `manifest-import.ts`, `upload-session.ts` | Bundled `artifacta.json` is preserved when valid; server generates manifest only when missing. See `docs/protocol/manifest-v1.md`. |
| Bundle script sync | `GET/PUT /api/v1/projects/:projectId/sync-scripts`, `.../test`, `.../trigger`, `.../status`, `.../history`, `POST /api/v1/sync/script-jobs/claim` | Python/Node scripts run in extracted bundle; multi-output history; one queued/running job per project. |
| Folders | `GET/POST /api/v1/folders`, `PATCH/DELETE /api/v1/folders/:folderId` | Deleting a folder moves projects to root or `move_to`. |
| Datasets | `GET /api/v1/datasets`, `GET/POST /api/v1/projects/:projectId/datasets`, `GET/PUT/DELETE /api/v1/projects/:projectId/datasets/:datasetId`, `GET /api/v1/projects/:projectId/datasets/:datasetId/preview`, `GET /api/v1/projects/:projectId/datasets/:datasetId/versions` | CSV/TSV/JSON/JSONL get schema and sample preview; XLSX and other files are stored without structured parsing. |
| Dataset sync (manual-only / removed-source tombstone) | `GET/PUT /api/v1/projects/:projectId/datasets/:datasetId/sync`, `GET .../status`, `GET .../history`, `POST .../test`, `POST .../trigger`, `POST /api/v1/sync/jobs/claim` | `GET/PUT` only persist a `manual` static config; `status`/`history` read past runs; `test`/`trigger` return `410 SYNC_REMOVED`; `jobs/claim` is a `{ job: null }` stub. External URL/COS/Presto sources were removed — dynamic updates use bundle script sync. |
| Permissions | `GET/POST /api/v1/projects/:projectId/permissions`, `PATCH/DELETE /api/v1/projects/:projectId/permissions/:userId` | Project member permissions are `view` or `edit`. |
| Team | `GET/POST /api/v1/team/members`, `PATCH/DELETE /api/v1/team/members/:userId`, `POST /api/v1/team/invitations` | Admin-only writes. |
| API keys | `GET/POST /api/v1/api-keys`, `DELETE /api/v1/api-keys/:keyId` | Secret value is returned only on create. Optional `scopes` restrict API key access. |
| Stats | `GET /api/v1/stats` | Returns summary counts plus recent and popular projects. |
| Webhooks and audit logs | `GET/POST /api/v1/webhooks`, `PATCH/DELETE /api/v1/webhooks/:webhookId`, `GET /api/v1/audit-logs` | Admin-only operator endpoints. |

## CLI Commands

| Command | API Used | Documented In |
| --- | --- | --- |
| `artifacta projects list [--search text]` | `GET /projects` | `docs/API.md`, `packages/cli/README.md` |
| `artifacta projects upload --file ...` (`.html` direct, `.zip` via upload session) | `POST /upload-sessions`, `POST /projects` | `README.md`, `docs/ONBOARDING.md`, `docs/API.md` |
| `artifacta projects update-html --project-id ... --file ...` (`.html` → `PUT /html`; `.zip` → upload session) | `PUT /projects/:id/html` or upload session | `README.md`, `docs/API.md` |
| `artifacta sync-scripts list|set|trigger|status --project-id ... [--script-id ...]` | `/projects/:id/sync-scripts/*` | `docs/API.md`, `packages/cli/README.md` |
| `artifacta bundle run-script --file ... --bundle-root ...` | Local dev helper (sets `ARTIFACTA_*` env, spawns script) | `packages/cli/README.md` |
| `artifacta datasets list [--source ...]` | `GET /datasets` | `README.md`, `docs/API.md` |
| `artifacta datasets upload --project-id ... --file ... [--name ...]` | `POST /projects/:projectId/datasets` | `docs/API.md`, `packages/cli/README.md` |
| `artifacta datasets replace --project-id ... --dataset-id ... --file ...` | `PUT /projects/:projectId/datasets/:datasetId` | `docs/API.md`, `packages/cli/README.md` |
| `artifacta datasets sync set --project-id ... --dataset-id ...` (deprecated) | `PUT /projects/:projectId/datasets/:datasetId/sync` | Manual-only; external source types removed. Use `sync-scripts` for dynamic updates. |
| `artifacta sync trigger --project-id ... --dataset-id ...` (deprecated) | `POST /projects/:projectId/datasets/:datasetId/sync/trigger` → `410 SYNC_REMOVED` | Use `sync-scripts trigger` instead. |
| `artifacta doctor [--app-url ...]` | App root and `GET /projects` when API key is present | `README.md`, `packages/cli/README.md` |

## Storage And Runtime

| Capability | Code | Docs |
| --- | --- | --- |
| JSON persistence | `lib/server/db.ts` | `README.md`, `docs/DEPLOYMENT.md` |
| SQLite persistence | `lib/server/db.ts` | `README.md`, `docs/DEPLOYMENT.md` |
| Postgres persistence | `lib/server/db.ts` | `README.md`, `docs/DEPLOYMENT.md` |
| Local artifact storage | `lib/server/storage.ts` | `README.md`, `docs/DEPLOYMENT.md` |
| S3-compatible artifact storage | `lib/server/object-storage.ts`, `lib/server/storage.ts` | `README.md`, `docs/DEPLOYMENT.md` |
| ZIP validation and extraction | `lib/server/artifacts/zip-security.ts`, `lib/server/storage.ts` | `docs/API.md`, `docs/DEPLOYMENT.md` |
| Manifest parser (`sync_scripts`, widened dataset kinds) | `lib/server/artifacts/manifest.ts` | `docs/protocol/manifest-v1.md` |
| Script sync runner | `lib/server/sync/script-runner.ts`, `script-jobs.ts`, `cron.ts` | `docs/API.md`, `docs/DEPLOYMENT.md` |
| Re-upload path protection | `buildSyncProtectedPaths` in `upload-session.ts` | `docs/API.md`, `docs/plans/2026-05-24-custom-script-sync-and-bundle-upload.md` |
| Rate limiting | `lib/server/rate-limit.ts` | `docs/DEPLOYMENT.md`, `SECURITY.md` |
| Seeded demo data and dashboards | `lib/server/demo-artifacts.ts` | `README.md`, `README-EN.md` |

## Bundle Upload Quick Reference

| Action | Recommended path |
| --- | --- |
| Create ZIP project | `POST /upload-sessions` → `POST /projects` with `upload_session_id` |
| ZIP with `artifacta.json` | Same; manifest drives dataset bindings on commit |
| Update ZIP project | `POST /upload-sessions` with `project_id` → commit with `upload_session_id` |
| Replace single HTML file | `PUT /projects/:id/html` with `.html` only |
| Direct `POST /projects` with ZIP | **Rejected** (`400 DEPRECATED`) — use upload session |

### Hosting Constraints (enforced)

| Rule | Enforcement | Error code |
| --- | --- | --- |
| Bundle entrypoint resolution: manifest `entrypoint` → root `index.html` → nested `index.html` | `lib/server/artifacts/entrypoint.ts`, `lib/server/storage.ts`, `lib/server/artifacts/upload-session.ts` | `MANIFEST_ENTRYPOINT_MISSING`, `NO_ENTRYPOINT` |
| Single HTML per bundle | `lib/server/artifacts/bundle-validation.ts`, blocked at runtime by `classifyDashboardAssetRequest` | `MULTIPLE_HTML_FILES` (upload), `ASSET_BLOCKED` (`reason: "html_sibling"` runtime) |
| Single-file `.html` upload has no asset route | `lib/server/artifacts/asset-routing.ts` | `ASSET_BLOCKED` (`reason: "not_zip_bundle"`) |
| Dataset `kind` matches path extension | `lib/server/artifacts/manifest.ts` superRefine | `INVALID_BUNDLED_MANIFEST` containing `DATASET_KIND_EXTENSION_MISMATCH` |
| Dataset extensions outside the MIME map fall back to `application/octet-stream` | `lib/server/artifacts/bundle-validation.ts` | Returned as `warnings[].code = "DATASET_MIME_FALLBACK"` in upload response |
| Asset Cache-Control respects project visibility | `lib/server/artifacts/cache-control.ts` | `private, max-age=300` for `private`/`team`; `public, max-age=300` for `public` |

## Examples

- `examples/`: flat walkthrough bundles (`0-single-html` … `4-html-csv-script`) in `examples/WALKTHROUGH.zh-CN.md`; no pre-made `artifacta.json`.

## Not Implemented Yet

These are intentionally documented as roadmap or extension points only:

- Filesystem/network/memory isolation for bundle script subprocesses. The current runner is for trusted editors only.
- Scheduled script execution. Bundle scripts are manually triggered and `schedule` / `next_run_at` remain `null`.
- SAML SSO
- MySQL metadata adapter
- Password-protected public links
- Project owner transfer
