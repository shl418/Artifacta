---
name: artifacta-publisher
description: >-
  Scaffold, test locally, and publish dashboards to a running Artifacta site.
  Preferred path is a ZIP bundle with artifacta.json, in-bundle datasets, and
  optional sync_scripts (Python/Node). Also covers legacy single HTML, separate
  data files, dataset replace, and URL/Presto sync JSON. Zero-repo: only
  ARTIFACTA_URL, API key, and local files. Triggers include "publish to
  Artifacta", "上传到 Artifacta", "打包部署看板", "一句话发布", "定时拉取",
  "sync script", "artifacta.json", "push this dashboard", and "推送 zip 看板".
---

# Artifacta Publisher

Turn local artifacts into a hosted Artifacta project. The user does **not** need the Artifacta app repo—only `ARTIFACTA_URL`, `ARTIFACTA_API_KEY`, and local files.

**Platform design reference:** `docs/plans/2026-05-24-custom-script-sync-and-bundle-upload.md`

---

## Choose a path

| User goal | Path | Upload shape |
|-----------|------|----------------|
| Dashboard + data + optional scheduled pull script | **Bundle (recommended)** | One ZIP; `artifacta.json` + `scripts/sync.py` |
| Quick single-file demo | Legacy HTML | `dashboard.html` only |
| Replace data on existing project | Dataset API | `artifacta datasets upload/replace` |
| URL / COS / Presto sync without custom code | Sync JSON | `artifacta datasets sync set` |

**Default to bundle** whenever the dashboard references assets, multiple data files, or scheduled pulls.

---

## One-sentence workflow (bundle — preferred)

Example: *「部署到 Artifacta 并每天 8 点拉数据」*

1. Scaffold bundle layout (below) or adapt the user's folder.
2. Write `artifacta.json` (`entrypoint`, `datasets[]`, optional `sync_scripts[]`).
3. Add `scripts/sync.py` or `scripts/sync.mjs` that writes only declared `outputs` paths.
4. Test locally with the env contract; confirm `index.html` reads relative data paths.
5. Zip **bundle root** (not parent folder): `zip -r ../bundle.zip . -x "*.git*" -x "__MACOSX/*"`.
6. `artifacta projects upload --file ../bundle.zip --name "..."` — **no** `--data-file`.
7. Set secrets on the server (`source_config` / API); never in the ZIP.
8. Return `preview_url`, `project_id`, and what was configured.

Do not ask the user to manually pick datasets in the upload UI when manifest-driven upload exists; until then, align `datasets` in manifest with upload-session `datasets` JSON if using the API.

---

## Required inputs

- `ARTIFACTA_URL` — e.g. `https://artifacta.example.com` or `http://localhost:3000`
- `ARTIFACTA_API_KEY` — Bearer API key
- Bundle: directory or `bundle.zip` (preferred)
- Legacy: `dashboard.html` or `dashboard.zip` without manifest
- Optional: `project_id` for updates
- Optional: `dataset_id` + `sync.json` for built-in sync types (not custom scripts)

---

## Bundle layout (convention)

```text
my-dashboard/
  artifacta.json       # entrypoint, datasets, sync_scripts
  index.html           # or path declared in entrypoint
  assets/              # optional CSS/JS/fonts
  data/                # any nesting; sync script writes here
    sales.csv
  scripts/
    sync.py            # replaced on each ZIP re-upload
```

- Paths in manifest: **POSIX relative** (no `..`, no absolutes).
- Dashboard uses **relative URLs** (`data/sales.csv`) — same locally and on Artifacta.
- **Never** put API keys, DSNs, or tokens in manifest or scripts.

---

## `artifacta.json` template

```json
{
  "schema_version": 1,
  "name": "Sales Dashboard",
  "entrypoint": "index.html",
  "datasets": [
    {
      "id": "sales",
      "name": "Sales",
      "kind": "csv",
      "path": "data/sales.csv",
      "refresh": "sync"
    },
    {
      "id": "inventory",
      "name": "Inventory",
      "kind": "csv",
      "path": "data/inventory.csv",
      "refresh": "sync"
    }
  ],
  "sync_scripts": [
    {
      "id": "main",
      "path": "scripts/sync.py",
      "runtime": "python",
      "outputs": ["data/sales.csv", "data/inventory.csv"],
      "schedule": "0 8 * * *"
    }
  ]
}
```

Before zipping, verify:

- `entrypoint` exists.
- Every `sync_scripts[].outputs` path matches a `datasets[].path` (outputs may be a subset).
- `sync_scripts[].path` is `.py` or `.mjs` (`.sh` is blocked inside ZIP uploads).

Manifest declares defaults; the server may override `schedule`, `outputs`, and secrets without rebuilding the ZIP.

---

## Sync script contract

One script run may update **multiple files** listed in `outputs`. Platform runs the script inside the extracted bundle.

### Environment (local test = server run)

| Variable | Required | Meaning |
|----------|----------|---------|
| `ARTIFACTA_BUNDLE_ROOT` | yes | Bundle root (use `$PWD` locally) |
| `ARTIFACTA_OUTPUT_PATHS` | yes | Comma-separated relative paths to write |
| `ARTIFACTA_SCRIPT_ID` | yes | e.g. `main` from manifest |
| `ARTIFACTA_SOURCE_CONFIG` | no | JSON; **server-injected only** (keys, URLs, SQL) |

Server defaults: **5 min** timeout, **512MB** memory, **egress off** unless the deployment sets `SYNC_URL_ALLOWLIST`.

