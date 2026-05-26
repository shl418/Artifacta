# Local Dashboard Dev Preview & Hosting Reliability

Date: 2026-05-24
Status: **Planned**
Related: `templates/claude-code-artifacta-publisher/SKILL.md`, `docs/protocol/manifest-v1.md`, `examples/`, `lib/server/storage.ts`, `lib/server/artifacts/`, `app/api/v1/projects/[projectId]/html/[...assetPath]/route.ts`

## Summary

Two halves of one story: **make `local → hosted` honest.**

**Half 1 — author experience.** Authors and AI agents generate HTML/JS BI dashboards locally, but opening `index.html` via `file://` cannot `fetch()` sibling CSV files (browsers block requests from origin `null`). The workaround (`<input type="file">`) breaks the Artifacta contract (`fetch("data/sales.csv")` should work the same locally and hosted) and makes local BI iteration feel broken. Fix is mostly docs + agent SKILL + an example, **not** new CLI tooling.

**Half 2 — platform reliability.** While reading the runtime to ground Half 1, several issues surfaced where the platform doesn't honor — or doesn't enforce — the contract it advertises:

- Auth-gated asset responses are sent with `Cache-Control: public` — a shared cache can leak private bundle assets.
- Two ZIP extraction paths disagree on which `entrypoint` to use (legacy ignores manifest; new path honors it).
- Every bundle asset request reads the **entire** database (all three drivers — JSON, SQLite, Postgres).
- Hosting constraints (single-page, ZIP-required, sibling `.html` blocked) are enforced silently at request time with generic 404s, not at upload validation.
- A stale "ZIP unpacking is coming" placeholder still ships in code.
- `contentTypeForPath` is a private helper, blocking parity reuse if `artifacta dev` is ever built.

This plan ships **two PRs**:

- **PR-A: docs & example** (no code in `lib/server`) — SKILL, ONBOARDING, `examples/data-dashboard/`.
- **PR-B: platform reliability** — cache-control, ZIP-path convergence, upload-time validation, per-project DB read, placeholder cleanup, MIME extraction, asset-blocked error code.

**Non-goals:**

- A new `artifacta dev` static server in v1 (see "Deferred" below for trigger conditions).
- Watch-mode auto-upload to a running Artifacta instance.
- Bundling a client-side XLSX parser into the platform (dashboards may use CDN SheetJS).

---

## Problem statement

### Half 1: local-author symptoms

| Symptom | Root cause |
|---------|------------|
| `fetch("./data/sales.csv")` fails when double-clicking HTML | `file://` origin is `null`; browsers block fetch to local files |
| Only `<input type="file">` works locally | FileReader reads user-selected blobs — no HTTP needed |
| Agents default to file-picker pattern | SKILL and examples do not demonstrate the `fetch()` pattern; nothing forbids file pickers as the default |
| "Local preview = hosted preview" is undocumented | ONBOARDING focuses on upload; there's no "Step 0: preview locally" |

Artifacta **already** serves bundle assets over HTTP in production (`GET /api/v1/projects/:id/html/...`). Any standard local HTTP server gives the same path semantics for free.

### Half 2: platform inconsistencies

| Symptom | Root cause |
|---------|------------|
| Private/team bundle CSS/JS/CSV could be cached by a shared CDN | `route.ts:29` sets `Cache-Control: public, max-age=300` regardless of `project.visibility` (`"private" \| "team" \| "public"`) |
| `entrypoint: pages/home.html` works through one upload API but not another | `extractProjectZip` (`storage.ts:181-184`) picks first `index.html`; `upload-session.ts:294` prefers `bundledManifest.entrypoint` |
| Page load with 20 assets = 20 full-DB reads | `readDatabase()` (`db.ts:313-319`) reads the whole DB across **all three drivers**; the asset route then `Array.find()`s for one project |
| User uploads multi-page ZIP, finds out at runtime when sibling 404s | `readDashboardAsset` (`storage.ts:118`) blocks `.html` siblings silently; no upload-time check |
| Agent receives generic `404 看板资源不存在` for a deliberately blocked sibling HTML | Same code path returns null for "missing" and "blocked", route maps both to `NOT_FOUND` |
| `zipPlaceholderHtml` HTML claims "下一里程碑会加入 ZIP 解包" | `storage.ts:226-249` placeholder predates ZIP extraction; now stale and misleading |
| Future `artifacta dev` would have to duplicate MIME logic | `contentTypeForPath` is a private function in `storage.ts:204-224` |

