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
artifacta projects upload --file ./dashboard.zip --name "Weekly Growth" --data-file ./growth.csv --visibility team
artifacta projects update-html --project-id proj_123 --file ./dashboard-v2.zip
artifacta datasets upload --project-id proj_123 --file ./growth.csv --name "Weekly Growth Data"
artifacta datasets replace --project-id proj_123 --dataset-id ds_123 --file ./growth-v2.csv
artifacta datasets sync set --project-id proj_123 --dataset-id ds_123 --source-type presto --config-file ./sync.json
artifacta sync trigger --project-id proj_123 --dataset-id ds_123
```

See the main repository docs for onboarding, API details, and release guidance.