# Artifacta Open Source Excellence Roadmap

Date: 2026-05-21

## Context

Artifacta already has a credible open-source MVP: a Next.js App Router console, protected dashboard previews, HTML/ZIP artifact hosting, CSV/JSON dataset inspection, project permissions, API keys, JSON/SQLite persistence, a lightweight CLI, and an API-driven sync worker.

The latest documentation updates improve the project story and, importantly, separate implemented behavior from roadmap and enterprise extension points. The remaining work is less about proving the product exists and more about making it easy to adopt, easy to trust, and easy to contribute to.

Priority order:

1. Developer adoption
2. Product experience
3. Enterprise production hardening

## Phase 1: Developer Adoption

Goal: make a new developer or AI coding agent succeed from a clean checkout without guesswork.

- Add `packageManager` to the root `package.json` and document the exact Node/pnpm expectation in `README.md`, `README.zh-CN.md`, and `docs/DEVELOPMENT-ENVIRONMENT.md`.
- Add `.nvmrc` or `.node-version` matching the supported Node line so non-`fnm` users can still land on a valid runtime.
- Keep `docs/IMPLEMENTED-FEATURES.md` as the source of truth for code-to-doc coverage, and add it to PR review expectations.
- Replace the old historical `docs/PLAN.md` or mark it as archived, because it still describes work that is now implemented and can mislead contributors.
- Add `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, issue templates, and a PR template with the expected checks.
- Add a minimal `examples/` directory with:
  - single-file HTML dashboard
  - ZIP dashboard with local CSS/JS/assets
  - CSV and JSON datasets
  - CLI publish script
  - sample sync config using `mock_rows` or URL/local file source
- Add `artifacta doctor` or an equivalent script that checks Node, pnpm, app URL, API key, and basic API connectivity.
- Improve CLI output with a `--json` flag for agent/CI use while keeping the current table output for humans.

Acceptance checks:

- A fresh clone can follow README from install to preview link.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm cli:pack` run under the documented toolchain.
- Examples can be published through the repo-local CLI.
- New contributors can tell which features are implemented, partial, or roadmap without reading route handlers.

## Phase 2: API And Protocol Trust

Goal: make the API and Artifacta protocol feel stable enough for external tools.

- Expand `docs/openapi/artifacta.v1.yaml` beyond the current partial contract to cover auth, folders, upload sessions, permissions, team members, API keys, dataset sync config/status/history, stats, and error envelopes.
- Add an OpenAPI consistency test or route smoke test that validates key status codes and snake_case response fields against documented examples.
- Tighten `docs/API.md` examples so they use local URLs and implemented response shapes rather than aspirational CDN/app domains where possible.
- Promote `docs/protocol/manifest-v1.md` as the stable bundle contract and link it from README, onboarding, and CLI docs.
- Add a package build step for `@artifacta/client` so external consumers do not import raw TypeScript from `src/index.ts`.
- Expand `@artifacta/client` to cover the core public workflow: list projects, upload project, update HTML, upload/replace dataset, set sync config, trigger sync, and parse API error envelopes.
- Version the API/protocol intentionally: keep `/api/v1`, manifest v1, and changelog entries aligned when fields change.

Acceptance checks:

- OpenAPI names every implemented public route listed in `docs/IMPLEMENTED-FEATURES.md`.
- Client package has compiled JS and `.d.ts` outputs.
- API docs, OpenAPI, CLI docs, and route behavior agree on request and response fields.
- Breaking changes require an explicit changelog note.

## Phase 3: Product Experience

Goal: make the web app feel reliable for repeated daily use, not just a demo path.

- Improve fetch error handling across dashboard list, upload, datasets, team, permissions, and settings pages with visible failure states and retry paths.
- Add confirmation and recovery UX for destructive actions such as deleting projects, deleting datasets, disabling team members, and deleting API keys.
- Make upload limits and supported formats visible before upload, including ZIP entry count, total size, blocked extensions, and dataset parsing limitations.
- Add richer empty states for first-run flows: no projects, no datasets, no API keys, no sync history, no team members beyond the current user.
- Add a project detail/settings surface that exposes metadata, visibility, folder, collaborators, datasets, sync status, and recent activity in one place.
- Add dataset preview and version history. CSV/JSON can show schema and sample rows first; other file types should clearly say they are stored but not structurally parsed.
- Add sync run feedback in the UI: queued, running, success, failed, rows synced, failure message, and next run time.
- Add basic responsive QA for the main console pages and preview frame.

Acceptance checks:

- Common API failures are visible to users instead of silently failing.
- A user can manage a project, its datasets, permissions, and sync state without relying on API docs.
- Upload and sync failures explain the exact actionable reason.
- The UI remains usable on common laptop and mobile widths.

## Phase 4: Engineering Quality And Safety

Goal: make maintainers comfortable accepting outside contributions and running shared deployments.

- Add CI for typecheck, lint, build, smoke tests, ZIP security tests, sync source policy tests, upload session tests, client package tests, and CLI pack tests.
- Replace the hand-written CSV parser with a maintained parser that handles quoted newlines, escaped quotes, delimiters, encodings, and large files more predictably.
- Decide whether XLSX should be supported structurally. If yes, add parser support; if no, keep docs consistently saying XLSX is stored but not inspected.
- Add global upload/body size controls and align API errors, UI copy, deployment docs, and ZIP limits.
- Add rate limiting for auth, API key usage, upload, and sync trigger endpoints.
- Strengthen session and API key security with secret validation, optional API key expiry defaults, and eventually scoped API keys.
- Keep dashboard previews sandboxed and document the recommended separate preview domain for shared deployments.
- Review sync URL fetching for DNS rebinding risk; keep allowlists narrow and consider an implementation that pins resolved IPs or delegates protection to network policy.

Acceptance checks:

- CI runs all required checks on pull requests.
- Security-sensitive boundaries have tests and documentation.
- Dataset parsing behavior is predictable and documented.
- Shared self-hosted deployments have clear hardening instructions.

## Phase 5: Enterprise Production Track

Goal: add enterprise capabilities after the open-source developer loop and product core are reliable.

- Add Postgres as the first production metadata adapter while keeping JSON for demos and SQLite for single-node self-hosting.
- Add S3-compatible object storage for artifacts and datasets, including migration guidance from local disk.
- Add OIDC login before SAML unless a target customer requires SAML first.
- Add real S3/COS/R2 and Presto/Trino sync connectors behind `lib/server/sync-runner.ts`.
- Add webhook notifications for upload, permission changes, and sync success/failure.
- Add audit logs, access analytics, dashboard version history, and rollback.
- Add embed support with explicit access controls and documented sandbox behavior.

Acceptance checks:

- Multi-instance deployment no longer depends on local disk or SQLite writes.
- Enterprise identity can replace email login cleanly.
- Connectors have isolated configuration, validation, test hooks, and failure reporting.
- Operators can observe who changed what and when sync jobs fail.

## Plan Updates From The Previous Review

- The environment problem is now documented in `docs/DEVELOPMENT-ENVIRONMENT.md`; the remaining action is to encode it into project metadata and CI.
- The implemented feature inventory now exists in `docs/IMPLEMENTED-FEATURES.md`; the next step is to enforce it in contribution workflow.
- `docs/PRODUCT.md` now correctly marks OIDC/SAML, object storage, real warehouse connectors, owner transfer, and commercial packaging as roadmap or extension points.
- The biggest remaining documentation mismatch is the partial OpenAPI contract and the stale historical `docs/PLAN.md`.
- The next best work is not adding enterprise features immediately; it is making the current MVP externally repeatable, testable, and pleasant to adopt.
