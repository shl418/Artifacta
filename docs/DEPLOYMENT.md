# Deployment Guide

Artifacta can run as a single Next.js service for small self-hosted teams. The open-source build supports local JSON, SQLite, and Postgres metadata, plus local disk or S3-compatible artifact storage.

## Local Production Run

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm build
pnpm start
```

Set a strong `AUTH_SECRET` before using any shared environment.

## Recommended Self-Hosted MVP

```bash
NEXT_PUBLIC_APP_URL=https://artifacta.example.com
AUTH_SECRET=<long-random-secret>
DATA_DRIVER=sqlite
DATA_DIR=/var/lib/Artifacta
SQLITE_PATH=/var/lib/Artifacta/artifacta.sqlite
UPLOAD_DIR=/var/lib/Artifacta/uploads
```

Mount `/var/lib/Artifacta` to durable storage. The app stores uploaded dashboard HTML, extracted ZIP assets, uploaded datasets, and SQLite metadata there.

For multi-instance deployments, use Postgres and S3-compatible storage:

```bash
DATA_DRIVER=postgres
POSTGRES_URL=postgres://artifacta:secret@postgres:5432/artifacta
STORAGE_DRIVER=s3
S3_BUCKET=artifacta-artifacts
S3_REGION=auto
S3_ENDPOINT=https://s3.example.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

## Runtime Data

| Path | Purpose |
| --- | --- |
| `DATA_DIR/artifacta.json` | JSON metadata database when `DATA_DRIVER=json`. |
| `SQLITE_PATH` | SQLite metadata database when `DATA_DRIVER=sqlite`. |
| `POSTGRES_URL` / `DATABASE_URL` | Postgres metadata database when `DATA_DRIVER=postgres`. |
| `UPLOAD_DIR/projects/:projectId/index.html` | Single-file dashboard uploads. |
| `UPLOAD_DIR/projects/:projectId/bundle/...` | Extracted ZIP dashboard assets. |
| `UPLOAD_DIR/projects/:projectId/datasets/...` | Uploaded or synced dataset files. |

Do not store these paths in an ephemeral container filesystem unless you are only testing.

## Environment Variables

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Yes | Public URL used to generate preview and API URLs. |
| `AUTH_SECRET` | Yes | Long random string for signing sessions. Rotating it invalidates existing sessions. |
| `DATA_DRIVER` | Recommended | `json` for demos, `sqlite` for single-node self-hosting, `postgres` for multi-instance metadata. |
| `DATA_DIR` | Recommended | Persistent metadata directory. |
| `SQLITE_PATH` | When SQLite | Path to the SQLite file. Defaults inside `DATA_DIR`. |
| `UPLOAD_DIR` | Recommended | Persistent uploaded artifact directory. |
| `STORAGE_DRIVER` | Recommended | `local` or `s3`. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | When S3 | S3/COS/R2/MinIO-compatible artifact storage. |
| `ARTIFACTA_MAX_ARTIFACT_BYTES`, `ARTIFACTA_MAX_DATASET_BYTES` | Recommended | Upload limits surfaced in API errors and the UI. |
| `ARTIFACTA_RATE_LIMIT_WINDOW_MS`, `ARTIFACTA_RATE_LIMIT_MAX` | Recommended | In-process rate limiting for auth, uploads, and sync triggers. |
| `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Optional | OIDC login configuration. |
| `SYNC_URL_ALLOWLIST` | Recommended for sync | Comma-separated host allowlist for dataset sync URL sources. Leave empty to disable remote URL sync in shared production deployments. |
| `SYNC_LOCAL_BASE_DIR` | Recommended for sync | Base directory for local file sync sources. Paths outside this directory are rejected. Leave empty only for local development. |
| `ARTIFACTA_API_KEY` | Worker only | API key used by `scripts/sync-worker.mjs`. |

## Container Shape

A production container should:

1. Install dependencies with `pnpm install --frozen-lockfile`.
2. Build with `pnpm build`.
3. Run with `pnpm start`.
4. Mount persistent volumes for `DATA_DIR`, `SQLITE_PATH`, and `UPLOAD_DIR`.
5. Set `NEXT_PUBLIC_APP_URL` to the externally reachable HTTPS URL.
6. Run `pnpm worker:once` on a schedule, or run `node scripts/sync-worker.mjs --interval 60` as a separate worker process.

## Reverse Proxy

Put the app behind HTTPS and forward the original host/protocol headers. Upload size limits should allow your dashboard ZIP files and datasets.

Example Nginx settings to review:

```nginx
client_max_body_size 100m;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

