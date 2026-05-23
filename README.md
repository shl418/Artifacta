# Artifacta

Artifacta is an open protocol and hosting platform for AI-generated data applications. It lets local AI tools, scripts, and analysts publish HTML/JS artifacts, bind datasets, and share live applications with teams.

The project is designed for a new workflow: build data apps locally with any tools you already use, then rely on Artifacta for protocol-stable publishing, hosting, permissions, datasets, API keys, and repeatable delivery.

[中文说明](README.zh-CN.md)

## Preview

![Artifacta overview](public/demo/overview.png)

![Hosted dashboard preview](public/demo/dashboard-preview.png)

## What You Can Do Today

- Host single-file `.html` dashboards or `.zip` bundles with CSS, JS, images, and other static assets.
- Preview dashboards in a sandboxed iframe with private, team, or public visibility.
- Upload CSV/JSON datasets with schema and row/column inspection.
- Manage folders, team members, project permissions, API keys, and dataset sync configuration.
- Use signed web sessions for the console and Bearer API keys for agents, CI, and CLI flows.
- Choose local JSON storage for zero-friction demos or SQLite for a production-like self-hosted setup.
- Run the included CLI and sync worker scripts without adding another service.

## Quick Start

Artifacta expects Node `24.16.0` and `pnpm@11.1.3`. The repo includes `packageManager`, `.node-version`, and `.nvmrc` metadata for Corepack, `fnm`, `nvm`, and other Node managers.

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000` and sign in with either demo account:

- `admin@artifacta.local`
- `lisi@artifacta.local`

The first request seeds a demo organization, users, folders, datasets, polished dashboards, and local artifacts under `.artifacta`.

If you still have an older `.datavision` directory from a previous checkout, rename it to `.artifacta` or set `DATA_DIR` / `UPLOAD_DIR` / `SQLITE_PATH` to match your existing paths until you migrate.

## Run With SQLite

JSON storage is the default because it makes the first run simple. For a more production-like local setup, switch to SQLite:

```bash
DATA_DRIVER=sqlite \
SQLITE_PATH=.artifacta/artifacta.sqlite \
pnpm dev
```

SQLite migrations are idempotent and live inside the server database adapter.

## CLI Workflow

Create an API key in `Settings -> API & CLI`, then point the CLI at your app:

```bash
export ARTIFACTA_URL=http://localhost:3000
export ARTIFACTA_API_KEY=art_...

pnpm cli -- projects list
pnpm cli -- projects upload --file ./dashboard.zip --name "Weekly Growth" --data-file ./growth.csv --visibility team
pnpm cli -- projects update-html --project-id proj_123 --file ./dashboard-v2.zip
pnpm cli -- datasets upload --project-id proj_123 --file ./growth.csv --name "Weekly Growth Data"
pnpm cli -- datasets sync set --project-id proj_123 --dataset-id ds_123 --source-type presto --config-file ./sync.json
pnpm cli -- datasets list
pnpm cli -- doctor
pnpm cli -- --json projects list
```

The repository now also contains a standalone publishable package under `packages/cli`. After publish, external users can install it without cloning the app repository:

```bash
npx @artifacta/cli@latest --help
```

The current CLI can create projects, replace dashboard HTML, attach or replace datasets, and submit dataset sync configuration JSON from a local skill or CI job.

For the zero-repo end-user path, read [docs/ONBOARDING.md](docs/ONBOARDING.md). For the copyable Claude Code skill template, see [templates/claude-code-artifacta-publisher/SKILL.md](templates/claude-code-artifacta-publisher/SKILL.md). Maintainers can publish the CLI with the steps in [docs/CLI-RELEASE.md](docs/CLI-RELEASE.md).

## REST API Example

```bash
curl -X POST http://localhost:3000/api/v1/projects \
  -H "Authorization: Bearer $ARTIFACTA_API_KEY" \
  -F "name=Sales Dashboard" \
  -F "visibility=team" \
  -F "html_file=@./dashboard.zip" \
  -F "data_files=@./sales.csv"
