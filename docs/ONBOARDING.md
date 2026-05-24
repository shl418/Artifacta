# Zero-Repo Onboarding

This guide is for users who do **not** have the Artifacta repository locally.

They only need:

- a running Artifacta site
- an API key from that site
- Claude Code or another local agent workflow
- a way to generate HTML, ZIP, CSV, or JSON files locally

For ZIP dashboards, use the stable bundle contract in `docs/protocol/manifest-v1.md`.

## What "No Local Project" Means

There is no requirement to create an Artifacta project locally first.

The remote project is created on the server when the CLI uploads the first dashboard artifact.

## Step 1: Create an API Key

In the Artifacta web app:

1. Open `Settings -> API & CLI`
2. Create a new API key
3. Copy it immediately and store it securely

## Step 2: Install the CLI

Use the published npm package (default path for zero-repo users):

```bash
npx @artifacta/cli@latest --help
```

Or install it globally:

```bash
npm install -g @artifacta/cli
artifacta --help
```

If you are developing inside the Artifacta repository, you can also use:

```bash
pnpm cli -- --help
```

## Step 3: Export Environment Variables

```bash
export ARTIFACTA_URL=https://artifacta.example.com
export ARTIFACTA_API_KEY=art_...
```

## Step 4: Generate Files Locally

Your local skill should write artifacts to a temporary or working directory, for example:

- `dashboard.zip` with optional `artifacta.json` (recommended for multi-file dashboards and bundle datasets)
- `dashboard.html` for single-file dashboards
- `data.csv` only when using HTML + separate `data_files` upload (legacy path)

For ZIP bundles, put datasets and optional `sync_scripts` in `artifacta.json` — see `docs/protocol/manifest-v1.md` and `docs/protocol/examples/script-sync-dashboard/artifacta.json`.

## Step 5: Create the Remote Project

**ZIP with manifest (recommended):**

```bash
artifacta projects upload \
  --file ./dashboard.zip \
  --name "Weekly Growth" \
  --visibility team
```

The CLI uploads the ZIP via `POST /upload-sessions`, then publishes with `manifest_mode=auto`. You do **not** need `--data-file` when CSV/JSON paths are declared in `artifacta.json`.

**Single HTML + separate dataset:**

```bash
artifacta projects upload \
  --file ./dashboard.html \
  --name "Weekly Growth" \
  --data-file ./data.csv \
  --visibility team
```

This creates the remote Artifacta project and returns a JSON payload that includes `id` and `preview_url`.

## Step 6: Update an Existing Remote Project

If the remote project already exists, use its `project_id` instead of creating a new one:

```bash
artifacta projects update-html \
  --project-id proj_123 \
  --file ./dashboard-v2.zip
```

## Step 7: Add or Replace Datasets

Add a new dataset:

```bash
artifacta datasets upload \
  --project-id proj_123 \
  --file ./data.csv \
  --name "Weekly Growth Data"
```

Replace an existing dataset:

```bash
artifacta datasets replace \
  --project-id proj_123 \
  --dataset-id ds_123 \
  --file ./data-v2.csv
```

## Step 8: Submit Sync Configuration JSON

If your workflow also needs dataset sync configuration:

```bash
artifacta datasets sync set \
  --project-id proj_123 \
  --dataset-id ds_123 \
  --source-type presto \
  --config-file ./sync.json
```

The CLI passes your local JSON object through to `source_config`.

## Step 9: Trigger Sync

**Per-dataset remote source (URL/COS/Presto):**

```bash
artifacta sync trigger \
  --project-id proj_123 \
  --dataset-id ds_123
```

**Bundle script from `artifacta.json`:**

```bash
artifacta sync-scripts trigger \
  --project-id proj_123 \
  --script-id sscript_xxxxxxxx
```

List scripts with `artifacta sync-scripts list --project-id proj_123`. Configure secrets with `sync-scripts set --config-file ./secrets.json` (stored server-side as `source_config`, injected as `ARTIFACTA_SOURCE_CONFIG` when the script runs).

## Claude Code / Skill Pattern

The recommended agent pattern is:

1. Generate files locally
2. Stage them in a predictable temp directory
3. Call `artifacta projects upload` or `artifacta projects update-html`
4. Optionally upload datasets
5. Optionally submit `sync.json`
6. Return the Artifacta `preview_url` to the user

Use `templates/claude-code-artifacta-publisher/SKILL.md` as the copyable starting point.

## Good Defaults

- Use ZIP dashboards if your HTML references CSS, JS, fonts, or images; include `artifacta.json` when you want zero-config dataset binding or bundle script sync.
- Do not pass ZIP via `html_file` on `POST /projects` — the CLI and API use upload sessions instead.
- Treat `project_id` and `dataset_id` as remote IDs owned by Artifacta, not local folder names.
- Keep API keys in environment variables, not inside prompts or committed files.
- Return the `preview_url` to the user after every successful upload.

## Troubleshooting

- `ARTIFACTA_API_KEY is required`: export the API key first.
- `UNAUTHORIZED`: the API key is invalid, expired, or scoped to a different site.
- `INVALID_ARTIFACT`: the HTML or ZIP payload is malformed.
- Dataset sync config issues: confirm your JSON is a single object and not an array.

For the full CLI command list, run `artifacta --help`.
