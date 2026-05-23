# Artifacta Open Source Excellence Roadmap

Date: 2026-05-21  
Status: **Phases 1–4 implemented** on branch `feat/open-source-excellence`. Phase 5 enterprise items that remain intentionally out of scope are listed at the end.

## Context

Artifacta already has a credible open-source MVP: a Next.js App Router console, protected dashboard previews, HTML/ZIP artifact hosting, CSV/JSON dataset inspection, project permissions, API keys, JSON/SQLite persistence, a lightweight CLI, and an API-driven sync worker.

The latest documentation updates improve the project story and, importantly, separate implemented behavior from roadmap and enterprise extension points. The remaining work is less about proving the product exists and more about making it easy to adopt, easy to trust, and easy to contribute to.

Priority order:

1. Developer adoption
2. Product experience
3. Enterprise production hardening

## Phase 1: Developer Adoption — Done

Goal: make a new developer or AI coding agent succeed from a clean checkout without guesswork.

- [x] Add `packageManager` to the root `package.json` and document the exact Node/pnpm expectation in `README.md`, `README.zh-CN.md`, and `docs/DEVELOPMENT-ENVIRONMENT.md`.
- [x] Add `.nvmrc` or `.node-version` matching the supported Node line so non-`fnm` users can still land on a valid runtime.
- [x] Keep `docs/IMPLEMENTED-FEATURES.md` as the source of truth for code-to-doc coverage, and add it to PR review expectations.
- [x] Replace the old historical `docs/PLAN.md` or mark it as archived, because it still describes work that is now implemented and can mislead contributors.
- [x] Add `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, issue templates, and a PR template with the expected checks.
- [x] Add a minimal `examples/` directory with HTML, ZIP, CSV/JSON datasets, CLI publish script, and sync config samples (`mock_rows`, URL, local file).
- [x] Add `artifacta doctor` or an equivalent script that checks Node, pnpm, app URL, API key, and basic API connectivity.
- [x] Improve CLI output with a `--json` flag for agent/CI use while keeping the current table output for humans.

## Phase 2: API And Protocol Trust — Done

Goal: make the API and Artifacta protocol feel stable enough for external tools.

- [x] Expand `docs/openapi/artifacta.v1.yaml` beyond the partial contract to cover auth, folders, upload sessions, permissions, team members, API keys, dataset sync config/status/history/test, stats, and error envelopes.
- [x] Add an OpenAPI consistency test or route smoke test that validates key status codes and snake_case response fields against documented examples.
- [x] Tighten `docs/API.md` examples so they use local URLs and implemented response shapes rather than aspirational CDN/app domains where possible.
- [x] Promote `docs/protocol/manifest-v1.md` as the stable bundle contract and link it from README, onboarding, and CLI docs.
- [x] Add a package build step for `@artifacta/client` so external consumers do not import raw TypeScript from `src/index.ts`.
- [x] Expand `@artifacta/client` to cover the core public workflow: list projects, upload project, update HTML, upload/replace dataset, set sync config, trigger sync, and parse API error envelopes.
- [x] Version the API/protocol intentionally: keep `/api/v1`, manifest v1, and changelog entries aligned when fields change.

## Phase 3: Product Experience — Done

Goal: make the web app feel reliable for repeated daily use, not just a demo path.

- [x] Improve fetch error handling across dashboard list, upload, datasets, team, permissions, and settings pages with visible failure states and retry paths.
- [x] Add confirmation and recovery UX for destructive actions such as deleting projects, deleting datasets, disabling team members, and deleting API keys.
- [x] Make upload limits and supported formats visible before upload, including ZIP entry count, total size, blocked extensions, and dataset parsing limitations.
- [x] Add richer empty states for first-run flows: no projects, no datasets, no API keys, no sync history, no team members beyond the current user.
- [x] Add a project detail/settings surface that exposes metadata, visibility, folder, collaborators, datasets, sync status, recent activity, embed links, and version rollback.
- [x] Add dataset preview and version history. CSV/JSON can show schema and sample rows first; other file types should clearly say they are stored but not structurally parsed.
- [x] Add sync run feedback in the UI: queued, running, success, failed, rows synced, failure message, and next run time.
- [x] Add basic responsive QA for the main console pages and preview frame.

## Phase 4: Engineering Quality And Safety — Done

Goal: make maintainers comfortable accepting outside contributions and running shared deployments.

- [x] Add CI for typecheck, lint, build, smoke tests, ZIP security tests, sync source policy tests, upload session tests, client package tests, and CLI pack tests.
- [x] Replace the hand-written CSV parser with a maintained parser that handles quoted newlines, escaped quotes, delimiters, encodings, and large files more predictably.
- [x] Decide whether XLSX should be supported structurally. **Decision:** XLSX is stored but not structurally inspected; docs and upload UI state this explicitly.
- [x] Add global upload/body size controls and align API errors, UI copy, deployment docs, and ZIP limits.
- [x] Add rate limiting for auth, API key usage, upload, and sync trigger endpoints.
- [x] Strengthen session and API key security with secret validation, optional API key expiry defaults, and scoped API keys.
- [x] Keep dashboard previews sandboxed and document the recommended separate preview domain for shared deployments.
- [x] Review sync URL fetching for DNS rebinding risk; keep allowlists narrow and document network-layer mitigation.

## Phase 5: Enterprise Production Track — Partial / Extension Points

Goal: add enterprise capabilities after the open-source developer loop and product core are reliable.

- [x] Add Postgres as the first production metadata adapter while keeping JSON for demos and SQLite for single-node self-hosting.
- [x] Add S3-compatible object storage for artifacts and datasets, including migration guidance from local disk.
- [x] Add OIDC login before SAML unless a target customer requires SAML first.
- [x] Add real S3/COS/R2 and Presto/Trino sync connectors behind `lib/server/sync-runner.ts` with config validation and `sync/test` hooks.
- [x] Add webhook notifications for upload, permission changes, and sync success/failure.
- [x] Add audit logs, dashboard version history, rollback, and embed support with sandboxed previews.
- [ ] **SAML SSO** — not implemented; documented as extension point only.
- [ ] **MySQL metadata adapter** — not implemented.
- [ ] **Password-protected public links** — not implemented.
- [ ] **Project owner transfer** — not implemented.
- [ ] **Dedicated access analytics product surface** — use `GET /stats` and audit logs today; richer analytics remain future work.

## Plan Updates From The Previous Review

- The environment problem is documented in `docs/DEVELOPMENT-ENVIRONMENT.md` and encoded in project metadata and CI.
- The implemented feature inventory lives in `docs/IMPLEMENTED-FEATURES.md` and is referenced from contributor workflow.
- `docs/PRODUCT.md` correctly marks SAML, MySQL, owner transfer, and commercial packaging as roadmap or extension points.
- OpenAPI, API docs, CLI docs, and route behavior are kept aligned via `pnpm test:api-contract` and `pnpm test:smoke`.
