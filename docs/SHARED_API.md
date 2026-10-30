# The shared partner API (Anuj's): what it is and how to test it

`https://pacific-disaster-api.spc.int/partner_api/` is run by Anuj. It is a different, older deployment than the `middleware/` in this repo, so features that only exist here (`risk_scenario`, `forecast_runs`, `hazard_zarr`, `defer_large_assets`, most filters) are missing there. Checked 2026-10-28. Schema: `/partner_api/schema/` (YAML). Docs page: `/partner_api/docs/`. **Re-read the schema before assuming anything: he changes it.**

## How its data is shaped
```
Country
Event ── model_runs ──> ModelRun ── tc_track ──> CycloneTrack
                           ├─ risks  ──> RiskInformation   (each row also names its model_run and country)
                           └─ hazards ─> HazardInformation
```
- A `RiskInformation` row is one result file (regional impacts, exposure, damaged roads, floodplain, ...). It has `model_run` and `country`, **no event**; the event reaches it only through its runs.
- The event lists its runs as bare ids. The run (with its `risks`, `tc_track`, `hazards`) is behind a login.
- 44 older risk rows (Gita, Harold, Meena, the first Lola) have no run, so nothing connects them to an event.
- 9 `hazard_information` rows (8 WMS, 1 zarr pointer, row 10, ours); our API has about 2,200.

## What needs a login
| Public (no token) | Needs a token |
|---|---|
| `country`, `event`, `cyclone_track`, `risk_information` (list and `/{id}/`), `hazard_information` | `model_run`, `model`, and every write |

A token comes from `POST /partner_api/api-token-auth/` with a username and password and lasts about two days. Never put the password in a chat, a commit or an env file in the repo.

## Filtering: routes, not query parameters
- `event/?country=3` and `event/country/3/` work (events of one country).
- Everything else ignores filters. `risk_information` accepts only `page` and `page_size`: `country`, `model_run`, `event`, `search`, `title`, `ordering`, `fields`, `id__in` and 20 more were tried and none changes the result. `cyclone_track` and `hazard_information` ignore `?country=`.
- So a country page that asks for `risk_information` follows every page: about **112 MB** (6 pages of 11.7 MB, 2 to 7 seconds each). Our API sends the same request for one country in about 5.8 MB.

## What we need from Anuj (in this order)
Everything is event first: pick an event, follow its model runs, get each run's risk information. **Decided with Anuj: every event has at least one model run, and the run holds the risk files, track and hazards.** For a REF forecast an event's runs are its advisories. For an observed storm (Gita, Harold, Meena, the first Lola) or a planning scenario the event has one run that holds its data. The dashboard then has one path for every event, with no guessing by country.

**One flag is needed so a run is not mistaken for a forecast:** the event must say whether it is a REF forecast (`is_forecast: true/false`, or an event type that tells them apart, which is also what the `event_type` filter would be for). Without it the dashboard treats any event with runs as a forecast, and Harold would show as one. The dashboard already honours `is_forecast: false`.

**Blocks the switch**
1. **A REF forecast event returns its runs and their risk information.** Either embed each run in the event (`model_runs: [{id, name, model_run_time, model_run_completed, tc_track, risks:[ids], hazards:[ids]}]`) or add `risk_information/event/{id}/` in the style of `event/country/{id}/`. Test: `event/7/` shows `dict` entries in `model_runs`, or the route returns 73 rows.
2. **Events that are not REF forecasts get one model run each** (Gita, Harold, Meena, the first Lola, and the planning scenarios). The run's `risks`, `tc_track` and `hazards` hold their data, and the event says it is not a forecast (`is_forecast: false`). The 44 risk rows with no run are attached to these runs. The run's `model_run_time` can be the event date and `model_run_completed` true.
3. **A list of risk data without `geometry`** (the floodplain row alone is 7.8 MB). The full row stays at `risk_information/{id}/`.

**Needed as the data grows**
4. **Date filters on events and runs** (`event/?country=3&from=2026-01-01&to=...`, same on `model_run`), and `ordering` by `event_datetime`. Test: `to=2010-01-01` on `event/` returns 1 event (Meena), `from=2026-01-01` returns 1 (Wati). Today both return all 6.
5. **`?country=` on `cyclone_track` and `hazard_information`**, and `?model_run=` on `hazard_information` (they ignore it today: 51 tracks and 9 hazard rows for every country).
6. **Page size and ordering that hold up**: a stable newest-first order on lists.

