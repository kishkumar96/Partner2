# AGENTS.md

Guidance for working in this repository, for any coding agent or contributor. `CLAUDE.md` imports this file.

## What this is

`climate-dashboard` ("Partner2"): a Next.js 16 / React 19 / TypeScript dashboard showing hazard, exposure and impact information for four Pacific countries -Vanuatu (VU), Samoa (WS), Tonga (TO), Cook Islands (CK). It renders maps (MapLibre GL + deck.gl), THREDDS WMS hazard layers, cyclone tracks/forecasts, regional impact tables, charts (Chart.js) and PDF/situation-report exports (jsPDF, html2canvas).

Data comes from two places:
- **Local files** under `public/data/` (GeoJSON/CSV/GeoTIFF; see `public/data/README.md`) -the legacy/fallback source.
- **The "partner API"** -a Django REST middleware that lives in this repo under `middleware/`, reached through the Next.js proxy route. THREDDS (`gemthreddshpc.spc.int`) serves WMS tiles through the same proxy.
  - **Not every deployment is this code.** The shared API at `pacific-disaster-api.spc.int` (run by Anuj) is a different, older deployment and lacks what only this repo's middleware has. Checked 2026-10-28: no `risk_scenario` / `risk_scenario_breakdown`, no `forecast_runs` on events, no `hazard_zarr`, no `defer_large_assets`, and it ignores `?country=`, `?event=` and `?model_run=` (one risk-table page is 11.7 MB, the whole table 112 MB). `model_run` needs a login there. The dashboard has fallbacks for several of these (`partnerEvents.ts` splits runs by `model_run`, `scenarioLosses.ts` reads the loss tables from the bucket); don't assume a partner-API feature exists on the shared one without testing it. See `docs/HAZARD_CATALOG_ZARR.md`.

Requires Node `20.19.6` (`.nvmrc`), npm >= 10.

## Commands

```bash
npm run dev            # next dev on port 3002 (not 3000)
npm run build          # production build (output: 'standalone' in production)
npm start              # next start on port 3002
npm run type-check     # tsc --noEmit
npm run lint           # eslint (flat config, eslint.config.mjs)
npm run format:check   # prettier over src/**
npm test               # jest (jsdom); single file: npx jest src/utils/__tests__/foo.test.ts
npm run test:coverage
npm run warm:thredds   # scripts/warm-thredds.mjs -pre-warm THREDDS caches
npm run perf:playwright / perf:lighthouse / perf:ci   # performance checks
```

Husky hooks: **pre-commit** runs type-check + lint + format:check (tests disabled there); **pre-push** runs the full jest suite and `npm run build`. Commit messages are checked by `.husky/commit-msg` (conventional-commit style: `feat(scope):`, `fix(scope):`). `npm run ollama:*` scripts are optional local-LLM review tooling.

Tests live in `__tests__/` folders next to the code (`src/**/__tests__`), plus `src/__tests__` and top-level `tests/`. Jest maps `@/` → `src/`, mocks maplibre-gl, lucide-react and CSS/images via `__mocks__/`.

## Architecture

### Routing (`src/app`, App Router)
- `/` → `page.tsx`; `/[country]` → country dashboard (`DashboardView`), slugs: `vanuatu`, `samoa`, `tonga`, `cook-islands`. Also `/[country]/login`, `/methodology`, `/operator` (operator console).
- `src/proxy.ts` is the Next 16 request proxy (formerly middleware): country routing, per-country password auth gating, tenant lock, data-asset headers, and country scoping for `/api/buildings|roads|regional-summary*`. It imports `validateSecurityConfigOrThrow()` at load, so misconfigured auth env fails startup.
- `src/app/api/*`: `auth/{login,logout,verify-session,security-report}`, `operator/{login,logout,session,pipelines,runs,tracks}`, `events`, `cyclone`, `buildings`, `roads`, `exposure`, `regions`, `regional-summary[-by-sector]`, `stats`, `data/[filename]`, `health`, `metrics`, and **`partner-proxy/[...path]`**.
- `partner-proxy` forwards to `PARTNER_API_BASE_URL` (default `http://localhost:8000`); paths starting `thredds/` go to `THREDDS_BASE_URL` instead. It appends trailing slashes to DRF `partner_api/...` paths (but not file paths like tile PNGs), retries WMS requests, and applies timeouts/caching headers.

