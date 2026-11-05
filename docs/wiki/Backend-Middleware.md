# Backend (middleware)

`middleware/` is a Django REST Framework project: our copy of the Partner API plus the RiskScape model runners. It is the **canonical copy**: the old standalone `middleware_partner_api` checkout is not the source of truth, so don't edit both.

> **The live dashboard does not read this API.** It reads the shared API at `pacific-disaster-api.spc.int`, which is an older deployment of the same design (see [Data sources](Data-Sources-and-Loading.md#the-two-partner-apis)). Features added here reach users only when Anuj's deployment adopts them, or if production is ever pointed here.

## Apps

One Django app per model:

| App | Holds |
|---|---|
| `country` | `Country` with a unique, uppercase two-letter `code`; look up with `country/lookup.py` `find_country()` (code first, then name) |
| `island`, `region` | geography |
| `event`, `event_type` | events; `forecast_runs` on an event are its advisories |
| `cyclone_track`, `cyclone_track_type` | SPC tracks; `model_input.py` serves a track with ISO-UTC times for RiskScape |
| `model` | `Model`, `ModelRun`, `ModelTrigger`, `ModelLogs`, `RunnerHeartbeat`; the queue (`queueing.py`); import (`views_import.py`, `ingest_service.py`); operator API |
| `risk_information`, `risk_type`, `risk_category` | result files, `RiskScenario` rows (scenario losses by SLR and return period) |
| `hazard_information`, `hazard_type`, `hazard_tiles` | hazard layer catalogue, zarr pass-through and tiles |
| `citizen_science` | community reports |
| `mailer` | alert recipients and mail configurations |
| `runners/` | `tc_runner.py`, `fetch_run.py`, `push_outputs.sh`, `server_report.sh` (not a Django app) |

## Endpoints (`middleware_partner_api/urls.py`)

All endpoints are under `/partner_api/`. `admin/` is the Django admin and `api-token-auth/` issues tokens. The shared API also serves `schema/` and `docs/`; this copy does not.

| Path (`v1/`) | Use |
|---|---|
| `country/`, `event/`, `cyclone_track/`, `risk_information/`, `hazard_information/`, `citizen_science/` | list/create and `<id>/` detail |
| `cyclone_track/<id>/model_input/` | the track in the time format RiskScape accepts |
| `risk_scenario/`, `risk_scenario_breakdown/` | scenario loss rows (not on the shared API) |
| `hazard_zarr/<key>` | zarr store pass-through |
| `model_run/`, `model_run/claim/`, `model_run/<id>/finish/`, `model_run/heartbeat/`, `model_run/operations/` | the run queue, used by runners |
| `model_run/import/` | upload a finished RiskScape run (used by `push_outputs.sh`) |
| `operator/me/`, `operator/pipelines/`, `operator/tracks/`, `operator/runs/` | operator console, superuser only |
| `mailer/recipients/`, `mailer/configurations/[<id>/send/]` | alerting |

`risk_information` accepts `defer_large_assets`, so big building and road maps are stored without inline geometry. The markers for this are in `risk_information/serializers.py`, `LARGE_ASSET_UPLOAD_MARKERS`. GeoPackages are reprojected to lon/lat on upload (`risk_information/utils.py`).

## Run it locally

```bash
cd middleware
cp .env.example .env        # set DJANGO_SECRET_KEY and the POSTGRES_* values
docker compose up -d        # web (runserver, bind mount) on ${DJANGO_LOCAL_PORT:-8000}, db, nginx, runner
docker compose exec web python manage.py migrate
docker compose exec web python manage.py createsuperuser
```

Settings come from the environment: `DJANGO_SECRET_KEY`, `POSTGRES_*` / `POSTGRESDB_*`, `DJANGO_DB_HOST/PORT`, `HAZARD_CATALOG_STORE`, `HAZARD_CATALOG_CACHE_DIR`, `HAZARD_ZARR_CACHE_SECONDS`, `MAIL_CONFIG_ENCRYPTION_KEY`, `MAILER_DEFAULT_CONFIGURATION_NAME` and `RUNNER_ALERT_EMAILS`. The runner also needs `RISKSCAPE_TOKEN` and `PARTNER_API_URL`. Point the dashboard at it with `PARTNER_API_BASE_URL=http://localhost:8000`.

`docker-compose.yml` is dev-shaped. `docker-compose.prod.yml` runs gunicorn, an internal DB, one runner and nginx on `${NGINX_PORT:-8089}`.

## Tests

Tests need Postgres. The suite creates its own test database.

```bash
cd middleware
DJANGO_SECRET_KEY=test POSTGRES_PASSWORD=... POSTGRES_HOST=... POSTGRES_PORT=... POSTGRES_DB=... \
  python manage.py test
python manage.py makemigrations --check     # no model change without a migration
```

A throwaway database works: `docker run -d --name pg-test -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:14`, then `POSTGRES_HOST=localhost POSTGRES_PORT=55432`. Remove it afterwards.

## Management commands

| Command | Does |
|---|---|
| `run_model_queue --server-name riskscape.nz [--once]` | the worker: claims queued runs, runs them, uploads, publishes. Run **exactly one** per queue |
| `check_runner_health [--email]` | exit 1 and a report if the worker's heartbeat is stale |
| `setup_tc_pipelines [--create-track-types]` | create or update the rapid (REF) and pdna (PDIE) pipelines |
| `import_ref_run <folder> --country CK --title ...` | import a REF run folder by hand |
| `ingest_riskscape_run` | ingest a run from the RiskScape platform |
| `import_{ck_meena,to_harold,vu_lola,ws_gita}_event` | load the historical observed events |
| `import_ck_risk_information`, `import_ck_risk_scenarios`, `import_legacy_risk_information` | load risk files and scenarios |
| `publish_scenario_losses [--replace]` | write scenario loss tables to Wasabi (rerun after importing scenarios) |
| `populate_hazard_catalog`, `publish_hazard_catalog`, `import_{fluvial,slr,legacy}_hazard_information` | hazard catalogue |

## Rules

- **Migrations before code.** The code reads `Country.code`, so migrate before the new web image serves traffic, or every country request returns 500. The full order is in [`runners/STAGING.md`](../../middleware/runners/STAGING.md).
- **Never commit** DB dumps, `media/`, `.env`, the RiskScape token or the API password.
- **Don't change the RiskScape model itself.** Adapt its inputs (`model_input`) and outputs (the runner and import code).
- Server moves: [`docs/SERVER_MIGRATION.md`](../SERVER_MIGRATION.md). A read-only state report of the server: `bash middleware/runners/server_report.sh`.
