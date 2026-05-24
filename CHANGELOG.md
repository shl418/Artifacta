# Changelog

## Unreleased

### Bundle upload and script sync

- **ZIP publish path:** `POST /upload-sessions` is required for ZIP create/update; direct `html_file` ZIP on `POST /projects` and `PUT /projects/:id/html` return `400 DEPRECATED`.
- **Manifest import:** Bundled `artifacta.json` is parsed on commit; valid user manifests are not overwritten. Supports widened `datasets[].kind`, optional `sync_scripts[]`, and `manifest_mode=auto` on `POST /projects`.
- **Upload UX:** `POST /upload-sessions` returns `manifest_detected`; Web upload skips the dataset wizard when present.
- **Bundle script sync:** New `ProjectSyncScript` model, `GET/PUT /projects/:id/sync-scripts/*`, test/trigger/status/history routes, and `POST /sync/script-jobs/claim` for workers. Python/Node scripts run in the extracted bundle with `ARTIFACTA_*` env vars; one active script job per project.
- **Re-upload protection:** `buildSyncProtectedPaths` also skips enabled script `outputs` and sync-enabled bundle dataset paths.
- **CLI:** ZIP upload/update via upload session; `sync-scripts list|set|trigger|status`; `bundle run-script` for local dev.
- **Docs:** `docs/API.md`, `docs/IMPLEMENTED-FEATURES.md`, `docs/protocol/manifest-v1.md`, OpenAPI routes, onboarding guides, and `docs/protocol/examples/script-sync-dashboard/artifacta.json`.

### Earlier unreleased notes

- Added runtime metadata (`packageManager`, Node version files), contributor/security docs, issue templates, PR template, examples, and `artifacta doctor`.
- Added CLI `--json` output for agent and CI use.
- Expanded `@artifacta/client` to build compiled JS and cover the core publish/dataset/sync workflow.
- Added maintained CSV/TSV parsing, upload limits, rate limiting, API key expiry defaults, audit logs, webhooks, dataset previews, and version history.
- Added Postgres metadata, S3-compatible artifact storage, OIDC login entry points, embed tokens, and S3/COS plus Presto/Trino sync connector branches.
- Marked `docs/PLAN.md` as archived and promoted the manifest v1 protocol contract from README and onboarding docs.
- Wired unit tests for CSV parsing, rate limiting, embed tokens, and version history into `pnpm test:unit`, and added a CI smoke job for end-to-end API flows.
- Enforced upload `Content-Length` limits via `requestPayloadTooLarge`, rate-limited API key creation, and improved overview/preview responsive UX with empty and retry states.
- Added scoped API keys, sync source validation/test endpoint, operations settings UI, expanded sync config examples, and production secret checks via `instrumentation.ts`.
- Added sync source validation/test endpoint, API key scopes and usage rate limits, dataset sync run history UI, project activity/embed/rollback, and an admin operations console for webhooks and audit logs.

