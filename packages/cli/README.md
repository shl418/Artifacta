# @artifacta/cli

Published on npm: https://www.npmjs.com/package/@artifacta/cli

Lightweight CLI for pushing locally generated HTML dashboards, datasets, and sync configuration JSON to a running Artifacta instance.

## Install

```bash
npm install -g @artifacta/cli
```

Or run it without a global install:

```bash
npx @artifacta/cli@latest --help
```

## Required Environment

```bash
export ARTIFACTA_URL=https://artifacta.example.com
export ARTIFACTA_API_KEY=art_...
```

## Common Commands

```bash
artifacta projects list [--search growth]
artifacta --json projects list
artifacta doctor [--app-url http://localhost:3000]
artifacta projects upload --file ./dashboard.zip --name "Weekly Growth" --visibility team [--folder-id folder_123]
artifacta projects upload --file ./dashboard.html --name "Single Page"
artifacta projects update-html --project-id proj_123 --file ./dashboard-v2.zip
artifacta sync-scripts list --project-id proj_123
artifacta sync-scripts trigger --project-id proj_123 --script-id sscript_abc123
artifacta sync-scripts status --project-id proj_123 --script-id sscript_abc123
artifacta sync-scripts set --project-id proj_123 --script-id sscript_abc123 --config-file ./secrets.json
artifacta bundle run-script --file ./scripts/sync.py --bundle-root ./dist --outputs data/sales.csv
artifacta datasets list [--source manual]
artifacta datasets upload --project-id proj_123 --file ./growth.csv --name "Weekly Growth Data"
artifacta datasets replace --project-id proj_123 --dataset-id ds_123 --file ./growth-v2.csv
```

> Datasets are static (`manual`) by default. Dynamic updates use project-level bundle sync scripts (`sync-scripts ...`); the old `datasets sync set --source-type` / `sync trigger` are deprecated (external sources removed; `sync trigger` returns `410`).

`ARTIFACTA_URL` may be either the app root (`https://artifacta.example.com`) or an API base ending in `/api/v1`; the CLI normalizes both.

Use `--json` for stable agent/CI output. Without it, list commands use tables and write commands print short human summaries.

ZIP uploads use `POST /upload-sessions` automatically. Put data files in the ZIP; optionally declare `datasets` and `sync_scripts` in `artifacta.json` — see `docs/protocol/manifest-v1.md`.

See the main repository docs for onboarding, API details (`docs/API.md` — bundle script sync section), and release guidance.
