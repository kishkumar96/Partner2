# Troubleshooting

## The app will not start

| Symptom | Cause | Fix |
|---|---|---|
| `Security config validation failed: COUNTRY_AUTH_SECRET is required…` | `COUNTRY_PUBLIC_COUNTRIES` is set, so some countries are protected, and the secret or a password is missing | set `COUNTRY_AUTH_SECRET` (32+ chars) and each `COUNTRY_PASSWORD_<CC>`, or unset `COUNTRY_PUBLIC_COUNTRIES` |
| `REDIS_URL is required for production…` | `NODE_ENV=production` without Redis | set `REDIS_URL`, or `AUTH_REQUIRE_REDIS=false` (as on the SPC server) |
| `TENANT_COUNTRY must be a valid country code or slug` | typo | `CK` or `cook-islands` |
| build fails at `config:check` | `config/` changed without regenerating | `npm run config:generate`, then commit the generated files |
| Node version errors | wrong Node | `nvm use` (20.19.6) |

## A page loads but shows no data

1. **Which source?** The page's footer line reads `Source: Track: … | Event: … | Risk: … | Hazards: …`, each Partner API or Local Files. If it says local files, check `NEXT_PUBLIC_ENABLE_PARTNER_API` **in the build** (it is baked in) and the country lists.
2. **Network tab.** Requests should go to `/partner2/api/partner-proxy/partner_api/v1/...`. A 404 at the domain root (`/api/...` without `/partner2`) is a missing `prependBasePath`.
3. **Does the API have it?** `curl -s https://pacific-disaster-api.spc.int/partner_api/v1/event/country/<id>/`. The country id differs per deployment (Cook Islands is 3 on the shared API).
4. **Is the file recognised?** A risk row whose title or file name matches nothing in `inferLogicalDatasetTypeFromFilename` is silently unused ([Model outputs](Model-Outputs.md)).
5. **Strict country.** A country in `*_STRICT_COUNTRIES` never falls back to local files, so an API gap shows as empty.

## Forecast oddities

| Symptom | Likely cause |
|---|---|
| The same advisory time listed twice; the newest missing | a run on the API has the wrong name or `model_run_time` (Wati run 4: 19 Oct 12Z data labelled 18 Oct 12Z). Fix on the API |
| An advisory with "no exposure" | the model could not read the track. It should be a failed run; check `model_input` times |
| A storm filed under the wrong country | the track's country on the API is wrong. Runs pick the country from `total-exposed-by-country.csv` |
| Facility wind "89 km/h" | old build; current builds show the band range (89–117 km/h) |

## Post-disaster (PDIE) oddities

| Symptom | Likely cause |
|---|---|
| Sector table empty for a new event | the bundle was not passed through `withLegacyImpactNames`, or the area file is missing |
| Roads in the wrong place, or the map jumps to (0,0) | a GeoPackage in EPSG:3857 or 3832 uploaded without reprojection; the API must store lon/lat |
| Regional max wind, the band below 83 km/h or the building's area are empty | not in the 2026 output files; expected |
| A Lola, Harold or Meena page is slow (24–39 MB) | damaged-asset rows carry full geometry on the shared API; needs a list without geometry |

## Map and hazard layers

- **Blank WMS tiles.** THREDDS is slow or down. The proxy retries 3 times with a 30 s timeout. `npm run warm:thredds` warms the cache before a demo.
- **Flood depths missing.** Check the zarr pointer row on the API and the bucket's CORS. `NEXT_PUBLIC_HAZARD_ZARR_DIRECT=false` falls back to server-drawn tiles. See [`docs/HAZARD_CATALOG_ZARR.md`](../HAZARD_CATALOG_ZARR.md).
- **A layer drawn above or below the wrong one.** It is missing from `LAYER_ORDER` (`utils/layerOrder.ts`).

## Deploys

See [Deployment → Common mistakes](Deployment.md#shipping-a-new-dashboard-build-the-spc-server). Most of them are: the wrong folder in PowerShell, the build step skipped, or switching to an old image still on the server.

## Middleware

| Symptom | Cause |
|---|---|
| every country request returns 500 after a deploy | migrations not run (`Country.code`) |
| runs stay queued | no worker, or the worker's `--server-name` does not match the model's `server_name`; run `check_runner_health` |
| two workers fighting over runs | run exactly one per queue |
| tests fail on a read-only checkout | copy the code to a writable folder; use a throwaway Postgres |
