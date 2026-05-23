# Changelog

## Unreleased

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

