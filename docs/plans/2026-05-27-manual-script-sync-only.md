# Manual Script Sync Only Plan

Date: 2026-05-27
Status: In progress

## Goal

Unify data updates into one path for the single-node stage: users click to run project sync scripts manually. Remove dataset-level dynamic connectors (`cos`, `presto`) and remove scheduled sync behavior.

## Interaction Logic

1. Upload ZIP and import bundle metadata (`artifacta.json`).
2. Datasets are treated as static data by default.
3. Dynamic updates are only provided by project-level `sync_scripts`.
4. Users trigger updates manually from project sync script actions.
5. No cron schedule, no automatic backfill, and no worker-driven dataset due checks.

## UX Direction

- Dataset configuration no longer asks for `source_type`, cron, or connector JSON.
- Dataset pages explicitly guide users to project sync scripts for dynamic updates.
- Script update UI avoids raw empty `{}` by keeping configuration scoped to script-level fields and explicit output paths.

## Codebase Documentation Strategy

Yes, keep one living interaction doc for current behavior. Suggested target:

- `docs/IMPLEMENTED-FEATURES.md` for shipped behavior summary.
- `docs/plans/` for migration and change plans.
- Optionally add `docs/INTERACTIONS.md` later for end-to-end user flow maps (upload, dataset config, script trigger, history).

## Planned/Applied Changes

- API validation: dataset sync config accepts manual-only mode.
- Dataset sync trigger/test endpoints: dataset connector path disabled and message points to script flow.
- Worker behavior: no dataset due scheduling; only claim queued script jobs.
- Script sync model: schedule fields neutralized (`null`) and manual trigger retained.
- Seed data: remove demo `presto` connector defaults.
- Frontend dataset page: remove COS/Presto options and cron-oriented controls, keep static-data presentation and guidance.

## Verification

- `pnpm typecheck`
- `pnpm build`
