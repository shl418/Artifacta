# Deployment Guide

Artifacta can run as a single Next.js service for small self-hosted teams. The current open-source shape keeps metadata and uploaded artifacts local, with a SQLite adapter available when you want a more realistic persistent setup.

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

## Runtime Data

| Path | Purpose |
| --- | --- |
| `DATA_DIR/artifacta.json` | JSON metadata database when `DATA_DRIVER=json`. |
| `SQLITE_PATH` | SQLite metadata database when `DATA_DRIVER=sqlite`. |
| `UPLOAD_DIR/projects/:projectId/index.html` | Single-file dashboard uploads. |
| `UPLOAD_DIR/projects/:projectId/bundle/...` | Extracted ZIP dashboard assets. |
| `UPLOAD_DIR/projects/:projectId/datasets/...` | Uploaded or synced dataset files. |

Do not store these paths in an ephemeral container filesystem unless you are only testing.

## Environment Variables

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Yes | Public URL used to generate preview and API URLs. |
| `AUTH_SECRET` | Yes | Long random string for signing sessions. Rotating it invalidates existing sessions. |
| `DATA_DRIVER` | Recommended | `json` for demos, `sqlite` for persistent self-hosting. |
| `DATA_DIR` | Recommended | Persistent metadata directory. |
| `SQLITE_PATH` | When SQLite | Path to the SQLite file. Defaults inside `DATA_DIR`. |
| `UPLOAD_DIR` | Recommended | Persistent uploaded artifact directory. |
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

Current sync runners support local files, already-uploaded artifact paths, URL fetches, and `mock_rows`. Add COS/S3 and Presto/Trino clients behind `lib/server/sync-runner.ts` when you are ready for real external data connectors.

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

- Replace development email login with OIDC/SAML SSO.
- Add Postgres metadata storage if you need multi-instance writes beyond SQLite.
- Replace local artifact storage with S3/COS/R2/MinIO for multi-instance deployments.
- Add backup jobs for SQLite and uploaded artifacts.
- Add upload size limits and malware scanning if accepting files from many users.
- Run dashboard previews on a separate domain for stronger browser isolation.
- Add audit retention, webhook notifications, and observability for sync failures.
- Keep `NODE_ENV=production` and serve only through HTTPS.

## Suggested Growth Topology

- Web: one or more Next.js app containers.
- Metadata: SQLite for single-node self-hosting, Postgres for multi-node deployments.
- Artifacts: local volume for single-node, S3-compatible object storage for multi-node.
- Worker: separate process using API key authentication.
- Identity: enterprise OIDC/SAML provider.
