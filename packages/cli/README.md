# @artifacta/cli

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
artifacta projects upload --file ./dashboard.zip --name "Weekly Growth" --data-file ./growth.csv --visibility team [--folder-id folder_123]
artifacta projects update-html --project-id proj_123 --file ./dashboard-v2.zip
artifacta datasets list [--source manual|cos|presto]
artifacta datasets upload --project-id proj_123 --file ./growth.csv --name "Weekly Growth Data"
artifacta datasets replace --project-id proj_123 --dataset-id ds_123 --file ./growth-v2.csv
artifacta datasets sync set --project-id proj_123 --dataset-id ds_123 --source-type presto --config-file ./sync.json
artifacta datasets sync set --project-id proj_123 --dataset-id ds_123 --source-type presto --config-json '{"mock_rows":[{"day":"2026-05-21","value":42}]}'
artifacta sync trigger --project-id proj_123 --dataset-id ds_123
```

`ARTIFACTA_URL` may be either the app root (`https://artifacta.example.com`) or an API base ending in `/api/v1`; the CLI normalizes both.

Use `--json` for stable agent/CI output. Without it, list commands use tables and write commands print short human summaries.

See the main repository docs for onboarding, API details, `docs/protocol/manifest-v1.md`, and release guidance.