---

## Codebase baseline (2026-05-24)

| Area | File / location | Current behavior | Gap |
|------|-----------------|------------------|-----|
| **SKILL** | `templates/claude-code-artifacta-publisher/SKILL.md` | Says "relative URLs work locally and on Artifacta" | Doesn't say **how** (must be HTTP, not `file://`), doesn't forbid file-picker defaults, doesn't warn about multi-page / absolute-path footguns |
| **Examples** | `examples/{single-file-dashboard,zip-dashboard}` | Static metrics only; `zip-dashboard/assets/app.js` is a one-liner that sets text | No CSV `fetch()` + render demo |
| **ONBOARDING** | `docs/ONBOARDING.md`, `docs/ONBOARDING.zh-CN.md` | Starts at "create API key" → upload | No local-preview step before upload |
| **CLI** | `packages/cli/bin/artifacta.mjs` | `projects / datasets / sync / sync-scripts / bundle run-script / doctor` | No static preview command |
| **Asset route cache** | `app/api/v1/projects/[projectId]/html/[...assetPath]/route.ts:29` | `Cache-Control: public, max-age=300` for all visibilities | Should respect `project.visibility` |
| **ZIP entrypoint resolution** | `lib/server/storage.ts:177-184` vs `lib/server/artifacts/upload-session.ts:294` | Two paths, two rules | Must converge |
| **DB read pattern** | `lib/server/db.ts:313-319` + `route.ts:16` | `readDatabase()` reads whole DB on every asset request | Need `getProjectById(id)` per-driver |
| **Manifest validation** | `lib/server/artifacts/manifest.ts` | Validates path shape and dataset/sync_script cross-refs | No multi-HTML check, no `kind` vs extension check |
| **MIME helper** | `lib/server/storage.ts:204-224` | Private function | Should be exported / extractable |
| **Asset block UX** | `lib/server/storage.ts:114-127` + `route.ts:23-24` | Returns `null` for missing **and** blocked-by-design (`.html` siblings, single-file bundles) | Need a discriminated return so route can emit distinct error codes |

### Code facts that constrain the plan

Read these before editing. They drive every decision below.

- **`<base href>` injection** (`lib/server/storage.ts:193-202`): hosted serves the entrypoint HTML with `<base href="/api/v1/projects/:id/html/{entryDir}/">` injected. **This is why `fetch("data/sales.csv")` works the same locally and hosted** — both resolve against the entrypoint's directory.
- **Hosted asset route blocks `.html`** (`storage.ts:118`, `readDashboardAsset` returns `null` when `safePath.toLowerCase().endsWith(".html")`). Only the entrypoint HTML is reachable; sibling/subpage HTML files **404**. → Bundles must be single-HTML-page.
- **Hosted MIME map** (`contentTypeForPath`, `storage.ts:204-224`) covers `.css/.js/.mjs/.json/.csv/.png/.jpg/.jpeg/.gif/.webp/.svg/.ico/.woff/.woff2/.ttf`. **Not in the map: `.tsv`, `.jsonl`, `.parquet`, `.xlsx`** — unknown extensions fall back to `application/octet-stream`.
- **Legacy `extractProjectZip` requires `index.html`** (`storage.ts:181-184`) and **does not consult manifest `entrypoint`**. Newer `upload-session.ts:294` **does** honor `bundledManifest.entrypoint`. To stay safe across both, pin examples and templates to `entrypoint: index.html`.
- **Single-file `.html` upload has no asset route at all** (`readDashboardAsset` returns `null` when `htmlArtifact.kind !== "zip"`). A dashboard that needs `fetch(relative)` **must** be a ZIP bundle.
- **Absolute paths break hosted parity**: locally `fetch("/data/sales.csv")` hits the local server root; hosted it bypasses `<base href>` and hits the Artifacta app root → 404. Only `relative` and `./relative` are safe.
- **`readDatabase()` is the only read primitive** (`db.ts:313`): all three drivers load and normalize the full DB on every call.
- **Visibility values**: `"private" | "team" | "public"` (`lib/types.ts:3`).