**Improvements**
7. **Planning scenarios as an event, like everything else.** One event per country (e.g. "Cook Islands: planning scenarios") with one run whose `risks` are its loss tables (one file per hazard product). No `risk_scenario` tables are needed (they are 404 today; the dashboard reads the same tables from Wasabi meanwhile). This needs an event type for planning scenarios (the API does not expose event types) and a meaning for `event_datetime` on it, e.g. the analysis date.
8. **A canonical `code` on countries** (`CK`, `VU`, `TO`, `WS`). Today they are named "Cook Island", "Ton", "FJI".
9. **Correct `country` on cyclone tracks**: most Wati tracks are tagged country 1 (Fiji), not Cook Islands (3).
10. **Hazard layers**: attach the catalogue to the planning event as a `hazards` list, in stages (`hazard_information` has a `model_run` field but no event field, and runs are only for REF). He has 9 `hazard_information` rows, none tied to a run; ours has about 2,200. Until then the dashboard keeps its fixed list.

**Cleanup only he can do**
11. Remove track 220 (duplicate of 210, wrong issue time) and give risk rows 49 (Wati run 4, real data) and 23 a country: they have `country: null`, so a country filter would drop them. Do not delete 49; check the duplicate Lola events (ids 1 and 8). Rotate the API password. Keep `hazard_information` row 10 (ours, protocol `zarr`).
12. Optional fallback if he cannot change the event: public read of `GET model_run`, or a read-only account for the dashboard server.

## How the dashboard reads it (event first)
Since 30 October every event on this API has runs (REF: one per advisory; PDIE and scenarios: one), every run lists its risk rows and track, `model_run/{id}/` is public, and the event types name the kind (1 REF, 3 PDIE, 4 Scenario). So the dashboard reads it event first, with no country filter:

1. `event/?country=` and `event_type/`.
2. `model_run/{id}/` for each run of the country's events, and `cyclone_track/{id}/` for a run's track filed under another country.
3. `risk_information/{id}/` for the **shown** event's rows only. Other events' rows are read when they are shown.

It never asks for the `risk_information` listing. `prepareEventRows` in `src/utils/partnerEvents.ts` does steps 1 and 2 for both the loader and `/api/events`; it recognises this API by event rows that list `model_runs` but no `risks`, so our own API is read as before.

Measured against the live API (30 October): Cook Islands with Wati shown, 1.2 MB in 53 requests; Meena 27 MB, the first Lola 39 MB, Harold 24 MB. The observed storms are heavy because their damaged-buildings and damaged-roads rows carry full geometry (Lola's buildings row alone is 32 MB). Only a list without `geometry` (ask 3 above) fixes that, because the dashboard cannot tell which ids are heavy before reading them.

Elsewhere: scenario losses come from Wasabi (`src/utils/scenarioLosses.ts`) and flood depths from the zarr pointer row, straight from the bucket. Data to tidy: runs 4 and 9 are both the 18 Oct 12Z Wati advisory, and run 4 has no track.

## Test it yourself
```bash
B=https://pacific-disaster-api.spc.int/partner_api/v1

# events of one country: works, should say 2 (Cook Islands: Wati and Meena)
curl -s "$B/event/country/3/" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['results'] if isinstance(d,dict) else d))"

# one page of risk data: ignores the country, about 11.7 MB
curl -s -o /dev/null -w "%{size_download} bytes, %{time_total}s\n" "$B/risk_information/?country=3"

# a model run, public since 30 October: its risk ids and track
curl -s "$B/model_run/11/"

# one risk row on its own, public and small
curl -s -o /dev/null -w "%{http_code} %{size_download} bytes\n" "$B/risk_information/114/"

# event types: 1 REF, 3 PDIE, 4 Scenario
curl -s "$B/event_type/"
```

## Switching production to this API
The dashboard can now read this API without the 112 MB listing (see above); observed storms stay slow (24-39 MB) until there is a list without geometry. To switch, set `PARTNER_API_BASE_URL=https://pacific-disaster-api.spc.int` in `docker-compose.prod.yml`, redeploy, and check one country page in the browser's Network tab: no request should be larger than a few MB.
