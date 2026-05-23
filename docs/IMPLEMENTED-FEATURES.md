# Implemented Feature Index

This file is the maintenance checklist for keeping code and documentation in sync. If a route, CLI command, page, or server capability changes, update the matching docs in the same PR.

## User-Facing Surfaces

| Surface | Implemented Code | Primary Docs |
| --- | --- | --- |
| Web console shell, dashboard home, project list, upload, datasets, settings | `app/page.tsx`, `app/dashboards/page.tsx`, `app/upload/page.tsx`, `app/datasets/page.tsx`, `app/settings/**` | `README.md`, `README.zh-CN.md`, `docs/PRODUCT.md` |
| Project management surface | `app/projects/[projectId]/page.tsx` | `README.md`, `docs/API.md` |
| Dashboard preview | `app/view/[projectId]/page.tsx`, `app/api/v1/projects/[projectId]/html/render/route.ts`, `app/api/v1/projects/[projectId]/html/[...assetPath]/route.ts` | `docs/API.md`, `docs/DEPLOYMENT.md` |
| API key and CLI onboarding | `app/settings/api/page.tsx`, `app/api/v1/api-keys/**`, `packages/cli/bin/artifacta.mjs` | `docs/API.md`, `docs/ONBOARDING.md`, `docs/ONBOARDING.zh-CN.md`, `packages/cli/README.md` |
| Team and project permissions | `app/settings/team/page.tsx`, `app/settings/permissions/page.tsx`, `app/api/v1/team/**`, `app/api/v1/projects/[projectId]/permissions/**` | `docs/API.md`, `docs/PRODUCT.md` |

## API Routes

| Capability | Routes | Notes |
| --- | --- | --- |
| Auth | `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout` | Email login for local/open-source use. |
| OIDC | `GET /api/v1/auth/oidc/login`, `GET /api/v1/auth/oidc/callback` | Enabled when OIDC environment variables are configured. |
| Projects | `GET/POST /api/v1/projects`, `GET/PATCH/DELETE /api/v1/projects/:projectId`, `PATCH /api/v1/projects/:projectId/folder` | Responses use snake_case through serializers. |
| Dashboard artifacts | `PUT /api/v1/projects/:projectId/html`, `GET /api/v1/projects/:projectId/html/render`, `GET /api/v1/projects/:projectId/html/:assetPath` | HTML and ZIP bundles are served through protected API routes. |
| Dashboard versions and embeds | `GET /api/v1/projects/:projectId/versions`, `POST /api/v1/projects/:projectId/versions/:versionId/rollback`, `POST /api/v1/projects/:projectId/embed-token`, `GET /embed/:projectId` | Embed access uses signed short-lived tokens and sandboxed previews. |
| Upload sessions | `POST /api/v1/upload-sessions` | Used by the Web upload flow to inspect ZIP bundles before committing them. |
| Folders | `GET/POST /api/v1/folders`, `PATCH/DELETE /api/v1/folders/:folderId` | Deleting a folder moves projects to root or `move_to`. |
| Datasets | `GET /api/v1/datasets`, `GET/POST /api/v1/projects/:projectId/datasets`, `GET/PUT/DELETE /api/v1/projects/:projectId/datasets/:datasetId`, `GET /api/v1/projects/:projectId/datasets/:datasetId/preview`, `GET /api/v1/projects/:projectId/datasets/:datasetId/versions` | CSV/TSV/JSON/JSONL get schema and sample preview; XLSX and other files are stored without structured parsing. |
| Dataset sync | `GET/PUT /api/v1/projects/:projectId/datasets/:datasetId/sync`, `POST /api/v1/projects/:projectId/datasets/:datasetId/sync/trigger`, `GET /api/v1/projects/:projectId/datasets/:datasetId/sync/status`, `GET /api/v1/projects/:projectId/datasets/:datasetId/sync/history`, `POST /api/v1/sync/jobs/claim` | Worker executes local file, upload path, URL, and `mock_rows` sources. |
| Permissions | `GET/POST /api/v1/projects/:projectId/permissions`, `PATCH/DELETE /api/v1/projects/:projectId/permissions/:userId` | Project member permissions are `view` or `edit`. |
| Team | `GET/POST /api/v1/team/members`, `PATCH/DELETE /api/v1/team/members/:userId`, `POST /api/v1/team/invitations` | Admin-only writes. |
| API keys | `GET/POST /api/v1/api-keys`, `DELETE /api/v1/api-keys/:keyId` | Secret value is returned only on create. |
| Stats | `GET /api/v1/stats` | Returns summary counts plus recent and popular projects. |
| Webhooks and audit logs | `GET/POST /api/v1/webhooks`, `PATCH/DELETE /api/v1/webhooks/:webhookId`, `GET /api/v1/audit-logs` | Admin-only operator endpoints. |

## CLI Commands

| Command | API Used | Documented In |
| --- | --- | --- |
| `artifacta projects list [--search text]` | `GET /projects` | `docs/API.md`, `packages/cli/README.md` |
| `artifacta projects upload --file ... --name ... [--data-file ...] [--folder-id ...] [--visibility ...]` | `POST /projects` | `README.md`, `docs/ONBOARDING.md`, `docs/API.md` |
| `artifacta projects update-html --project-id ... --file ...` | `PUT /projects/:projectId/html` | `README.md`, `docs/API.md` |
| `artifacta datasets list [--source ...]` | `GET /datasets` | `README.md`, `docs/API.md` |
| `artifacta datasets upload --project-id ... --file ... [--name ...]` | `POST /projects/:projectId/datasets` | `docs/API.md`, `packages/cli/README.md` |
| `artifacta datasets replace --project-id ... --dataset-id ... --file ...` | `PUT /projects/:projectId/datasets/:datasetId` | `docs/API.md`, `packages/cli/README.md` |
| `artifacta datasets sync set --project-id ... --dataset-id ... [--source-type ...] [--config-file ...] [--config-json ...]` | `PUT /projects/:projectId/datasets/:datasetId/sync` | `docs/API.md`, `packages/cli/README.md` |
| `artifacta sync trigger --project-id ... --dataset-id ...` | `POST /projects/:projectId/datasets/:datasetId/sync/trigger` | `README.md`, `docs/API.md` |
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
| Sync source safety | `lib/server/sync/source-policy.ts` | `docs/DEPLOYMENT.md` |
| Rate limiting | `lib/server/rate-limit.ts` | `docs/DEPLOYMENT.md`, `SECURITY.md` |
| Seeded demo data and dashboards | `lib/server/demo-artifacts.ts` | `README.md`, `README.zh-CN.md` |

## Not Implemented Yet

These are intentionally documented as roadmap or extension points only:

- SAML SSO
- MySQL metadata adapter
- Password-protected public links
- Project owner transfer