### Multi-tenancy / auth (`src/lib`)
- `TENANT_COUNTRY` env locks a deployment to one country (`utils/tenantCountry.ts`; `generateStaticParams` then emits only that country).
- `countryAuth.ts` -signed session cookie per country (`COUNTRY_PASSWORD_<CC>`, `COUNTRY_AUTH_SECRET`, `COUNTRY_PUBLIC_COUNTRIES`); `operatorAuth.ts` for the operator console; `rateLimit.ts`, `cache.ts`, `db.ts` (pg/Redis) back them. See `SECURITY.md`, `SECRETS_MANAGEMENT.md`.

### Data layer
- `src/services/partnerApiService.ts` -endpoint map for the partner API (`country`, `cyclone_track`, `risk_information`, `risk_scenario`, `risk_scenario_breakdown`, `hazard_information`, `citizen_science`, `event`); gated by `NEXT_PUBLIC_ENABLE_PARTNER_API` / `PARTNER_API_ENABLED`, per-country via `*_PARTNER_API_COUNTRIES`, and `*_STRICT_COUNTRIES` (no local fallback).
- `src/utils/realDataLoader.ts` -central loader producing `RealDataLoadResult` (events, regional impacts, forecast exposure) from the partner API or local files. Related: `dataLoader`, `fastDataLoader`, `lazyDataLoader`, `dataCache`, `csvParser`, `partnerEvents` (normalizes partner event rows / scopes risk rows to an event), `cycloneAnimationLoader`, `threddsLoader`, `geotiffLoader`.
- `src/data/` -static config: `countryConfigs`, `eventRecords` (event registry; observed events vs planning scenarios), `realThreddsLayers` (WMS layer catalog, `HazardScenarioSelection`), `vanuatuHazards`, `districtsGeo`, `localDataAliases`.
- Key domain concepts: **observed historical events** vs **hazard planning scenarios** vs **forecasts** (analysis mode switch); an Event aggregates many `RegionalImpact`s (see `docs/EVENT_ARCHITECTURE.md`); hazard IDs/loss scope in `utils/hazardIds.ts`, `hazardLossScope.ts` (`MULTI_HAZARD_ID`).
- Types: `src/types/index.ts` (domain), `realData.ts`, `thredds.ts` (`COUNTRIES`, `CountryCode`), `assetTables.ts`.

### State
- URL is the source of truth for shareable view state (`utils/urlState.ts`: selected event, hazard scenario, filters, analysis mode).
- `FilterState` + `utils/filterUtils.ts` / `filteredData.ts`; `stores/filteredDataStore.ts` (zustand) memoizes `computeFilteredData` by input identity so subscribers don't recompute. `stores/ARCHITECTURE_PROPOSAL.md` describes the intended wider store.
- `utils/userPreferences.ts` (localStorage), `layerOrder.ts` (map layer z-order).

### UI (`src/components`)
- `DashboardView` is the orchestrator; it composes `MapPanel`/`MapView` (map + `RealDataLayers`, `RegionalImpactsLayer`, cyclone layers, `ForecastLayers`), `FilterPanel`, `SummaryPanel`, `BottomTabs` (tables/charts), `ToolsMenu`, `ExportButtons` + `PDFPreviewModal` (PDF templates in `pdfTemplateConfig.ts`, assets in `public/pdf-assets/`), `OperatorConsole`.
- Heavy work offloaded to `src/workers/` (`dataParser.worker.ts`, `windGlow.worker.ts`). Several components were recently deleted/merged (StatsGrid, GlassStatCard, MethodologyDrawer, …) -don't resurrect them from old docs.
- Styling: Tailwind v4 (`@tailwindcss/postcss`), tokens in `utils/colorSystem.ts` / `styleConstants.ts` / `src/theme`.

### Base path
`NEXT_PUBLIC_BASE_PATH` (default `/partner2` in production, empty in dev) -always build URLs with `utils/basePath.ts` (`prependBasePath`) for fetches and static assets, or they break behind the production prefix.

