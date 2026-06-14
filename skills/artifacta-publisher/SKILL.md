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
| Static dashboard, data won't change (≤ ~500 rows / ~100KB) | **Single HTML, data inlined** | `dashboard.html` only |
| Dashboard + data that updates (sync, replace, or multi-file assets) | **Bundle** | One ZIP; `artifacta.json` + optional `scripts/sync.py` |
| Replace data on existing project | Dataset API | `artifacta datasets upload/replace` |
| URL / COS / Presto sync without custom code | Sync JSON | `artifacta datasets sync set` |

**Default to single HTML with inlined data** for one-shot dashboards where the data is a fixed snapshot. **Default to bundle** as soon as the data needs to update over time, the dashboard has separate CSS/JS assets, or there are multiple datasets / sync scripts.

---

## Decision: does the data ever update?

Ask this **before** scaffolding files. It chooses the path for you.

- **No, it's a fixed snapshot** (one-shot AI dashboard, frozen report, demo with hardcoded numbers) → inline the data into `<script>` inside the HTML file. Upload single HTML with `--file dashboard.html`. **No ZIP, no server, no `artifacta.json`.** User can double-click locally.
- **Yes, via sync scripts / URL / COS / Presto** → real `.csv` / `.json` files + bundle + server preview (next section).
- **Yes, via manual `datasets replace`** → real `.csv` / `.json` files + bundle + server preview.

### Inline-data pattern (for the static case)

Drop the data straight into a `<script>` block. The dashboard reads from a global, not from `fetch()`:

```html
<script>
  // Data inlined — no fetch, works from file:// when double-clicked.
  const METRICS = [
    { stage: "visit",  users: 1200 },
    { stage: "signup", users: 360 },
    { stage: "paid",   users: 42 },
  ];

  // ...render code uses METRICS directly...
</script>
```

For CSV-shaped data, inline as a JS array of objects (not as a CSV string) — that avoids dragging a CSV parser into a static dashboard.

**Size rule of thumb:** ≤ ~500 rows or ~100KB of raw data inlines comfortably. Larger than that → use the bundle path so the HTML stays fast on first paint.

**Why not convert CSV/JSON to a separate `data.js` file?** It saves the server step but forces you to either rewrite the dashboard's parsing code or string-escape the CSV. Inlining straight into `<script>` is simpler and lands on the same single-HTML upload path. Skip the intermediate file.

The hosted upload for this case:

```bash
artifacta projects upload \
  --file ./dashboard.html \
  --name "..." \
  --visibility team
```

See `examples/0-single-html/` for a single-HTML upload (its data is in markup, not a JS array — but the upload shape and hosting behavior are the same).

---

## One-sentence workflow (bundle — for data that updates)

Use this when the data-update decision above sent you to the bundle path. For static dashboards, the upload is one command (`artifacta projects upload --file ./dashboard.html …`) and the steps below don't apply.

Example: *「部署到 Artifacta 并每天 8 点拉数据」*

1. Scaffold bundle layout (below) or adapt the user's folder.
2. Write `artifacta.json` (`entrypoint`, `datasets[]`, optional `sync_scripts[]`).
3. Add `scripts/sync.py` or `scripts/sync.mjs` that writes only declared `outputs` paths.
4. **Preview locally over HTTP** (see "Local preview" below) and confirm every `fetch()` returns 200 in DevTools.
5. Zip **bundle root** (not parent folder): `zip -r ../bundle.zip . -x "*.git*" -x "__MACOSX/*"`.
6. `artifacta projects upload --file ../bundle.zip --name "..."` — data files must be inside the ZIP (CLI uses `POST /upload-sessions`).
7. Set secrets on the server with `artifacta sync-scripts set --config-file ./secrets.json`; never in the ZIP.
8. Return `preview_url`, `project_id`, script ids, and what was configured.

Put CSV/JSON next to `index.html` in the ZIP, or declare paths in `artifacta.json`. The server imports bindings on commit; no separate dataset upload at create time.

---

## Local preview (required for the bundle path)

Skip this section if you took the inline-data path above — `file://` is fine when nothing fetches.

For bundle dashboards: **never** tell the user to double-click `index.html`. Browsers block `fetch()` from `file://` origins (origin is `null`), so any dashboard that reads bundle data will fail locally even though it works hosted.

Use any standard static HTTP server. Tell the user to run one of:

```bash
cd my-dashboard
npx serve .                       # Node available
python3 -m http.server 5173       # Python available
```

Then open the printed URL and verify in DevTools → Network that every dataset request (CSV/JSON/etc.) returns `200`. Only after that, build the ZIP and upload.

### Hard constraints (enforced by Artifacta hosting, not just style)

These are platform behaviors enforced by code in `lib/server/storage.ts` and `lib/server/artifacts/`. Violations either 404 silently or get rejected at upload (`INVALID_BUNDLE`).