### Python starter (`scripts/sync.py`)

```python
import json
import os
from pathlib import Path

ROOT = Path(os.environ["ARTIFACTA_BUNDLE_ROOT"])
OUTPUTS = [p.strip() for p in os.environ["ARTIFACTA_OUTPUT_PATHS"].split(",") if p.strip()]
CONFIG = json.loads(os.environ.get("ARTIFACTA_SOURCE_CONFIG") or "{}")

def write_csv(rel: str, header: str, rows: list[str]) -> None:
    dest = ROOT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(header + "\n" + "\n".join(rows) + "\n", encoding="utf-8")

def main() -> None:
    # url = CONFIG.get("url")  # secrets from server only
    for rel in OUTPUTS:
        if rel.endswith("sales.csv"):
            write_csv(rel, "date,amount", ["2026-01-01,100"])
        elif rel.endswith("inventory.csv"):
            write_csv(rel, "sku,qty", ["A1,10"])

if __name__ == "__main__":
    main()
```

### Local test

```bash
cd my-dashboard
export ARTIFACTA_BUNDLE_ROOT="$PWD"
export ARTIFACTA_SCRIPT_ID=main
export ARTIFACTA_OUTPUT_PATHS="data/sales.csv,data/inventory.csv"
python3 scripts/sync.py
```

Node: same env vars; write under `path.join(process.env.ARTIFACTA_BUNDLE_ROOT, rel)`.

### ZIP re-upload behavior

| Content | On new ZIP / `update-html` |
|---------|----------------------------|
| `scripts/**` | Replaced (script follows dashboard version) |
| Sync `outputs` data paths with sync enabled | **Preserved** (last pull kept) |
| HTML / CSS / JS | Replaced |

---

## Install strategy

Prefer, in order:

1. `npx @artifacta/cli@latest ...` — zero-repo
2. `artifacta ...` — global `@artifacta/cli`
3. `pnpm cli -- ...` — only when cwd is the Artifacta monorepo

---

## CLI command templates

### Publish bundle (recommended)

```bash
cd my-dashboard
zip -r ../bundle.zip . -x "*.git*" -x "__MACOSX/*"
artifacta projects upload \
  --file ../bundle.zip \
  --name "Sales Dashboard" \
  --visibility team
```

### Update existing project dashboard

```bash
artifacta projects update-html \
  --project-id proj_123 \
  --file ./bundle-v2.zip
```

### Legacy: HTML + separate data file

Still supported by the platform today; avoid for new work (path drift). Prefer bundle instead.

```bash
artifacta projects upload \
  --file ./dashboard.html \
  --name "Weekly Growth" \
  --data-file ./growth.csv \
  --visibility team
```

### Upload or replace a standalone dataset

```bash
artifacta datasets upload \
  --project-id proj_123 \
  --file ./growth.csv \
  --name "Weekly Growth Data"

artifacta datasets replace \
  --project-id proj_123 \
  --dataset-id ds_123 \
  --file ./growth-v2.csv
```

### Built-in sync (URL / COS / Presto — not custom scripts)

```bash
artifacta datasets sync set \
  --project-id proj_123 \
  --dataset-id ds_123 \
  --source-type presto \
  --config-file ./sync.json

artifacta sync trigger \
  --project-id proj_123 \
  --dataset-id ds_123
```

### Secrets after bundle publish (custom script)

Do not put credentials in the ZIP. After upload, set server-side config (exact API ships with script-sync implementation):

```bash
# PUT /api/v1/projects/:project_id/sync-scripts/:script_id
# { "source_config": { "url": "...", "api_key": "..." } }
```

### Trigger script sync (when implemented)

```bash
artifacta sync trigger --project-id proj_xxx --sync-script-id main
```

---

## Operational rules

- Prefer **one ZIP bundle** with `artifacta.json` for dashboards that use data files or sync scripts.
- Treat `project_id`, `dataset_id`, and script ids as remote IDs from Artifacta responses.
- Never hard-code API keys in prompts, scripts, or manifest.
- Always return `preview_url` after a successful publish.
- Reuse `project_id` in workflow state when the user iterates on the same remote project.

---

## Agent checklist

- [ ] Bundle path: manifest valid; script writes only `ARTIFACTA_OUTPUT_PATHS`
- [ ] No secrets in repo or ZIP
- [ ] Local script test passed
- [ ] Single ZIP upload (no `--data-file` for bundle path)
- [ ] Server secrets set if sync needs auth
- [ ] User receives `preview_url` + `project_id`

---

## Platform gaps (check before claiming)

Read `docs/IMPLEMENTED-FEATURES.md`. Planned but may not be shipped yet:

| Feature | Interim |
|---------|---------|
| Zero-config upload from manifest | Upload session + `datasets` JSON matching manifest paths |
| `sync_scripts` import | `artifacta datasets sync set` per dataset or UI |
| `source_type: script` | URL/local `source_config` or manual trigger |

---

## Failure handling

- Missing `ARTIFACTA_API_KEY` → stop and ask.
- `INVALID_ARTIFACT` → validate HTML/ZIP and manifest paths locally.
- Arbitrary attachments → only sync JSON and bundle contents are first-class; do not promise generic file hosting.

---

## Handoff message (after success)

Return to the user:

- `project_id`
- `dataset_id`(s) if created
- `preview_url`
- What was published: bundle vs legacy HTML, sync_scripts, datasets, sync config
- Reminder: re-upload ZIP updates scripts/HTML but preserves synced data files under `outputs`