## Dashboard Isolation

Uploaded dashboard HTML is untrusted. Artifacta renders it in a sandboxed iframe and serves ZIP assets through controlled routes. For stricter production isolation, host preview routes on a separate domain such as `dashboards.example.com`.

## Worker Deployment

The worker is API-driven and can run anywhere that can reach the app:

```bash
ARTIFACTA_URL=https://artifacta.example.com \
ARTIFACTA_API_KEY=art_... \
node scripts/sync-worker.mjs --interval 300
```

Current sync runners support local files, already-uploaded artifact paths, URL fetches, `mock_rows`, S3/COS objects, and Presto/Trino HTTP queries.

## Dataset Sync Source Safety

Dataset sync jobs can read from local file paths or remote URLs, so shared deployments should explicitly constrain both source types before enabling scheduled workers.

### Remote URLs

Set `SYNC_URL_ALLOWLIST` to a comma-separated list of lower-case hostnames that dataset sync jobs may fetch, for example `data.example.com,warehouse.example.com`. Artifacta only allows `http:` and `https:` URLs, rejects `localhost` and `.localhost`, and blocks private or link-local IP ranges such as `127.*`, `10.*`, `192.168.*`, `172.16-31.*`, `169.254.*`, and `::1`.

When `SYNC_URL_ALLOWLIST` is empty, remote URL sync is rejected in production. In development, Artifacta DNS-resolves non-IP hostnames and rejects the URL if any resolved address is private or link-local.

### Local File Paths

Set `SYNC_LOCAL_BASE_DIR` to the directory that contains files workers are allowed to read, for example `/var/lib/Artifacta/sync-sources`. Relative paths are resolved from the process working directory, and configured local paths must equal or stay inside the base directory. Artifacta also rejects restricted system locations such as `/etc`, `/proc`, `/sys`, `/dev`, and `C:\Windows\System32`.

When `SYNC_LOCAL_BASE_DIR` is empty, local file sync is rejected in production. Leaving it empty should be treated as a development-only convenience.

### Known Limitation: DNS Rebinding

The built-in remote URL checks validate the hostname and DNS answers before the request starts, but they do not pin the resolved address for the outbound `fetch`. A hostile DNS setup could change answers between validation and connection time. For shared or high-trust deployments, keep `SYNC_URL_ALLOWLIST` narrow and enforce equivalent egress controls at the network layer.

## Production Hardening Checklist

- Configure OIDC for shared deployments; add SAML if your identity provider requires it.
- Use Postgres metadata storage for multi-instance writes beyond SQLite.
- Use S3/COS/R2/MinIO artifact storage for multi-instance deployments.
- Add backup jobs for SQLite and uploaded artifacts.
- Tune upload size limits and add malware scanning if accepting files from many users.
- Run dashboard previews on a separate domain for stronger browser isolation.
- Configure audit retention, webhook destinations, and observability for sync failures.
- Keep `NODE_ENV=production` and serve only through HTTPS.

## Migrating Artifacts To S3-Compatible Storage

Use this path when moving from a single-node disk deployment to shared object storage:

1. Configure `STORAGE_DRIVER=s3`, bucket credentials, and `DATA_DRIVER=postgres` (recommended) or keep SQLite for a single writer.
2. Copy `UPLOAD_DIR/projects/**` into the bucket using your provider CLI, preserving the `projects/<projectId>/...` key layout.
3. Start Artifacta with the new environment variables and verify one HTML preview, one ZIP asset route, and one dataset download.
4. Keep the old `UPLOAD_DIR` volume read-only until you confirm sync jobs and uploads write to object storage.
5. Update backup jobs to snapshot the bucket and metadata database instead of local upload paths.

Artifacta reads and writes artifacts exclusively through `lib/server/object-storage.ts`, so no route-handler changes are required after migration.

## Suggested Growth Topology

- Web: one or more Next.js app containers.
- Metadata: SQLite for single-node self-hosting, Postgres for multi-node deployments.
- Artifacts: local volume for single-node, S3-compatible object storage for multi-node.
- Worker: separate process using API key authentication.
- Identity: enterprise OIDC provider, with SAML as an extension point.