1. **ZIP-required** for any dashboard that fetches sibling files. Single-file `.html` uploads have no asset route — `/api/v1/projects/:id/html/<path>` returns `409 ASSET_BLOCKED` with `reason: "not_zip_bundle"`. Bundle with `index.html` at the ZIP root, or set `entrypoint` in `artifacta.json` to a matching HTML file.
2. **Single HTML page only.** Only the entrypoint HTML is reachable on hosted; sibling `.html`/`.htm` files return `409 ASSET_BLOCKED` with `reason: "html_sibling"`. Multi-HTML bundles are rejected at upload with `MULTIPLE_HTML_FILES`. Use URL hash routing if you need multiple "pages."
3. **Relative paths only** in dashboard code (`data/sales.csv` or `./data/sales.csv`). A leading slash (`/data/sales.csv`) works locally but bypasses the injected `<base href>` on hosted and 404s.
4. **Prefer CSV / JSON for datasets.** The hosted MIME map covers `.css/.js/.mjs/.json/.csv/.png/.jpg/.jpeg/.gif/.webp/.svg/.ico/.woff/.woff2/.ttf`. `.tsv`, `.jsonl`, `.parquet`, `.xlsx` fall back to `application/octet-stream` (the upload returns a `DATASET_MIME_FALLBACK` warning). They still work with CDN parsers (e.g. SheetJS for XLSX), but CSV / JSON is the smooth path.

### Never use `<input type="file">` as the data-loading default

A file picker is only legitimate when the product **is** a file-upload tool (e.g. the user picks a CSV they want to analyze). For BI dashboards that ship with their own data, use `fetch(relativePath)` — anything else means the dashboard is broken on first open and the agent worked around `file://` instead of fixing it.

See `examples/2-html-csv/` and `examples/WALKTHROUGH.zh-CN.md` for flat user-style sample bundles.

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

Or use the CLI helper (same env contract):

```bash
artifacta bundle run-script \
  --file ./scripts/sync.py \
  --bundle-root . \
  --outputs data/sales.csv,data/inventory.csv \
  --config-file ./secrets.json
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

### Upload or replace a standalone dataset (after project exists)

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

### List and configure bundle scripts

```bash
artifacta sync-scripts list --project-id proj_123
# Use the server id (sscript_...) from the list, not only manifest "main"

artifacta sync-scripts set \
  --project-id proj_123 \
  --script-id sscript_abc123 \
  --config-file ./secrets.json \
  --schedule "0 8 * * *"
```

`secrets.json` is merged into server `source_config` and injected as `ARTIFACTA_SOURCE_CONFIG` at run time.

### Trigger bundle script sync

```bash
artifacta sync-scripts trigger \
  --project-id proj_123 \
  --script-id sscript_abc123

artifacta sync-scripts status \
  --project-id proj_123 \
  --script-id sscript_abc123
```

Requires a worker with `ARTIFACTA_API_KEY` and Python 3 on the host (`ARTIFACTA_PYTHON` optional). One queued/running script job per project at a time.

---

## Operational rules

- Prefer **one ZIP bundle** with `artifacta.json` for dashboards that use data files or sync scripts.
- Treat `project_id`, `dataset_id`, and script ids as remote IDs from Artifacta responses.
- Never hard-code API keys in prompts, scripts, or manifest.
- Always return `preview_url` after a successful publish.
- Reuse `project_id` in workflow state when the user iterates on the same remote project.

---

## Agent checklist

Inline-data path (static):
- [ ] Data does not need to update — confirmed with user or implied by request
- [ ] Data inlined into `<script>` block; no `fetch()` against sibling files
- [ ] Single HTML uploaded with `--file dashboard.html` (no ZIP, no `artifacta.json`)
- [ ] User receives `preview_url` + `project_id`

Bundle path (updates over time):
- [ ] Manifest valid; script (if any) writes only `ARTIFACTA_OUTPUT_PATHS`
- [ ] No secrets in repo or ZIP
- [ ] Local server preview passed (every `fetch()` returned 200 in DevTools)
- [ ] Local script test passed (if `sync_scripts` declared)
- [ ] Single ZIP upload (no `--data-file` for bundle path)
- [ ] Server secrets set if sync needs auth (`sync-scripts set` or UI)
- [ ] User receives `preview_url` + `project_id` + `sscript_*` ids when scripts exist

---

## Platform capabilities (shipped)

Confirm against `docs/IMPLEMENTED-FEATURES.md` on the Artifacta version you target:

| Feature | How agents use it |
|---------|-------------------|
| ZIP via upload session | `artifacta projects upload` / `update-html` with `.zip` (automatic) |
| Manifest import | Root `artifacta.json`; preserved on commit when valid |
| `sync_scripts` | Declared in manifest; configured with `sync-scripts set` |
| Script execution | `sync-scripts trigger` + worker `POST /sync/script-jobs/claim` |
| Re-upload protection | Synced `outputs` paths and sync-enabled bundle datasets kept |

## Known limitations

| Topic | Note |
|-------|------|
| Direct ZIP on `POST /projects` | Returns `400 DEPRECATED` — always use upload session (CLI does this) |
| `PUT /projects/:id/html` with ZIP | Same — use upload session with `project_id` |
| Script egress | Subprocess has no outbound network in v1 unless ops adds future allowlist |
| Cron | Script `schedule` supports daily `M H * * *`; full cron for all dataset jobs may still fall back to worker heuristics |
| Legacy per-dataset sync | URL/COS/Presto still use `datasets sync set` + `sync trigger`, not `sync_scripts` |

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