## Backend: `middleware/`
Django project, now part of this repo (`middleware/` is the canonical copy; the old standalone `middleware_partner_api` clone is no longer the source of truth, so don't edit both). `manage.py`, `middleware_partner_api/{settings,urls,views,admin_site}.py`, one app per model: `country, island, region, event, event_type, hazard_type, hazard_information, hazard_tiles, cyclone_track(_type), risk_information, risk_type, risk_category, citizen_science, mailer, runners, model`. Exposes `/partner_api/...` DRF endpoints plus token auth that the Next proxy consumes.

- **Countries** have a canonical two-letter `Country.code` (unique, uppercase; migrations `country/0004`-`0005`). Look countries up with `country/lookup.py` `find_country()` (code first, then name); the importer, `model/direct_runner.py` and `runners/tc_runner.py` all use it. Migrations must run before the new code serves traffic or country requests return 500.
- **Forecast runs:** one `Event` per storm and country; each advisory is a `ModelRun` (`forecast_runs` on the event). A DB-backed queue with leases (`model/queueing.py`: `claim_next_run`, `finish_run`, `publish_run_to_event`) feeds the worker: `manage.py run_model_queue`, health via `check_runner_health` / `RunnerHeartbeat`, pipelines via `setup_tc_pipelines`. Run exactly one worker per queue.
- **RiskScape REF runs:** `runners/tc_runner.py` (platform or local backend) and `manage.py import_ref_run <folder> --country CK --title ...` for manual imports. `cyclone_track/model_input.py` serves the track in the time format RiskScape accepts. Empty model outputs are a failed run, not zero exposure. Don't change the RiskScape model itself.
- **Tests** (need Postgres; the suite creates its own test DB): `cd middleware && DJANGO_SECRET_KEY=test POSTGRES_PASSWORD=... POSTGRES_HOST=... POSTGRES_PORT=... POSTGRES_DB=... python manage.py test`, then `manage.py makemigrations --check`.
- **Run/deploy:** `docker-compose.yml` is dev-shaped (runserver, bind mount); production uses `docker-compose.prod.yml` (gunicorn, internal DB, one runner). Rollout order is in `middleware/runners/STAGING.md`; moving servers is in `docs/SERVER_MIGRATION.md`. DB dumps and `media/` are gitignored, never commit them.

## Config & deployment
- Env: copy `.env.example` → `.env.local`. Key vars: `NEXT_PUBLIC_BASE_PATH`, `PARTNER_API_*`, `TENANT_COUNTRY`, `COUNTRY_*`, `AUTH_REQUIRE_REDIS`, `REDIS_URL`, `DATABASE_URL`, `THREDDS_BASE_URL`, Sentry vars. Real `.env.{development,staging,production}` files are gitignored -never commit secrets.
- Deploy: `Dockerfile` (standalone output), `docker-compose*.yml`, `k8s/`, `terraform/`, `Jenkinsfile`, `vercel.json`, `.github/workflows/ci-cd.yml`. See `DEPLOYMENT.md`.
- Historical design/critique/fix notes and sample exports were moved to `docs/archive/`; they are context, not source of truth -prefer the code, `README.md`, `docs/`, and `QUICK_REFERENCE.md`. **Not everything left at the root is clutter:** `src/data/localDataAliases.ts` serves nine files (`cyclone-track (2).geojson`, `regional-impacts (1).geojson`, `regional-summary (1).csv`, …) from the project root through `/api/data/[filename]`, so don't move or rename them.

## Working together (humans and agents)
Read `WORKING.md` first: it names the shared working branch, what is deployed, and who is doing what.
- **One shared working branch** (named in `WORKING.md`) takes all work. Do not start a branch per task. If two agents must work at the same time, each uses its own short-lived worktree, `agent/<who>/<task>`, merges back to the working branch the same day, and deletes it. Never edit the same checkout as another session.
- **Update `WORKING.md`** when you start and when you finish: one line each. If a file looks changed by someone else, check `WORKING.md` and the file's timestamp before overwriting it.
- **CI is the gate** (`.github/workflows/ci-cd.yml`): type-check, lint, format, tests and build for the app, `makemigrations --check` and `manage.py test` for the middleware. The single check to require on `main` is `CI passed`. Run the same commands before you push; if you cannot (see `CLAUDE.md`), say so in the commit or PR and do not skip it silently.
- **Builds come from a commit**, never from a hand-made tarball: `git archive <commit>`. Record the commit next to the deployed image in `WORKING.md`.
- A change is done when it has tests, CI is green, and the PR or commit message says what was verified and what was not.

## Conventions
- Path alias `@/` → `src/`. Prettier + ESLint enforced on commit. Keep comments sparing and explain *why*.
- Country is identified by `CountryCode` (`'VU'|'WS'|'TO'|'CK'`) in code and by slug in URLs; convert with `utils/countrySlug.ts`.
- Adding a country or event: update `types/thredds.ts` (`COUNTRIES`), `countrySlug.ts`, `countryConfigs.ts`, `partnerApiService.ts` country lists, and `eventRecords.ts`; see `docs/ADDING_CYCLONE_DATA.md`.
- Commits: conventional style (`feat(scope):`, `fix(scope):`); the author is the person who commits. Do not add `Co-Authored-By` or "Generated with" attribution lines for AI tools.