---

## Decision log

| # | Topic | Decision |
|---|-------|----------|
| 1 | Local preview transport | **HTTP only.** Never document or support `file://`. |
| 2 | Local server tool | **Reuse stdlib / standard tools** (`npx serve .`, `python3 -m http.server`). Do **not** ship `artifacta dev` in v1. |
| 3 | Path parity | Authors write relative URLs (`data/sales.csv`); same paths locally and hosted. |
| 4 | Agent guidance | SKILL hard rule: HTTP preview required; **file picker only for products whose purpose is uploading user files**, never as a workaround for `file://`. |
| 5 | Example data pattern | `fetch(relativePath)` + small inline CSV split (no deps); comment notes SheetJS-via-CDN for the rare XLSX case. |
| 6 | Dataset format guidance | **CSV/JSON over XLSX** for AI-generated dashboards. XLSX acceptable only when the source is genuinely Excel. |
| 7 | `file://` UX in user templates | **No detection banner in the example.** Docs handle this. |
| 8 | `artifacta dev` trigger | Revisit only if **at least one**: (a) `npx serve` / Python unavailable or bad first-run, (b) bundles with non-`index.html` `entrypoint` become common and the directory-listing landing causes friction. |
| 9 | Cache visibility | `Cache-Control: private` for `visibility ∈ {private, team}`; `public` only for `visibility = public`. |
| 10 | ZIP entrypoint resolution | **Both upload paths must honor `bundledManifest.entrypoint` when present**, falling back to first-found `index.html`. Legacy `extractProjectZip` becomes a lower-level extraction primitive; entrypoint resolution lives one layer up. |
| 11 | DB read pattern | Add `getProjectById(projectId)` to the db module; asset route uses it. JSON driver may still read the whole file but stops linear-scanning the result; SQLite/Postgres become an indexed lookup. |
| 12 | Upload-time validation | At extraction time, reject (or warn + degrade) bundles that violate hosting constraints: multiple `.html` files, no `index.html`, dataset `kind` mismatching extension. Errors carry stable codes so the SKILL / agents can act on them. |
| 13 | Asset block error code | `readDashboardAsset` returns a discriminated result: `{ kind: "ok", … }`, `{ kind: "blocked", reason: "html_sibling" \| "not_a_zip_bundle" }`, or `null` for genuinely missing. Route maps `blocked` to `409 ASSET_BLOCKED` (or `404` with an explicit error code) so agents can decode it. |
| 14 | MIME helper | Extract `contentTypeForPath` (and the `.html`-block rule) to `lib/server/artifacts/mime.ts`; export for any future CLI/dev-server reuse. Also covers the `artifacta dev` deferred work without duplicating logic. |

---

## Architecture

```text
Developer / Agent
    │
    ├─► cd my-dashboard && npx serve .          (or: python3 -m http.server 5173)
    │       └─► serves bundle root over HTTP; baseURI = http://host/
    │
    ├─► Browser http://localhost:3000/index.html
    │       └─► fetch("data/sales.csv") resolves to /data/sales.csv  ✓
    │
    └─► artifacta projects upload --file dashboard.zip
            │
            ├─► [validateBundleForHosting] (new)
            │     reject: multiple .html, no index.html, kind/ext mismatch
            │     warn:   xlsx/tsv/jsonl in datasets (octet-stream on hosted)
            │
            └─► Artifacta serves entry HTML with injected
                <base href="/api/v1/projects/:id/html/">
                Cache-Control matched to project.visibility
                fetch("data/sales.csv") resolves to
                  /api/v1/projects/:id/html/data/sales.csv  ✓
```

