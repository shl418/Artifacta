---
name: artifacta-publisher
description: Use when the user wants Claude Code to publish a locally generated HTML dashboard, ZIP bundle, dataset file, or sync configuration JSON to a running Artifacta site. Triggers include "publish to Artifacta", "push this dashboard", "上传到 Artifacta", "把这个看板发到网页上", "upload this html", "推送 zip 看板", and "用 skill 上传数据和配置".
---

# Artifacta Publisher

Use this skill when Claude Code should turn local output files into a remote Artifacta project.

This skill is specifically for the zero-repo case:

- the user does not need the Artifacta app repository locally
- the user only needs an Artifacta URL, an API key, and local output files

## Required Inputs

- `ARTIFACTA_URL`
- `ARTIFACTA_API_KEY`
- local path to `dashboard.html` or `dashboard.zip`
- optional local dataset files such as CSV or JSON
- optional `project_id` if updating an existing remote project
- optional `dataset_id` + `sync.json` if submitting sync configuration

## Workflow

1. Confirm the target Artifacta site and API key are available as environment variables.
2. Write generated artifacts to a temp directory.
3. If no `project_id` is provided, create a remote project with `artifacta projects upload`.
4. If `project_id` exists, replace the dashboard HTML with `artifacta projects update-html`.
5. Upload or replace datasets as needed.
6. If a sync config JSON is provided, call `artifacta datasets sync set`.
7. Return the remote `preview_url` to the user.

## Install Strategy

Prefer these command paths in order:

1. `artifacta ...` when the standalone CLI is already installed
2. `pnpm cli -- ...` when the current working directory is the Artifacta repository
3. `npx @artifacta/cli@latest ...` after the maintainer has published the npm package

## Command Templates

### Create a new remote project

```bash
artifacta projects upload \
  --file ./dashboard.zip \
  --name "Weekly Growth" \
  --data-file ./growth.csv \
  --visibility team
```

### Update an existing remote project

```bash
artifacta projects update-html \
  --project-id proj_123 \
  --file ./dashboard-v2.zip
```

### Upload or replace a dataset

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

### Submit sync configuration JSON

```bash
artifacta datasets sync set \
  --project-id proj_123 \
  --dataset-id ds_123 \
  --source-type presto \
  --config-file ./sync.json
```

### Trigger a sync immediately

```bash
artifacta sync trigger \
  --project-id proj_123 \
  --dataset-id ds_123
```

## Operational Rules

- Prefer ZIP uploads when the dashboard references CSS, JS, fonts, or images.
- Treat `project_id` and `dataset_id` as remote IDs returned by Artifacta.
- Never hard-code API keys into prompts or files.
- Always return `preview_url` after successful upload so the user can open the hosted dashboard immediately.
- If the user wants to keep updating the same remote project, store the returned IDs in the surrounding workflow state.

## Failure Handling

- If `ARTIFACTA_API_KEY` is missing, stop and ask for it.
- If the upload fails with `INVALID_ARTIFACT`, verify the HTML or ZIP bundle locally before retrying.
- If the user wants to push arbitrary config files as project attachments, explain that the current open-source platform only supports sync configuration JSON as first-class config input.

## Handoff Message Pattern

After success, return:

- the remote `project_id`
- any created `dataset_id`
- the `preview_url`
- what was uploaded: dashboard, datasets, and optional sync config
