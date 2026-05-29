# Consistency & Optimization Plan

Date: 2026-05-29
Status: Proposed
Scope: Full review — build/test health, doc↔code consistency, structure, UX, features.

This plan closes out the mid-flight `manual-script-sync-only` refactor
(see [2026-05-27-manual-script-sync-only.md](2026-05-27-manual-script-sync-only.md)),
which currently leaves `pnpm typecheck` / `pnpm build` / `pnpm test` red, and
realigns documentation with the shipped behavior.

Confirmed decisions (2026-05-29):
- Dataset-level dynamic sync (URL / COS / Presto) is **removed for good** — finish the teardown.
- README naming stays `README.md` (Chinese) + `README-EN.md` (English); only fix cross-links.
- Deliverable covers all dimensions (build, docs, structure, UX, features).

---

## P0 — Restore green build & tests (blocking)

Root cause: the sync teardown gutted `source-policy.ts` and rewired the routes
to return 410, but left the executor layer and its tests behind.

- [ ] Delete orphaned executor code (no route imports them anymore):
  - `lib/server/sync-runner.ts` (`runDatasetSync`, `probeDatasetSyncSource`)
  - `lib/server/sync/source-adapters.ts`
  - `lib/server/sync/source-policy.ts` (now only comments → "not a module" TS2306)
- [ ] Delete the now-orphaned dataset job-claim path:
  - `app/api/v1/sync/jobs/claim/route.ts` (already a `{ job: null }` stub)
  - `lib/server/sync/jobs.ts` and `job-lifecycle.ts` — verify they are dataset-job
    only; keep anything still used by `script-jobs.ts`.
- [ ] Remove tests that load the deleted modules:
  - `scripts/test-source-adapters.mjs` (in `test:unit`)
  - `scripts/test-sync-source-policy.mjs` (in `test:security`)
  - Prune both from the `package.json` `test:unit` / `test:security` chains.
  - Audit `test-sync-jobs.mjs` / `test-job-lifecycle.mjs` — drop dataset-sync
    assertions, keep script-job coverage.
- [ ] Narrow `DatasetSourceType` in `lib/types.ts` to `"manual"` and confirm
    `serializeSyncConfig` / the `sync/route.ts` `sources` set agree.
- [ ] Gate: `pnpm typecheck && pnpm build && pnpm test` all green.

## P0.5 — Decide dataset sync route surface

The `datasets/:id/sync` route tree is half-removed (`GET/PUT` config still works
for `manual`; `test`/`trigger` return removed messages). Pick one and apply
consistently:

- [ ] **Recommended:** keep `GET/PUT/status/history` (read static config + past
    runs), keep `test`/`trigger` returning `410 SYNC_REMOVED`, and document them
    as deprecated tombstones. Lowest churn for any existing clients.
- [ ] Update `docs/IMPLEMENTED-FEATURES.md:30` to describe this surface as
    "manual-only / removed-source tombstone", not "legacy URL/COS/Presto".

## P1 — Documentation ↔ code consistency

Purge every "dynamic dataset sync" claim and dead CLI example.

- [ ] `README.md`: fix self-link `[English README](README.md)` → `README-EN.md`
    (line 27); remove the `--source-type presto` CLI example (89), the "COS 同步"
    walkthrough mention (128), and the "URL/COS/S3/Presto executor" paragraph (145)
    so it matches the "已移除" boundary note (204).
- [ ] `README-EN.md`: fix `[中文说明](README.zh-CN.md)` → `README.md` (27); remove
    stale sync examples/paragraphs (89, 128, 140, 198).
- [ ] `docs/IMPLEMENTED-FEATURES.md`: fix `README.zh-CN.md` → `README.md`
    (lines 9, 68); drop CLI rows `datasets sync set --source-type` (49) and
    `sync trigger` (50) or mark removed; update line 9 (`app/datasets/page.tsx`
    is now a redirect to `/dashboards`).
- [ ] `docs/API.md`: rewrite the dataset-sync sections (23, 25, 437, 575,
    655–718, 1104, 1173, 1194–1206, 1257) — remove cos/presto/url request bodies
    and CLI flags; state dataset sources are manual-only and point dynamic updates
    to project `sync-scripts`. Keep `docs/openapi/artifacta.v1.yaml` in step.
- [ ] `docs/PRODUCT.md`: update 88–95, 170, 211, 276 — fold "通用文件/URL 同步"
    into roadmap/removed; keep only `sync_scripts` as the dynamic path.
- [ ] `examples/`: retire `5-html-csv-cos` (and its WALKTHROUGH section 133–177,
    table row 177) or convert it into a `sync_scripts` example; remove
    `--source-type cos` + `sync trigger` instructions.
- [ ] CLI: remove (or hard-deprecate with a clear "use sync-scripts" error) the
    `datasets sync set --source-type` and `sync trigger` subcommands in
    `packages/cli/bin/artifacta.mjs`; update `packages/cli/README.md`.

## P2 — Structure optimization

- [ ] Consolidate the sync module: after P0, `lib/server/sync/` should contain
    only the script-sync stack (`script-runner`, `script-jobs`, `sync-scripts`,
    `cron`, `validate-config`). Confirm no dangling re-exports/`index` references
    the deleted files.
- [ ] Collapse the dataset `sync/` route subtree if P0.5 chooses full removal;
    otherwise add a short README in that folder noting tombstone status.
- [ ] Verify `instrumentation.ts` / any worker bootstrap no longer references
    dataset due-checks (worker already only calls `/sync/script-jobs/claim`).

## P3 — UX optimization

- [ ] Document the newly added i18n (untracked `lib/i18n/`, `lib/server/cookies.ts`,
    zh/en toggle wired across pages): add a "界面语言 / Language" note to both
    READMEs and a row to the config/usage docs; describe how the language cookie
    is set (`lib/server/cookies.ts`).
- [ ] Dataset experience: `app/datasets/page.tsx` now redirects to `/dashboards`.
    Ensure the project page (`app/projects/[projectId]/page.tsx`) clearly guides
    users from a static dataset to "项目同步脚本" for dynamic updates (the plan's
    stated UX direction), and that the 410 `test`/`trigger` messages surface
    gracefully in the UI rather than as raw errors.
- [ ] Confirm i18n coverage has no missing keys for the changed sync/dataset
    copy (run the app in both zh and en, check the dataset + settings pages).

## P4 — Feature optimization (backlog, non-blocking)

- [ ] Add an explicit `docs/INTERACTIONS.md` end-to-end flow map (upload →
    dataset → script trigger → history), as floated in the 05-27 plan.
- [ ] Keep `IMPLEMENTED-FEATURES.md` "Not Implemented Yet" honest: SAML, MySQL
    adapter, password-protected links, project-owner transfer, full cron — confirm
    none silently changed during the refactor.
- [ ] Re-evaluate the Postgres driver note (single-row JSONB blob, PoC) — either
    schedule the relational implementation or clearly fence it as non-production
    everywhere it's mentioned.

## Verification gate

- `pnpm typecheck` — green
- `pnpm build` — green
- `pnpm test` (api-contract, client, security, unit) — green
- `pnpm test:api-contract` — routes still match OpenAPI after doc/route edits
- Manual: app boots, dataset page guidance + zh/en toggle work, removed sync
  endpoints return clean 410s.
- `grep -riE "presto|cos|--source-type|sync trigger" README*.md docs/ examples/`
  returns only intentional "removed/roadmap" mentions.
