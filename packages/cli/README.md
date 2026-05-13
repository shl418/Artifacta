# @datavision/cli

Lightweight CLI for pushing locally generated HTML dashboards, datasets, and sync configuration JSON to a running DataVision instance.

## Install

```bash
npm install -g @datavision/cli
```

Or run it without a global install:

```bash
npx @datavision/cli@latest --help
```

## Required Environment

```bash
export DATAVISION_URL=https://datavision.example.com
export DATAVISION_API_KEY=dv_...
```

## Common Commands

```bash
datavision projects upload --file ./dashboard.zip --name "Weekly Growth" --data-file ./growth.csv --visibility team
datavision projects update-html --project-id proj_123 --file ./dashboard-v2.zip
datavision datasets upload --project-id proj_123 --file ./growth.csv --name "Weekly Growth Data"
datavision datasets replace --project-id proj_123 --dataset-id ds_123 --file ./growth-v2.csv
datavision datasets sync set --project-id proj_123 --dataset-id ds_123 --source-type presto --config-file ./sync.json
datavision sync trigger --project-id proj_123 --dataset-id ds_123
```

See the main repository docs for onboarding, API details, and release guidance.