**Why path parity works:** the hosted entrypoint gets `<base href>` injected (`storage.ts:193`) so the browser resolves every relative URL against the bundle root, same as a plain static server. The author writes one set of relative paths; both ends do the right thing. **Absolute paths (`/data/sales.csv`) break this** — they bypass `<base href>` and hit the Artifacta app root.

**Contract for dashboard authors:**

```javascript
// Works under any local HTTP server AND on Artifacta hosting
const csvText = await fetch("data/sales.csv").then((r) => {
  if (!r.ok) throw new Error(`Failed to load data/sales.csv: ${r.status}`)
  return r.text()
})
```

**Contract for agents (SKILL):**

```markdown
NEVER instruct the user to double-click index.html.
Before upload: tell the user to run `npx serve .` (or `python3 -m http.server`) in the bundle root and open the printed URL.
Use fetch(relativePath) for bundle datasets — NOT <input type="file"> unless the product is a file-upload tool.

Hard constraints (enforced by Artifacta hosting, not just convention):
- The bundle must be a ZIP and must contain index.html at the bundle root. Single-file .html uploads cannot fetch sibling files.
- Only the entrypoint HTML is reachable on hosted; sibling .html files 404. Build single-page dashboards (router state in URL hash if needed).
- Use relative paths only (`data/sales.csv` or `./data/sales.csv`). Never leading-slash absolute paths.
- Prefer CSV / JSON datasets — those have correct Content-Type on hosted. .tsv / .jsonl / .parquet / .xlsx fall back to application/octet-stream (works for SheetJS-via-CDN, but CSV is the smooth path).
```

---

## PR-A — docs & example (no `lib/server` changes)

### A1. SKILL update — `templates/claude-code-artifacta-publisher/SKILL.md`

(There is no zh-CN SKILL copy today — only `SKILL.md`.)

- Insert a **"Local preview"** section near the top of the workflow:
  - Hard rule: HTTP only; `file://` is unsupported (one-sentence reason: browsers block `fetch` from `null` origin).
  - Recommended commands: `npx serve .` (Node available) or `python3 -m http.server 5173`.
  - Open the printed URL; verify all `fetch()` calls succeed in DevTools Network before zipping.
- In the bundle-layout / data section, add the **four hard constraints** from the agent contract (ZIP-required, single-HTML-page, relative-only, CSV/JSON preferred). Tie each to *why* it matters — these are platform behaviors enforced by code, not style preferences.
- Forbid `<input type="file">` as the default data-loading pattern for BI dashboards; it's only legitimate when the product *is* a file-upload tool.

### A2. New example — `examples/data-dashboard/`

```text
examples/data-dashboard/
  artifacta.json
  index.html               # MUST be at bundle root (extractProjectZip requires it)
  data/
    sales.csv              # reuse examples/datasets/sales.csv content
  assets/
    app.js
    styles.css
  README.md                # one screen: serve locally, then upload
```

- `artifacta.json`: `entrypoint: index.html` (satisfies both legacy and upload-session paths); one `sales` dataset of kind `csv` at `data/sales.csv`, `refresh: manual`.
- `assets/app.js`: on load, `fetch("data/sales.csv")`, split lines/commas (no deps), render one table + 2–3 metric cards. Relative path (no leading `/`). Throw clearly on fetch failure so the console points at the cause.
- **Single HTML page only** — no links to sibling `.html` files (they 404 on hosted).
- **No `file://` detection banner.** Console error + README is the teacher.
- `README.md`: spell out the two-command flow:
  ```bash
  npx serve .                                                    # preview
  zip -r ../data-dashboard.zip . -x "*.git*" -x "__MACOSX/*"
  artifacta projects upload --file ../data-dashboard.zip --name "Data Example"
  ```

