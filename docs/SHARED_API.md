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

## What we asked Anuj for (in this order)
1. Put the runs inside the event, with their `risks` ids: `model_runs: [{id, name, model_run_time, model_run_completed, tc_track, risks:[...], hazards:[...]}]` (or make `GET model_run` public). Then the dashboard fetches only the chosen advisory's rows (`risk_information/{id}/`, about 0.65 MB for 9 rows) and needs no filters.
2. A run filter on risk data in his route style (`risk_information/model_run/{id}/`).
3. A way to reach the 44 runless rows: attach them to runs, or give the event a `risks` list.
4. A list without geometry (the floodplain row alone is 8.3 MB).
5. A home for `risk_scenario`. Until then the dashboard reads the Cook Islands loss tables from Wasabi (`scenario_losses/v1`, see `HAZARD_CATALOG_ZARR.md`).
6. Cleanup only he can do: track 220 (duplicate of 210, wrong time), stray risk rows 49 and 23, rotate the API password.

## What the dashboard does about it today
- `src/utils/partnerEvents.ts` `expandEventModelRuns`: one advisory per run from the risk rows' `model_run` and the time stamp in their titles, and the track from that stamp.
- `src/utils/scenarioLosses.ts`: scenario losses from Wasabi when the API has no `risk_scenario`.
- Flood depths come from the zarr pointer row, straight from the bucket.
- It is **not** pointed at this API in production (`PARTNER_API_BASE_URL` is `https://opmthredds.gem.spc.int`), because of the 112 MB page.

## Test it yourself
```bash
B=https://pacific-disaster-api.spc.int/partner_api/v1

# events of one country: works, should say 2 (Cook Islands: Wati and Meena)
curl -s "$B/event/country/3/" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['results'] if isinstance(d,dict) else d))"

# one page of risk data: ignores the country, about 11.7 MB
curl -s -o /dev/null -w "%{size_download} bytes, %{time_total}s\n" "$B/risk_information/?country=3"

# the model run page is locked: 403 without a token
curl -s -o /dev/null -w "%{http_code}\n" "$B/model_run/11/"

# one risk row on its own, public and small
curl -s -o /dev/null -w "%{http_code} %{size_download} bytes\n" "$B/risk_information/114/"

# has he embedded the runs yet? prints "int" now, "dict" once he has
curl -s "$B/event/7/" | python3 -c "import json,sys;print(type(json.load(sys.stdin)['model_runs'][0]).__name__)"
```
With a token (`TOKEN=...`): `curl -s -H "Authorization: Token $TOKEN" "$B/model_run/11/"` gives the run's `tc_track` (214) and its risk ids.

## Switching production to this API
Do it only when `risk_information` can be read per run or event (ask 1 or 2 above). Then set `PARTNER_API_BASE_URL=https://pacific-disaster-api.spc.int` in `docker-compose.prod.yml`, redeploy, and check one country page in the browser's Network tab: no request should be larger than a few MB.