```

See [docs/API.md](docs/API.md) for implemented routes, payload examples, and sync endpoints. The stable bundle contract is [docs/protocol/manifest-v1.md](docs/protocol/manifest-v1.md).

## Examples

The `examples/` directory contains a single-file HTML dashboard, a ZIP dashboard with local CSS/JS/assets, CSV and JSON datasets, a mock-row sync config, and a CLI publish script:

```bash
export ARTIFACTA_URL=http://localhost:3000
export ARTIFACTA_API_KEY=art_live_...
bash examples/publish-example.sh
```

## Sync Worker

The worker scans API-visible datasets with `sync_config.enabled = true`, finds jobs that are due, and triggers the same sync runner used by the API.

```bash
export ARTIFACTA_API_KEY=art_...
pnpm worker:once
node scripts/sync-worker.mjs --interval 60
```

The current runner supports no-op/manual refresh, local file or uploaded artifact replacement, URL fetches, and `mock_rows` for Presto-style development flows. COS/S3 and real Presto clients are intentionally isolated as future connector adapters.

## Scripts

```bash
pnpm dev          # start the development server
pnpm build        # production build
pnpm start        # run the production build
pnpm typecheck    # TypeScript check
pnpm lint         # ESLint
pnpm test         # contract, client, security, and unit tests
pnpm test:api-contract # route/OpenAPI consistency guard
pnpm test:client   # @artifacta/client workflow tests
pnpm test:security # ZIP, sync source, and upload-session tests
pnpm test:unit    # sync jobs, manifest, CSV, rate limit, embed, versions
pnpm test:smoke   # API smoke test against a running app
pnpm worker:once  # run one sync worker pass
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public URL used in generated preview/API links. |
| `AUTH_SECRET` | development fallback | Secret used to sign session cookies. Set a strong value in shared environments. |
| `DATA_DRIVER` | `json` | `json`, `sqlite`, or `postgres`. |
| `DATA_DIR` | `.artifacta` | Local metadata directory and default SQLite parent directory. |
| `SQLITE_PATH` | `.artifacta/artifacta.sqlite` | SQLite database path when `DATA_DRIVER=sqlite`. |
| `POSTGRES_URL` / `DATABASE_URL` | unset | Postgres connection string when `DATA_DRIVER=postgres`. |
| `UPLOAD_DIR` | `.artifacta/uploads` | Uploaded dashboard and dataset artifact directory. |
| `STORAGE_DRIVER` | `local` | `local` or `s3`. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | unset | S3-compatible artifact storage settings. |
| `ARTIFACTA_MAX_ARTIFACT_BYTES` | `104857600` | Max dashboard artifact upload size. |
| `ARTIFACTA_MAX_DATASET_BYTES` | `52428800` | Max dataset upload size. |
| `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | unset | Optional OIDC login configuration. |

## Architecture

- `app/` contains the Next.js App Router console, preview pages, and REST API routes.
- `lib/server/` contains auth, access control, persistence adapters, storage, serializers, dataset inspection, and sync execution.
- `packages/cli/` contains the standalone publishable CLI package, while `bin/artifacta.mjs` stays as the repo-local wrapper.
- `scripts/sync-worker.mjs` is the API-driven worker process.
- `.artifacta/` is runtime state and is intentionally ignored by Git.

Read [docs/plans/2026-05-21-open-source-excellence-roadmap.md](docs/plans/2026-05-21-open-source-excellence-roadmap.md) for the current roadmap and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for self-hosting guidance. `docs/PLAN.md` is archived historical context.

## Documentation Map

- [docs/IMPLEMENTED-FEATURES.md](docs/IMPLEMENTED-FEATURES.md) is the code-to-docs checklist for implemented pages, routes, CLI commands, Worker behavior, and storage boundaries.
- [docs/DEVELOPMENT-ENVIRONMENT.md](docs/DEVELOPMENT-ENVIRONMENT.md) records the expected `fnm`/Node/`pnpm` setup and what to do when non-interactive shells miss it.
- [docs/API.md](docs/API.md) is the human-readable API guide; [docs/openapi/artifacta.v1.yaml](docs/openapi/artifacta.v1.yaml) is the current partial OpenAPI contract for integration work.
- [docs/PRODUCT.md](docs/PRODUCT.md) separates current MVP behavior from roadmap and enterprise extension points.
- [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [CHANGELOG.md](CHANGELOG.md) define review, reporting, and release expectations.

## Current Boundaries

- OIDC login is available when configured; SAML remains an extension point.
- SQLite is included for self-hosting trials. Postgres metadata and S3-compatible object storage are available for production hardening.
- The worker executes local, URL, mock-row, S3/COS object, and Presto/Trino HTTP sync flows.

## License

MIT. See [LICENSE](LICENSE).