### A3. ONBOARDING — `docs/ONBOARDING.md` + `docs/ONBOARDING.zh-CN.md`

- Insert **"Step 0: Preview locally"** before the API-key step.
- Show both `npx serve .` and `python3 -m http.server` as one-liners.
- One sentence on **why** `file://` doesn't work.
- One paragraph on the three hosting constraints: ZIP-required (not single `.html`), single-page (siblings 404), relative paths only.
- Link to `examples/data-dashboard/`.

### A4. README / examples index touch-ups

- `examples/README.md`: add `data-dashboard` row with the two-command flow.
- `README.md` and `README.zh-CN.md`: under "Examples" mention the new dashboard briefly. No CLI changes.
- `docs/IMPLEMENTED-FEATURES.md`: list the new example.
- `CHANGELOG.md`: one-line entry on release.

---

## PR-B — platform reliability (`lib/server` + route)

Each item is independent enough to be reviewed separately, but they share `storage.ts` and the route file, so one PR is cleaner. Suggested commit split appears at the end.

### B1. Visibility-aware Cache-Control

**File**: `app/api/v1/projects/[projectId]/html/[...assetPath]/route.ts:29`

**Why**: Current header is `Cache-Control: public, max-age=300` for all responses. A shared CDN or reverse proxy may cache and serve private/team assets to unauthorized clients hitting the same path. Visibility values are `"private" | "team" | "public"` (`lib/types.ts:3`).

**Change**:

```ts
const cacheControl =
  project.visibility === "public"
    ? "public, max-age=300"
    : "private, max-age=300"

return new NextResponse(new Uint8Array(asset.buffer), {
  headers: { "Content-Type": asset.contentType, "Cache-Control": cacheControl },
})
```

**Test**: extend a security/contract test to assert each visibility → expected `Cache-Control`. Add to `pnpm test:security` (visibility + cache header is a security boundary).

### B2. ZIP entrypoint convergence

**Files**: `lib/server/storage.ts:149-187` (`extractProjectZip`), `lib/server/artifacts/upload-session.ts:278-294`, any other callers of `extractProjectZip` (verify via grep before editing).

**Why**: Today the legacy path requires and selects `index.html`, ignoring manifest entrypoint. The newer upload-session path consults the bundled manifest. Same ZIP can produce different `entryPath` depending on the API used. SKILL says "manifest decides" — code says "depends."

**Change**:

