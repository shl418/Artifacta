# Zero-Repo Onboarding

This guide is for users who do **not** have the DataVision repository locally.

They only need:

- a running DataVision site
- an API key from that site
- Claude Code or another local agent workflow
- a way to generate HTML, ZIP, CSV, or JSON files locally

## What "No Local Project" Means

There is no requirement to create a DataVision project locally first.

The remote project is created on the server when the CLI uploads the first dashboard artifact.

## Step 1: Create an API Key

In the DataVision web app:

1. Open `Settings -> API & CLI`
2. Create a new API key
3. Copy it immediately and store it securely

## Step 2: Install the CLI

Repo contributors can use:

```bash
pnpm cli -- --help
```

External users should use the standalone published package after release:

```bash
npx @datavision/cli@latest --help
```

Or install it globally:

```bash
npm install -g @datavision/cli
```

If npm publish has not happened yet, a maintainer can distribute the packed tarball described in `docs/CLI-RELEASE.md`.

## Step 3: Export Environment Variables

```bash
export DATAVISION_URL=https://datavision.example.com
export DATAVISION_API_KEY=dv_...
```

## Step 4: Generate Files Locally

Your local skill should write artifacts to a temporary or working directory, for example:

- `dashboard.zip` or `dashboard.html`
- `data.csv`
- `sync.json` if you want to submit dataset sync configuration

## Step 5: Create the Remote Project

```bash
datavision projects upload \
  --file ./dashboard.zip \
  --name "Weekly Growth" \
  --data-file ./data.csv \
  --visibility team
```

This creates the remote DataVision project and returns a JSON payload that includes `id` and `preview_url`.

## Step 6: Update an Existing Remote Project

If the remote project already exists, use its `project_id` instead of creating a new one:

```bash
datavision projects update-html \
  --project-id proj_123 \
  --file ./dashboard-v2.zip
```

## Step 7: Add or Replace Datasets

Add a new dataset:

```bash
datavision datasets upload \
  --project-id proj_123 \
  --file ./data.csv \
  --name "Weekly Growth Data"
```

Replace an existing dataset:

```bash
datavision datasets replace \
  --project-id proj_123 \
  --dataset-id ds_123 \
  --file ./data-v2.csv
```

## Step 8: Submit Sync Configuration JSON

If your workflow also needs dataset sync configuration:

```bash
datavision datasets sync set \
  --project-id proj_123 \
  --dataset-id ds_123 \
  --source-type presto \
  --config-file ./sync.json
```

The CLI passes your local JSON object through to `source_config`.

## Step 9: Trigger Sync

```bash
datavision sync trigger \
  --project-id proj_123 \
  --dataset-id ds_123
```

## Claude Code / Skill Pattern

The recommended agent pattern is:

1. Generate files locally
2. Stage them in a predictable temp directory
3. Call `datavision projects upload` or `datavision projects update-html`
4. Optionally upload datasets
5. Optionally submit `sync.json`
6. Return the DataVision `preview_url` to the user

Use `templates/claude-code-datavision-publisher/SKILL.md` as the copyable starting point.

## Good Defaults

- Use ZIP dashboards if your HTML references CSS, JS, fonts, or images.
- Treat `project_id` and `dataset_id` as remote IDs owned by DataVision, not local folder names.
- Keep API keys in environment variables, not inside prompts or committed files.
- Return the `preview_url` to the user after every successful upload.

## Troubleshooting

- `DATAVISION_API_KEY is required`: export the API key first.
- `UNAUTHORIZED`: the API key is invalid, expired, or scoped to a different site.
- `INVALID_ARTIFACT`: the HTML or ZIP payload is malformed.
- Dataset sync config issues: confirm your JSON is a single object and not an array.

For the full CLI command list, run `datavision --help`.