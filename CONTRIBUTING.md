# Contributing

Thanks for helping improve Artifacta. This project is meant to be friendly to humans and coding agents, so every contribution should keep setup, docs, and verification explicit.

## Before Opening A PR

Run the checks that match your change:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test:api-contract
pnpm test:client
pnpm test:security
pnpm test:unit
pnpm cli:pack
```

Or run the full local suite with `pnpm test`.

Run `pnpm test:smoke` against a running app when touching auth, upload, ZIP rendering, API keys, dataset preview, versions, embed tokens, or sync behavior. CI runs smoke automatically after build.

## Documentation Expectations

- Update `docs/IMPLEMENTED-FEATURES.md` whenever a route, UI surface, CLI command, storage boundary, or worker behavior changes.
- Keep `docs/API.md`, `docs/openapi/artifacta.v1.yaml`, and examples aligned with implemented response fields.
- Keep API response fields snake_case and internal TypeScript fields camelCase.
- Add a `CHANGELOG.md` entry for API, protocol, storage, auth, sync, or CLI behavior changes.

## Development Environment

Use Node `24.16.0` and `pnpm@11.1.3`. See `docs/DEVELOPMENT-ENVIRONMENT.md` for the `fnm` setup and non-interactive shell notes.