1. **`extractProjectZip` becomes the lower-level extraction primitive** that writes files and reports what it found (don't make it decide the entrypoint).
   - Replace the "throws if no index.html" with: return `{ assetRoot, htmlFiles: string[], defaultIndex: string | null }`. `defaultIndex` is the first `index.html` found (root preferred, then nested), or `null`.
   - Do not throw inside the extraction; let the caller decide.
2. **New helper** `resolveBundleEntryPath({ htmlFiles, defaultIndex, manifestEntry })` in `lib/server/artifacts/entrypoint.ts`:
   - If `manifestEntry` is provided and it appears in `htmlFiles` → use it.
   - Else if `manifestEntry` is provided but missing in the bundle → throw `INVALID_BUNDLE: manifest entrypoint not found`.
   - Else `defaultIndex` → use it.
   - Else throw `INVALID_BUNDLE: no index.html and no manifest entrypoint`.
3. **Both upload paths call the helper** with `manifestEntry = bundledManifest?.entrypoint ?? null` (legacy path passes `null`, behaves identically to today except errors are now stable).
4. Document the resolution rule in `docs/protocol/manifest-v1.md`.

**Test**: unit tests in `scripts/test-entrypoint.mjs` (or add to existing manifest test):
- manifest entry present + matches → returns manifest entry
- manifest entry present + missing → throws specific error
- no manifest entry + has `index.html` → returns it
- no manifest entry + nested `pages/index.html` only → returns nested
- nothing → throws

### B3. Per-project DB read on the asset route

**Files**: `lib/server/db.ts` (add new export), `app/api/v1/projects/[projectId]/html/[...assetPath]/route.ts:16-17`. Audit other hot routes that do the same after this lands.

**Why**: `readDatabase()` (`db.ts:313-319`) reads the whole DB and runs `normalizeDatabase()` for **all three drivers**. The asset route then `database.projects.find(...)`. A dashboard page with 20 assets = 20 full-DB reads + 20 linear scans. SQLite/Postgres don't help today because the read primitive isn't per-row.

**Change**:

1. Add to `lib/server/db.ts`:
   ```ts
   export async function getProjectById(projectId: string): Promise<Project | null>
   ```
   - JSON driver: still reads the file (acceptable for now) but returns just the project. Avoids the full-array scan and copy.
   - SQLite driver: `SELECT … FROM projects WHERE id = ? LIMIT 1` then normalize one row.
   - Postgres driver: same parameterized query.
2. Update the asset route to call `getProjectById(projectId)` and only call `readDatabase()` if needed (`canViewProject` may need org/membership data — check whether a `canViewProjectById` variant pays off here too).
3. Leave `readDatabase()` for full-DB callers (write paths, listings).

**Test**: add a perf-shaped unit test that calls the asset route N=20 times and asserts the JSON driver makes ≤ N file reads (not N×projects). Add to `pnpm test:unit`.

**Out of scope**: a broader DB-read audit. Note as follow-up if obvious other hot paths surface during this work.

### B4. Upload-time validation for hosting constraints

**Files**: `lib/server/storage.ts` (extraction), `lib/server/artifacts/manifest.ts` (manifest checks), `lib/server/artifacts/upload-session.ts` (call sites).

**Why**: Today hosting constraints are enforced silently at request time. A user uploads a multi-page bundle, gets a successful upload response, opens the preview, and discovers sibling `.html` files 404. Same for single-file `.html` uploads with sibling CSVs in the same form.

**Change**: introduce `validateBundleForHosting({ htmlFiles, manifest, entryPath })` returning `{ errors: Issue[], warnings: Issue[] }`. Each `Issue` has `{ code, message, path? }`.

Rules:

- **error** `MULTIPLE_HTML_FILES`: more than one `.html` in the bundle. Message lists them and explains sibling-HTML 404s. *(Code-enforced rule: `readDashboardAsset` blocks `.html`.)*
- **error** `NO_ENTRYPOINT`: no `index.html` and no manifest entrypoint.
- **error** `MANIFEST_ENTRYPOINT_MISSING`: manifest names a file the bundle doesn't contain.
- **error** `DATASET_KIND_EXTENSION_MISMATCH`: e.g. `kind: csv` + `path: data/foo.json`. Add to `manifest.ts` `superRefine`.
- **warning** `DATASET_MIME_FALLBACK`: dataset `path` extension not in the hosted MIME map (`.tsv`, `.jsonl`, `.parquet`, `.xlsx`, etc.). Message says "hosted Content-Type will be application/octet-stream; works with CDN parsers but CSV/JSON is the smooth path."
- **warning** `SINGLE_FILE_WITH_FETCH_HINT`: skip in v1 — we can't easily detect this without parsing the HTML. Defer.

Errors fail the upload session commit with a stable error code; warnings are returned in the response payload (and surfaced by the CLI / Web UI) but don't block. Add a `pnpm test:unit` case for each rule.

### B5. Remove stale `zipPlaceholderHtml`

**File**: `lib/server/storage.ts:226-249`

**Why**: The placeholder claims "下一里程碑会加入 ZIP 解包与多资源托管", but `extractProjectZip` has been implemented for some time. The placeholder is reached when `htmlArtifact.kind === "zip"` but `entryPath` or `assetRoot` is missing — that's a corrupt/half-uploaded state, not "feature coming."

**Change**:

- Replace with a proper error response (likely from `readDashboardHtml`): return a clear message ("Bundle metadata is incomplete; please re-upload.") and have the caller return a 5xx (or a specific 4xx if we can prove it's user-induced).
- Drop the Chinese-only template; if we keep any HTML, make it the same bilingual style as the rest of the app.

**Test**: add a unit test that simulates a project with `kind: zip` but missing `entryPath` and asserts the error path triggers.

### B6. Extract MIME helper to a shared module

**Files**: new `lib/server/artifacts/mime.ts`, update `lib/server/storage.ts` to import.

**Why**: `contentTypeForPath` and the `.html`-blocked rule are referenced by the SKILL and by the deferred `artifacta dev` plan. Today they're private to `storage.ts`. Extracting them is mechanical and unblocks future reuse.

**Change**:

- Move `contentTypeForPath` to `lib/server/artifacts/mime.ts` and export.
- Co-locate the `BLOCKED_HOSTED_EXTENSIONS = new Set([".html", ".htm"])` constant so `readDashboardAsset` references one source of truth.
- Update `storage.ts` to import.
- No behavior change. Pure refactor.

**Test**: existing tests should still pass; add one test that imports the module and asserts the CSV / JS / unknown-ext mappings.

### B7. Discriminated asset-blocked error

**Files**: `lib/server/storage.ts:114-127` (`readDashboardAsset`), `app/api/v1/projects/[projectId]/html/[...assetPath]/route.ts:23-24`.

**Why**: Today `readDashboardAsset` returns `null` for both "missing" and "blocked by design" (HTML sibling, or `htmlArtifact.kind !== "zip"`). The route maps both to `404 NOT_FOUND` with message `看板资源不存在`. Agents and CLI users can't tell apart "I have a typo" from "the platform refuses to serve this kind of file."

**Change**:

- Change `readDashboardAsset` return type to `Promise<AssetResult>` where:
  ```ts
  type AssetResult =
    | { kind: "ok"; buffer: Buffer; contentType: string }
    | { kind: "blocked"; reason: "html_sibling" | "not_zip_bundle" }
    | { kind: "missing" }
  ```
- Update route to map `blocked` → `409 ASSET_BLOCKED` (or `404` with explicit `error.code = "ASSET_BLOCKED"`; pick whichever matches the existing error-code convention). Body includes the `reason` so the SKILL/CLI can render a useful message.
- Update SKILL "Hard constraints" section to reference the error code.

**Test**: contract test under `pnpm test:api-contract` for each branch.

---

## Testing summary

| Layer | New tests |
|-------|-----------|
| `pnpm test:unit` | entrypoint resolution (B2), validateBundleForHosting per rule (B4), placeholder removal (B5), MIME module imports (B6), per-project DB read count assertion (B3) |
| `pnpm test:api-contract` | asset route returns `ASSET_BLOCKED` vs `NOT_FOUND` (B7) |
| `pnpm test:security` | Cache-Control varies by visibility (B1) |

Manual verification for PR-A (no automated tests, by design):

1. `cd examples/data-dashboard && npx serve .` → open the printed URL → table and metric cards render from `data/sales.csv`. DevTools Network shows `data/sales.csv` at 200.
2. `zip -r ../data-dashboard.zip . -x "*.git*" -x "__MACOSX/*"` then `artifacta projects upload --file ../data-dashboard.zip --name "Data Example"` → hosted preview renders identically; fetch hits `/api/v1/projects/:id/html/data/sales.csv` at 200.
3. **Negative cases that verify the SKILL claims stay accurate**:
   - Double-click `index.html` → fetch error in console (verifies `file://` failure mode).
   - Temporarily change `app.js` to `fetch("/data/sales.csv")` → works locally, **404 on hosted** (verifies the absolute-path footgun).
   - Add a second `.html` to the bundle → upload now rejects with `MULTIPLE_HTML_FILES` (after B4 lands).
4. After B7: hit `/api/v1/projects/:id/html/page.html` → response carries `error.code = "ASSET_BLOCKED"`.

---

## Success criteria

1. A new developer can `cd examples/data-dashboard && npx serve .` and see live CSV data without uploading.
2. The same HTML works after `artifacta projects upload` with **zero** path changes.
3. SKILL and ONBOARDING state that `file://` is unsupported and explain why in one sentence.
4. AI agents generated via the SKILL stop defaulting to `<input type="file">` for BI dashboards.
5. Private/team bundle assets never get `Cache-Control: public`.
6. Both upload paths produce identical `entryPath` for the same ZIP + manifest.
7. The asset route makes O(1) per-project DB reads, not O(full DB).
8. Multi-HTML bundles are rejected at upload, not silently 404'd at runtime.
9. The stale "ZIP coming soon" placeholder no longer ships.
10. `contentTypeForPath` lives in `lib/server/artifacts/mime.ts` and is importable.

---

## Suggested commit split (PR-B)

1. `refactor(artifacts): extract mime helper to lib/server/artifacts/mime.ts` (B6 — pure move, lowest risk; lands first)
2. `fix(api): cache-control respects project visibility` (B1 — one-line + test)
3. `chore(storage): remove stale zipPlaceholderHtml; surface bundle-corrupt error` (B5)
4. `refactor(artifacts): converge ZIP entrypoint resolution across upload paths` (B2)
5. `feat(artifacts): validateBundleForHosting at upload time` (B4)
6. `perf(db): add getProjectById; use it on the html asset route` (B3)
7. `feat(api): ASSET_BLOCKED distinct from NOT_FOUND for blocked siblings` (B7)

PR-A is independent and can land in parallel.

---

## Deferred — `artifacta dev` (only if v1 proves insufficient)

Revisit when one of the gating conditions in decision #8 fires. If we build it, keep it minimal **and mirror hosted constraints** so local doesn't pass while hosted breaks:

- New module `packages/cli/lib/dev-server.mjs`, exposing `createDevServer({ root, port, host })`.
- New top-level CLI command `artifacta dev [directory] [--port 5173] [--host 127.0.0.1]` (sibling of `doctor`, not under `bundle`).
- Behavior:
  - Node `http.createServer`, no new deps.
  - MIME map **imported from `lib/server/artifacts/mime.ts`** (after B6 lands). Unknown extensions return `application/octet-stream`. **Do not superset** — supersetting would let dashboards pass locally and break hosted.
  - Path-traversal rejection (reject `..`, resolve only under root).
  - Read `artifacta.json` `entrypoint` (reuse `artifactManifestSchema` from `lib/server/artifacts/manifest.ts`); redirect `/` to entrypoint. This is the **one** thing standard servers don't do, and the main justification for building this at all.
  - **Parity check**: emit a warning (not error) when serving a non-entrypoint `.html` file, since hosted will 404 it.
- One smoke test in `scripts/test-dev-server.mjs`: serve a temp dir, fetch a CSV (200), reject `..` traversal (400/403), redirect honors a non-default `entrypoint`.

Explicitly not in scope even then: `--open`, watch/upload, `doctor` warnings, live reload, proxying the Artifacta API.

---

## Out of scope (separate plans if needed)

| Item | Rationale |
|------|-----------|
| `artifacta dev --watch --upload` | Hot reload + auto publish; needs debounce + API key handling. |
| New authenticated dataset download API | Dashboards already use bundle-relative paths; an absolute API URL would break the local/hosted parity. |
| Built-in SheetJS in platform | Dashboards can load via CDN when truly needed; keeps the platform lean. |
| Editor extensions (VS Code / Cursor) | Nice-to-have but solves a smaller slice than the SKILL fix. |
| Broader DB read-pattern audit | B3 only fixes the html asset route; other hot routes (project listing, dataset preview) may have similar issues but should be measured first. |
| Asset bundle signed-URL token | All sibling asset URLs sharing one token would cut per-request auth cost; defer until DB read fix (B3) shows whether it's still the bottleneck. |
| Manifest `kind` auto-derivation | Today `kind` is required even though it's derivable from `path`. Could become optional in a manifest v1.1; out of scope for now. |
