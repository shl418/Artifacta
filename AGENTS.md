# AGENTS.md

This repository is intended to be friendly to coding agents and human maintainers.

## Product Intent

DataVision hosts HTML dashboards generated locally by users and coding agents. The platform should make upload, preview, sharing, permissions, datasets, and automation APIs boringly reliable for enterprise teams.

## Current Architecture

- The app is a single Next.js App Router project.
- Server-only logic lives under `lib/server`.
- Shared domain types live in `lib/types.ts`.
- API routes live under `app/api/v1` and should return the JSON error envelope from `lib/server/responses.ts`.
- Persistence is selected with `DATA_DRIVER=json|sqlite`. JSON uses `.datavision/datavision.json`; SQLite uses `SQLITE_PATH`.
- Uploaded artifacts live under `.datavision/uploads`. ZIP dashboards are extracted under `projects/:projectId/bundle` and served through protected API routes.
- Web auth uses the `datavision_session` HTTP-only cookie. API auth uses Bearer API keys.
- `packages/cli` contains the standalone publishable CLI package. `bin/datavision.mjs` is the repo-local wrapper entrypoint. `scripts/sync-worker.mjs` is the API-driven worker.
- Polished seeded dashboards live in `lib/server/demo-artifacts.ts` and are copied into `.datavision` at runtime.

## Development Rules

- Run `pnpm typecheck` before finishing backend or frontend changes.
- Run `pnpm build` when touching route handlers, middleware, auth, or Next.js configuration.
- Keep API response fields snake_case to match `docs/API.md`.
- Keep internal TypeScript fields camelCase to match `lib/types.ts`.
- Do not import Node-only modules into `proxy.ts`.
- Treat uploaded dashboard HTML as untrusted content. Keep previews sandboxed and avoid serving them with the main app privileges.
- Do not commit `.datavision`, `.env`, `.next`, or generated runtime artifacts.
- Run `pnpm test:smoke` against a running app when touching auth, upload, ZIP rendering, API keys, or sync behavior.
- Run `pnpm cli:pack` when touching `packages/cli` or external CLI onboarding docs.

## Extension Points

- Extend the adapter branch in `lib/server/db.ts` when adding Postgres/MySQL. Keep `readDatabase` and `updateDatabase` stable until route handlers are intentionally refactored.
- Replace `lib/server/storage.ts` with object storage when adding S3/COS.
- Replace `app/api/v1/auth/login` with SAML/OIDC when adding enterprise SSO.
- Add COS/S3/Presto clients behind `lib/server/sync-runner.ts`; the API trigger and worker already share that execution path.
