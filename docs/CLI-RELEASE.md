# DataVision CLI Release Guide

This repository now contains a standalone publishable CLI package under `packages/cli`.

Use this guide when you want external users to install `datavision` without cloning the full DataVision app repository.

## Package Layout

- `packages/cli/package.json`: publish metadata for `@datavision/cli`
- `packages/cli/bin/datavision.mjs`: standalone CLI entrypoint
- `bin/datavision.mjs`: repo-local wrapper used by `pnpm cli -- ...`

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
npx @datavision/cli@latest --help
```

## Private Distribution Before npm Publish

If you are not ready to publish to npm, you can still hand off the tarball produced by `pnpm cli:pack`.

Consumers can install that tarball directly:

```bash
npm install -g ./datavision-cli-0.1.0.tgz
```

That gives them the same `datavision` command locally.

## What External Users Need

The CLI itself is stateless. External users still need:

- `DATAVISION_URL`
- `DATAVISION_API_KEY`
- local HTML or ZIP dashboard artifacts
- optional dataset files
- optional sync configuration JSON

For the end-user path, see `docs/ONBOARDING.md` and the Claude Code skill template under `templates/claude-code-datavision-publisher/SKILL.md`.