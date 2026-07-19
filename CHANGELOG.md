# Changelog

## Unreleased

### Publisher onboarding and interaction reliability

- Added a working global Help entry with an in-app publishing guide, direct API Key navigation, current-site environment commands, skill installation, CLI doctor, and publish examples.
- Verified project-local installation with `npx -y skills@latest add github:shl418/Artifacta --skill artifacta-publisher`; updated the skill, READMEs, onboarding, and API & CLI page around the same zero-repo path.
- Aligned the publisher skill and protocol docs with the shipped manual-only script sync model. Removed stale URL/COS/Presto, cron, egress, and memory-sandbox promises.
- Updated `@artifacta/cli` to `0.1.2`; CLI help now lists `sync-scripts set` and no longer advertises the removed dataset sync trigger.
- Enabled the existing theme control, made language selection consistent, removed misleading editable-but-unsavable settings, and added accessible names/keyboard behavior to key controls.

### Project create: bundle-only data

- **Removed** `POST /projects` fields `data_files`, `datasets`, and `manifest_mode`. Data must live inside the ZIP; bindings come from bundled `artifacta.json` or server-side auto-discovery.
- **Upload UI:** single form for HTML or ZIP; no separate dataset upload or ZIP dataset wizard.
- **CLI / client:** dropped `--data-file` on `projects upload`; ZIP publish no longer sends manifest/datasets form fields.

### Local-preview contract and hosting reliability

- **SKILL + ONBOARDING:** added a "preview over HTTP" step (no `file://`), four hard hosting constraints (ZIP-required, single-page, relative paths only, CSV/JSON preferred), and a ban on file-picker fallbacks for BI dashboards.
- **Example `examples/data-dashboard/`:** minimal dashboard that `fetch()`-loads `data/sales.csv` — same path locally and on Artifacta.
- **Cache-Control by visibility:** bundle asset responses now use `private, max-age=300` for `private`/`team` projects; only `public` projects keep `public, max-age=300`. Prevents shared caches from leaking gated assets.
- **ZIP entrypoint convergence:** both upload paths now share `resolveBundleEntryPath` — manifest `entrypoint` is honored first, then root `index.html`, then the first nested `index.html`. Missing manifest entrypoints raise `MANIFEST_ENTRYPOINT_MISSING`.
- **Upload-time validation (`validateBundleForHosting`):** bundles with multiple HTML files are now rejected with `MULTIPLE_HTML_FILES`; dataset `kind`/extension mismatches are rejected as `DATASET_KIND_EXTENSION_MISMATCH` inside `INVALID_BUNDLED_MANIFEST`; datasets with extensions outside the MIME map produce a `DATASET_MIME_FALLBACK` warning surfaced in the upload response.
- **`getProjectById` on the html asset route:** removes the O(full-DB) `Array.find` per asset request; SQLite uses an indexed primary-key lookup.
- **`ASSET_BLOCKED` error code:** asset route now distinguishes blocked-by-design requests (`reason: "html_sibling" | "not_zip_bundle"`) from genuinely missing files (`NOT_FOUND`).
- **Stale `zipPlaceholderHtml` removed:** ZIP bundles with incomplete metadata now return `BUNDLE_INCOMPLETE` instead of a misleading "coming soon" page.
- **MIME helper extracted:** `lib/server/artifacts/mime.ts` is now the single source of truth for `contentTypeForPath` and blocked-host extensions.

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
