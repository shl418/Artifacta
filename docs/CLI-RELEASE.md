# Artifacta CLI Release Guide

The standalone CLI is published on npm as [`@artifacta/cli`](https://www.npmjs.com/package/@artifacta/cli).

External users can install it without cloning this repository:

```bash
npx @artifacta/cli@latest --help
npm install -g @artifacta/cli
```

Use this guide when you need to bump and republish a new CLI version.

## Package Layout

- `packages/cli/package.json`: publish metadata for `@artifacta/cli`
- `packages/cli/bin/artifacta.mjs`: standalone CLI entrypoint
- `bin/artifacta.mjs`: repo-local wrapper used by `pnpm cli -- ...`

## Release Checklist

1. Update the version in `packages/cli/package.json`.
2. Validate the app and CLI locally:

```bash
pnpm typecheck
pnpm lint
pnpm cli:pack
pnpm cli:publish:dry-run
```

3. Inspect the generated tarball in `packages/cli/`.
4. Publish to npm with registry credentials:

```bash
cd packages/cli
npm publish --access public
```

5. Verify the public install path after publish:

```bash
npx @artifacta/cli@latest --help
```

## Offline / Tarball Distribution

If a user cannot reach the public npm registry, you can still hand off the tarball produced by `pnpm cli:pack`.

Consumers can install that tarball directly:

```bash
npm install -g ./artifacta-cli-0.1.0.tgz
```

That gives them the same `artifacta` command locally.

## What External Users Need

The CLI itself is stateless. External users still need:

- `ARTIFACTA_URL`
- `ARTIFACTA_API_KEY`
- local HTML or ZIP dashboard artifacts
- for ZIP bundles: optional `artifacta.json` inside the ZIP (`docs/protocol/manifest-v1.md`)
- optional dataset files (legacy HTML path only, or separate `datasets upload`)
- optional per-dataset sync JSON (`datasets sync set`) or bundle script secrets (`sync-scripts set`)

### CLI surface to mention in release notes

When bumping `@artifacta/cli`, document behavior changes in `CHANGELOG.md`:

| Command | Notes |
| --- | --- |
| `projects upload --file *.zip` | Uses upload session + `manifest_mode=auto`; no `--data-file` needed when manifest lists datasets |
| `projects update-html --file *.zip` | Same session flow with existing `project_id` |
| `sync-scripts list\|set\|trigger\|status` | Bundle `sync_scripts` from manifest |
| `bundle run-script` | Local-only helper; not required for publish |

Server requirements for script sync: Python 3 on the worker host (`ARTIFACTA_PYTHON`), running `scripts/sync-worker.mjs` with an API key that has `sync:run`.

For the end-user path, see `docs/ONBOARDING.md` and the `artifacta-publisher` skill under `skills/artifacta-publisher/SKILL.md`.