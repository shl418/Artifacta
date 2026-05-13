# DataVision Fullstack Implementation Plan

## Goal

Turn the current frontend-only prototype into an open-source, self-hostable BI dashboard hosting platform. The first implementation should be runnable locally without external infrastructure while leaving clear extension points for production databases, object storage, SSO, schedulers, and a future CLI.

## Architecture

- Keep a single Next.js App Router application for the first open-source release.
- Add server-side modules under `lib/server` for authentication, persistence, file storage, API responses, and access control.
- Store metadata in a local JSON database at `DATA_DIR/datavision.json` during development.
- Store uploaded dashboard HTML/data artifacts under `UPLOAD_DIR/projects` and serve dashboards through controlled API routes.
- Use Cookie sessions for the web app and Bearer API keys for external API/agent workflows.
- Protect app routes with middleware, while allowing login, public dashboard preview, and API authentication endpoints.

## Implementation Phases

1. Project foundation
   - Add shared domain types and seed data.
   - Add local JSON database helpers with deterministic seed data.
   - Add local artifact storage helpers for dashboard HTML and datasets.
   - Add environment variable examples for local and production deployment.

2. Authentication and authorization
   - Add `/login` and `/api/v1/auth/login` for development-friendly SSO-style login.
   - Add signed session cookies and `/api/v1/auth/me`.
   - Add API key hashing, creation, listing, and deletion.
   - Add project access checks for private, team, public, owner, editor, and admin flows.

3. REST API MVP
   - Implement projects, folders, datasets, sync config/history, permissions, team members, and API keys.
   - Support multipart dashboard upload with `.html` and `.zip` artifact storage.
   - Parse basic dataset metadata for CSV and JSON files.
   - Return consistent JSON error envelopes.

4. Frontend integration
   - Replace core mock data flows with client-side API calls where it matters most: login, overview, project list, upload, preview, datasets, team, and API keys.
   - Keep the existing NIO-style visual system and shadcn components.
   - Add a real `/view/[projectId]` preview page using a sandboxed iframe.

5. Open-source readiness
   - Add `README.md`, `AGENTS.md`, `LICENSE`, `.env.example`, and deployment guidance.
   - Refresh `docs/API.md` so it matches the implemented local API.
   - Refresh `docs/PRODUCT.md` to distinguish implemented MVP from roadmap items.
   - Verify type checking, linting/build behavior, and document any remaining limitations.

## MVP Boundaries

- Local JSON/file storage is intentionally used for the first runnable release.
- SSO is represented by a development login flow and documented extension points for SAML/OIDC.
- COS/S3 and Presto sync endpoints persist configuration and create sync history entries, but do not yet connect to external services.
- ZIP dashboard uploads are stored as artifacts; single `.html` uploads render directly in preview.
- The CLI is documented and API-compatible, but a packaged CLI is left for the next milestone.

## Phase 2 Plan

The next phase turns the MVP into a more convincing open-source release while keeping the codebase easy to run locally.

1. Persistence adapter
   - Keep the current JSON database as a zero-dependency fallback.
   - Add a SQLite adapter selected by `DATA_DRIVER=sqlite`.
   - Add idempotent migrations that create relational tables for the current domain model.
   - Preserve the existing `readDatabase` / `updateDatabase` API so route handlers remain focused on product behavior.

2. ZIP dashboard hosting
   - Accept `.zip` uploads as first-class dashboard artifacts.
   - Extract safe entries into a hosted project directory.
   - Serve nested CSS, JS, image, and data assets through controlled API routes.
   - Reject unsafe paths and missing entry HTML files.

3. CLI workflow
   - Add a local `datavision` CLI for login hints, API key based uploads, project listing, and sync triggers.
   - Keep the CLI dependency-light so agents can call it from generated dashboard projects.
   - Document CI and local agent examples.

4. Sync worker
   - Add a worker command that scans enabled sync configs and triggers due jobs.
   - Implement manual/local file sync now, with clear adapter points for COS/S3 and Presto runners.
   - Record sync history and update dataset metadata consistently.

5. Demo and documentation polish
   - Replace simple seeded dashboards with polished, screenshot-worthy examples.
   - Generate README screenshots from the local demo app.
   - Add a Chinese README and rewrite both README files around the project story, install path, API/CLI path, and deployment path.

6. Verification
   - Run typecheck, lint, build, CLI smoke tests, API smoke tests, worker smoke tests, and browser preview checks.
   - Keep all generated data under `.datavision` and all committed demo assets under `public/demo`.
