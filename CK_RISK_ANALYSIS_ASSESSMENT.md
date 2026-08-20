# Cook Islands risk-analysis integration assessment

> Scope note: this document was originally scoped to `risk_analysis` only. It
> now also includes the hazard-layer (`hazard_catalog_for_risk`) action items
> from the same investigation, since the two are not independently
> deployable — see "Complete action list" at the end.

## Summary

The Cook Islands risk output exists under `CK\\risk_analysis` and maps closely to
the hazard-catalog categories previously identified. It is a richer,
multi-scenario product than the flat, single-scenario CSV inputs currently
consumed by PARTneR2.

It therefore cannot be connected through the existing CSV normalizer as a
drop-in dataset. Integrating it requires either a deliberate lossy transform or
dashboard work that makes the scenario dimensions first-class.

## Available outputs

| Folder | Corresponding hazard group | Contents |
| --- | --- | --- |
| `HistTC` | `historical_TCs` | Per-event impact: 17 storms × 4 SLR scenarios |
| `SynTC` | `synthetic_TCs` | Per-event impact: 367 storms × 4 SLR scenarios |
| `Swell` | `swell_driven` | Per-event impact: 774 swell events × 4 SLR scenarios |
| `Prob_TC_AAL` | `ProbabilisticMaps_Raro_out/tc` | Return-period loss and annual average loss (AAL) |
| `Prob_swell_AAL` | `ProbabilisticMaps_Raro_out/swell` | Return-period loss and AAL |
| `Prob_combo_AAL` | `ProbabilisticMaps_Raro_out/combined` | Return-period loss and AAL |

Event and probabilistic folders contain:

- `impact-asset-type.csv`: impact by asset use type, including exposed count/value, loss, and average/maximum inundation depth.
- `impact-asset-sector.csv`: impact aggregated by sector, such as residential buildings, ports, roads, and crops.
- `national-impact.csv`: national totals.
- Probabilistic outputs additionally include `aal_by_sector.csv` and `national-average-loss.csv`.

The README identifies the exposure source as PCRAFI/PARTneR asset data. It also
states that the depth-damage curves are RiskScape placeholders pending NIWA
curves, so these results must be presented as provisional until that status is
resolved.

## PARTneR2 schema gap

`src/utils/csvDataNormalizer.ts` expects flat, single-scenario inputs with
columns such as:

```text
Total_Population, Population_Exposed_To_Any_Hazard, Total_Value, Total_Loss,
Total_Exposed_Value_To_Any_Hazard, Damaged_Buildings, Total_Buildings,
Region, Region_ID, Sector, Total_Wind_Loss, Total_Fluvial_Loss, Total_Coastal_Loss
```

The Cook Islands output is instead dimensional, with fields such as:

```text
SLR, Return_Period/Event, Exposed.Building_Value, Loss.Total, Loss.Building_Loss
```

Key incompatibilities:

1. **Geography:** the available output is Rarotonga national-level; the current dashboard expects regional/island rows.
2. **Metrics:** it has no population-exposure metric or wind/fluvial/coastal loss split. It represents coastal inundation risk.
3. **Scenario selection:** SLR and return period/event are core data dimensions; the current loader has no model for them.
4. **Naming:** file names differ, for example `impact-asset-type.csv` rather than `impact-by-asset-type.csv`, and `national-impact.csv` rather than `national-summary.csv`.

## Middleware schema gap

The frontend gap is not the only one. `middleware_partner_api`'s `RiskInformation`
model (`risk_information/serializers.py`) has the same problem one layer down:
it is a thin pointer record, not a data store.

```text
id, title, risk_category, upload, geometry, geometry_computed,
created_at, country, event_type, model_run
```

`upload` is a single file reference per row, and there is no field for SLR
scenario, return period/event, or any loss metric (Total, Building_Loss,
etc.). This mirrors the `HazardInformation` gap identified earlier for hazard
layers: the schema is built to catalog one uploaded product per row against
country/event_type/model_run, not to store a dimensional (SLR x
return-period/event) result set with per-scenario loss figures.

Practically, this means the Cook Islands risk output cannot be exposed through
the existing middleware API at all yet, regardless of what the frontend does
with it. Either `RiskInformation` needs new first-class fields (e.g. `slr_scenario`,
`return_period`), or a child table (e.g. `RiskScenario`, one row per
SLR x return-period/event combination, foreign-keyed to `RiskInformation` or
`Event`) needs to be introduced to hold the loss figures currently sitting in
`impact-asset-type.csv` / `impact-asset-sector.csv` / `national-impact.csv`.

## Recommended integration direction

Prefer native support for scenario selection (SLR and return period/event) over
collapsing the dataset into the existing flat schema. That preserves the value
of the Cook Islands product and allows the dashboard to present AAL alongside
return-period loss.

This is a four-layer change, not a frontend-only one:

1. **Middleware schema** — add SLR/return-period fields (or a child table) to
   `RiskInformation` so a scenario result set can be stored at all.
2. **Middleware API** — expose the new dimensions so a client can request or
   filter by SLR/return-period.
3. **Frontend data layer** — extend `csvDataNormalizer.ts` (or its
   partner-API equivalent) to consume dimensional data instead of a single
   flat row.
4. **Frontend UI** — add SLR/return-period selection controls to the
   dashboard, since there is currently no control for either dimension.

A compatibility transform (collapsing to one flat row per dataset) is possible
for a limited initial release without touching the middleware schema, but it
must explicitly choose an SLR scenario and event/return-period and disclose the
lost dimensions. It will not create missing regional or population metrics,
and it still requires *some* way to get the chosen row out of `RiskInformation.upload`
(e.g. treating the upload as an opaque file the frontend parses directly, bypassing
structured API fields) rather than a real fix.

## Live verification (this session)

Two items below were checked directly against the real THREDDS server and the
live Partner2 deployment rather than inferred from local files.

**CF-compliant georeferencing is not required.** Fetched
`GetCapabilities` directly from `gemthreddshpc.spc.int` for Samoa's
`WS_merged.nc` (same SFINCS pipeline/format as CK's output) — it returns valid
XML with correct CRS support (EPSG:4326, EPSG:3857, CRS:84) and the correct
Samoa bounding box. The THREDDS `catalog.xml` for that dataset is a plain
reference catalog: no NcML wrapping, no `addAttribute`, no CRS override. ncWMS
is serving this exact file format correctly today with unmodified source
files, despite the raw `.nc` having unset `epsg`/`utmzone` attributes (as
CK's do). CK's files should work the same way once published — no source-file
georeferencing fix needed. Action item A1 has been removed accordingly.

**The Partner2 → THREDDS proxy is currently 404ing in production**, for
countries already live. A captured HAR showed every WMS `GetMap` request
through `/api/partner-proxy/thredds/wms/...` returning 404 for Samoa's
`WS_merged.nc`, while the same request against `gemthreddshpc.spc.int`
directly succeeds. Re-tested live against `opmthredds.gem.spc.int` — still
404. The proxy route code (`src/app/api/partner-proxy/[...path]/route.ts`)
correctly dispatches `thredds/`-prefixed paths to `THREDDS_BASE`, so this
looks like a deployment/infra issue (misconfigured `THREDDS_BASE_URL`, or a
reverse proxy in front of Next.js not forwarding this path) rather than an
application bug. This is orthogonal to Cook Islands — it currently blocks the
hazard WMS layer for VU/WS/TO too — but it sits on the exact code path any CK
layer would use, and it's worth escalating on its own, sooner, since it's
likely a cheap config fix rather than a data problem.

**Follow-up (this session): narrowed to a specific, testable root cause —
`opmthredds.gem.spc.int` is very likely the wrong upstream host.** Re-verified
end-to-end from scratch:

- Every layer's exact WMS URL (dataset path, real `ncFile` name, `SERVICE=WMS`
  params) resolves with `200` when requested directly against
  `gemthreddshpc.spc.int` — confirmed for VU (`vu_hazard/TC/Lola/_merged.nc`),
  WS (`ws_hazard/TC/Gita`), TO (`Harold_TO`), and CK's `ck_hazard/TC/Meena`
  pilot, via both `GetCapabilities` and a full `GetMap` tile request.
- A **local production-mode build** (`docker-compose.prod.yml`, `output:
  standalone`, real `/partner2` basePath, port 3112) proxying to the code's
  default `THREDDS_BASE` (`gemthreddshpc.spc.int`, since `THREDDS_BASE_URL`
  isn't set in any committed `.env*` file) returns clean `200`s for every
  `partner-proxy/thredds/wms/...` `GetMap` request in `localhost.har` — the
  identical code path works when pointed at the right host.
- `opmthredds.gem.spc.int`, by contrast, serves `/thredds/catalog.xml` with
  the **same root branding** (`name="Pacific Ocean Portal THREDDS Server"`,
  same `catalogRef` to `/thredds/catalog/POP/catalog.xml`) — but
  `POP/Partner2/...` 404s under it at every level (catalog listing, WMS
  `GetCapabilities`, WMS `GetMap`), for VU/WS/TO/CK alike. Both hostnames
  resolve to the same Cloudflare anycast IPs, so this isn't a DNS typo — it's
  either a different origin behind the same Cloudflare account, or a
  Cloudflare-level routing/path rule that only serves this data under one of
  the two hostnames.

Net: the app's own code, dataset paths, and default `THREDDS_BASE` are all
correct and already proven to work. If the live deployment's actual
`THREDDS_BASE_URL` (set via prod secrets/environment, not visible in this
repo) is `opmthredds.gem.spc.int` instead of `gemthreddshpc.spc.int`, that
alone fully reproduces the reported 404s with no other explanation needed.
**Next step is simply to check what `THREDDS_BASE_URL` is actually set to on
the live server** — that requires access to the production environment/infra
config that this session didn't have. If it does turn out to be
`opmthredds.gem.spc.int` (or unset with a stale non-default fallback), the
fix is a one-line env var correction, not a code or reverse-proxy change.

**A plausible mechanism for the mix-up, and where to actually check it:**
`k8s/configmap.yaml` (tracked in this repo) sets
`NEXT_PUBLIC_APP_URL: "https://opmthredds.gem.spc.int/partner2"` — i.e. the
Partner2 app's own public URL is hosted *on* `opmthredds.gem.spc.int`. That
name reads exactly like "the THREDDS host," which makes it an easy, plausible
copy-paste/naming mistake for whoever set `THREDDS_BASE_URL` server-side to
have pointed it at the app's own domain instead of the actual data host
(`gemthreddshpc.spc.int`). However, **`.github/workflows/ci-cd.yml`'s `deploy`
job actually ships to Vercel** (`amondnet/vercel-action`), not to the
`k8s/*.yaml` manifests — so the k8s files may be a stale/parallel deployment
path, and the real `THREDDS_BASE_URL` (if set at all) most likely lives in
the **Vercel project's environment variables**, not in anything committed
here. Neither is accessible from this session — check Vercel's project
settings (Production environment) for a `THREDDS_BASE_URL` entry first; if
one exists and isn't exactly `https://gemthreddshpc.spc.int`, that's almost
certainly the fix. If the k8s path turns out to be the real one instead,
check for a `THREDDS_BASE_URL` key applied directly to the cluster (e.g. via
`kubectl set env` or an untracked Secret) rather than in `configmap.yaml`,
since it isn't in either tracked k8s manifest today.

**`gemthreddshpc.spc.int` is SPC's Pacific Ocean Portal (POP) THREDDS
instance, and a `ck_hazard` folder already exists on it** —
`POP/Partner2/case_study2/hazard/ck_hazard/TC/Meena`, confirmed by browsing
the live catalog. It contains only the single pilot event already hardcoded
into `realThreddsLayers.ts` (`ck-tc-meena-*`). None of the fuller
`hazard_catalog_for_risk` catalog (1,158 historical/synthetic/swell events,
72 probabilistic rasters) has been published. This means "who administers
the server" is no longer an open unknown — someone already had write access
and used it to push the Meena pilot — so B1 below is really "extend the
existing Meena publishing pathway," not "start an access request from
scratch."

**The Meena pilot's frontend commits trace to a known author, not an
unknown third party.** `git log` on Partner2 shows the commits that added
the `ck-tc-meena-*` layers (`80beafa`, 2026-03-17), reorganized country data
into subdirectories (`f7c0d6c`, 2026-03-04), and fixed related 404s
(`423b86b`, 2026-03-04 — a *different*, already-resolved static-asset 404,
not the live THREDDS-proxy 404 found above) were all authored by
`kishkumar96 <kishan2196@gmail.com>`.

**Publishing access is confirmed and already in hand — no third party
involved.** The repo owner has key-based SSH access to the THREDDS host
(`lotgemhpcdmz01`) and SCPs files directly into the content root at
`/data/ocean_portal/datasets/Partner2/`, which contains `case_study2` (the
`POP/Partner2/case_study2/...` tree the catalog serves), plus a separate
`COK_TC_Meena` folder, `SLR`, and `test`. THREDDS itself runs as Docker on
that host (`/data/thredds/thredds-docker`). A `createFolder.sh` script exists
in `/data/thredds/` but is confirmed **unrelated** — it's a one-time
base-skeleton installer for a fixed `bom/nasa/noaa/csiro/copernicus/spc` x
`hindcast/forecast/nrt` x `hourly/daily/monthly/yearly` taxonomy; `Partner2`
isn't one of its categories and it only does `mkdir -p`, no catalog.xml
generation. Combined with the earlier finding that `ck_hazard/TC/Meena`'s
catalog.xml is a plain reference catalog with no manual entries, this
suggests THREDDS is configured with a `datasetScan` (auto-discovery) element
over the `Partner2` tree — **confirmed**:
`/data/thredds/thredds-docker/files/catalog.xml` contains
`<datasetScan name="Pacific Ocean Portal" ID="POPdata" path="POP"
location="/usr/local/data">`. Any file placed under that location is
auto-discovered and served — publishing the full `hazard_catalog_for_risk`
catalog genuinely is "SCP into the right folder structure," with **no
catalog-generation scripting needed at all**.

`COK_TC_Meena` is confirmed to be raw/working output, not a stale
duplicate: `diff -rq` against `case_study2/hazard/ck_hazard/TC/Meena` shows
completely different contents — `COK_TC_Meena` holds subfolders
(`CK_merged_output`, `CK_north_Meena`, `CK_south_Meena`) that look like raw
per-subdomain SFINCS output, while the served location holds the final,
flattened, single-variable artifacts (`CK_merged.nc`, `_merged.nc`/`.tif`,
subdomain wind `.nc`/`.tif` pairs, track CSVs). This is a two-stage
pipeline — raw output lands somewhere like `COK_TC_Meena`, gets merged/
derived, and the result gets placed into `case_study2/hazard/ck_hazard/TC/
<event>/` where THREDDS serves it — and it means there's already a working,
reusable process for item A2 ("produce a clean single-variable NetCDF per
event"); it doesn't need to be built from scratch. The server also has a `/data/sfincs_output` directory, which may
be where the SFINCS runs producing this hazard data actually execute — worth
checking whether the "produce a clean, single-variable derived NetCDF"
step (A2 below) could run there directly rather than as a separate local
post-processing step.

**`catalog_for_Judith_v2` is confirmed to be the same underlying dataset as
`hazard_catalog_for_risk`, reorganized.** It contains matching filenames
(e.g. `historical_TCs/01-Mar-1987.nc`, the same stray `Thumbs.db`,
`swell_driven/01-Aug-1980.nc`) under SLR-scenario-first folders
(`current_sea_level/`, `slr_25cm/`, `slr_100cm/`) plus a
`ProbabilisticMaps_Raro/` folder, versus `hazard_catalog_for_risk`'s
event-type-first layout (`historical_TCs/000/`, `.../025/`, etc.) with
`ProbabilisticMaps_Raro_out/`. Same data, different organizing axis — almost
certainly an earlier delivery package that was later reorganized. A
`catalog_for_Judith` (v1, no suffix) folder also exists alongside it but
appears empty or inaccessible from this scan; not investigated further since
v2 already resolves the naming question.

## Validation before publication

1. ~~Confirm whether `CK\\catalog_for_Judith_v2` cited by the analysis README
   is the same hazard version as `hazard_catalog_for_risk`~~ — confirmed same
   dataset, reorganized. See "Live verification" above.
2. Confirm ownership and readiness of the depth-damage curves with NIWA.
3. Trace the source rows used for each headline AAL and return-period value.
4. Document the geographic scope precisely as Rarotonga national total unless
   subnational outputs are supplied.

## Complete action list (hazard + risk)

Nothing below is done yet. Grouped by layer, roughly in dependency order —
later groups depend on earlier ones being in place.

### A. Hazard data preparation (`hazard_catalog_for_risk`)

- [x] ~~Add CF-compliant georeferencing to the SFINCS `.nc` outputs~~ — checked
      live against `gemthreddshpc.spc.int`; not required. See "Live
      verification" above.
- [ ] Produce a clean, single-variable (`hmax`/`Depth`) derived NetCDF per event
      rather than publishing the full multi-variable SFINCS output as-is —
      a working process for this already exists (see B's `COK_TC_Meena` →
      `_merged.nc` finding above); reuse it rather than building new.
- [ ] Mask the ~19,000 out-of-range cells (~3.68e19, not the declared -9999
      NoData) found in `ProbabilisticMaps_Raro_out/combined` rasters.
- [x] ~~Resolve the `catalog_for_Judith_v2` vs `hazard_catalog_for_risk`
      naming discrepancy~~ — confirmed same underlying dataset, reorganized
      (SLR-first vs event-type-first folder layout). See "Live verification"
      above. `hazard_catalog_for_risk`, being the more recently modified of
      the two, is the one to treat as current.

### B. THREDDS/ncWMS publishing (hazard)

- [x] ~~Identify who administers `gemthreddshpc.spc.int`~~ — it's SPC's
      Pacific Ocean Portal (POP) instance. A `ck_hazard/TC/Meena` folder
      already exists there (the pilot event only). See "Live verification"
      above.
- [x] ~~Find who/what pushed the existing `ck_hazard/TC/Meena` content~~ —
      confirmed: key-based SSH + SCP directly to `/data/ocean_portal/datasets/Partner2/`
      on `lotgemhpcdmz01`, no third party involved. See "Live verification"
      above.
- [x] ~~Check whether `createFolder.sh` already covers catalog/folder
      generation~~ — confirmed unrelated (generic base-skeleton installer,
      doesn't touch `Partner2` or generate catalog.xml). See "Live
      verification" above.
- [x] ~~Confirm THREDDS is actually running a `datasetScan` over
      `POP/Partner2`~~ — confirmed via `catalog.xml`:
      `<datasetScan ... path="POP" location="/usr/local/data">`. Publishing
      is SCP only, no catalog scripting needed. See "Live verification"
      above.
- [x] ~~Clarify whether `Partner2/COK_TC_Meena` is a staging location or a
      stale duplicate~~ — confirmed raw/working output (different contents
      via `diff -rq`), not a duplicate. See "Live verification" above.
- [ ] Find or recreate the process that turned `COK_TC_Meena`'s raw SFINCS
      output into the final `_merged.nc`/`CK_merged.nc` files published
      under `case_study2/hazard/ck_hazard/TC/Meena` — reuse it for the full
      catalog instead of building a new merge/derive step from scratch.
- [ ] Confirm the ncWMS palettes already referenced in `WMS_STYLES`
      (`anuj`, `anuj6`, `anuj11`, `anuj12`, `converge`, etc.) are installed on
      the target server, or add new ones as needed.
- [x] Validate real `GetCapabilities`/`GetMap` requests directly against
      `gemthreddshpc.spc.int` — confirmed working for the existing SFINCS
      output format. See "Live verification" above.
- [ ] **New, urgent, and independent of CK:** fix the `partner-proxy` →
      THREDDS route, which is 404ing in production right now for VU/WS/TO's
      existing WMS layers (confirmed live). Check `THREDDS_BASE_URL` and any
      reverse-proxy rules in front of the Next.js app. This blocks validating
      `buildWMSTileUrl`/`buildWMSImageUrl` output end-to-end through Partner2
      itself, and should be fixed before CK's layers are wired in on top of
      the same broken path.

### C. Middleware schema — hazard side

- [x] Add Cook Islands to the country table — data migration drafted:
      `country/migrations/0003_seed_cook_islands.py` (bounding box derived
      from the two CK SFINCS subdomains already in `realThreddsLayers.ts`).
      **Not yet applied to any database.**
- [x] Extend the schema to represent hazard source (TC / swell / combined),
      SLR scenario, and return period — drafted as a new `HazardSource`
      lookup (`hazard_type/models.py` + migrations `0004`/`0005`, seeded
      with Tropical Cyclone/Swell/Combined) plus `hazard_source`,
      `slr_scenario_m`, `return_period_years`, `event_label` fields directly
      on `HazardInformation` (migration `0008`) — one row still equals one
      published WMS layer, now taggable/filterable by scenario. Serializer
      and `filterset_fields` updated so the API can filter by these
      dimensions. **Not yet applied to any database; not yet reviewed.**
- [ ] Script `HazardInformation` row generation from the THREDDS catalog once
      B's publishing step is done (not hand-enterable at this volume).

### D. Middleware schema — risk side

- [x] Extend `RiskInformation` with a child table for SLR scenario, return
      period/event, and loss metrics — drafted as `RiskScenario`
      (`risk_information/models.py` + migration `0009`), scoped to
      national-level figures (mirrors `national-impact.csv` /
      `national-average-loss.csv`); sector/asset-type granularity
      deliberately left out of scope, to be added as a further child table
      if/when needed rather than guessed at now. **Not yet applied to any
      database; not yet reviewed.**
- [x] Expose the new fields through the middleware API — `RiskScenarioSerializer`,
      list/retrieve views, `filterset_fields`, and
      `partner_api/v1/risk_scenario/` URL routes drafted. **Not yet
      deployed.**

### E. Frontend — hazard side

- [ ] Add SLR/return-period selection to `FilterState` and the filter panel
      UI (no such control exists today).
- [ ] Extend `HAZARD_ID_TO_LAYER_TYPE` and the layer-matching logic in
      `RealDataLayers.tsx` to filter on the new dimensions.
- [ ] Move the CK layer catalog from hardcoded entries in
      `realThreddsLayers.ts` to data driven by the middleware/partner API —
      hardcoding doesn't scale to this catalog size.
- [ ] Extend `UnifiedMapLegend.tsx` to show scenario metadata (return period,
      SLR, hazard source) instead of just an event name.
- [ ] Decide the UX split between "event view" (single storm) and "planning
      view" (return-period/SLR probabilistic maps) — likely different controls.

### F. Frontend — risk side

- [ ] Extend `csvDataNormalizer.ts` (or a partner-API equivalent) to consume
      dimensional (SLR x return-period) data instead of one flat row.
- [ ] Add SLR/return-period selection controls to the risk dashboard.

### G. Methodology/data caveats to resolve before going live

- [ ] Confirm depth-damage curves are finalized by NIWA (README states they
      are RiskScape placeholders today).
- [ ] Decide whether Rarotonga national-total-only risk output (no
      regional/island breakdown) is acceptable, or subnational figures are
      required.
- [ ] Confirm wind hazard is genuinely out of scope for CK — this catalog is
      inundation-only; no wind rasters exist in it.
- [ ] Confirm the `combined` = pixelwise `max(tc, swell)` compositing method
      (not a joint/correlated compound-event simulation) is methodologically
      acceptable for how the results will be presented/labeled.

Nine items are done (see "Live verification" above); everything else is not
started. A/B/C are prerequisites for any hazard layer appearing in Partner2 at
all; D is a prerequisite for any risk data being API-accessible; E and F are
the visible frontend work and depend on their respective backend groups being
done first. The newly added proxy-fix item in B blocks end-to-end validation
of A/B/C regardless of CK, and is independently worth prioritizing since it
currently affects live countries.

Group B is now fully understood rather than speculative: publishing access is
confirmed in hand (key-based SSH + SCP to `lotgemhpcdmz01`), `createFolder.sh`
is confirmed unrelated, and THREDDS is confirmed running a `datasetScan` over
`POP` — so publishing the full catalog is genuinely just SCP into the right
folder structure, no catalog-generation scripting required. What's left in B
is finding/reusing the existing merge process that turned Meena's raw SFINCS
output into published single-variable files, which also unblocks A2. Group A
otherwise still needs the ~19,000 bad-cell mask fixed and the file-prep work
done; group C (Cook Islands + new HazardType/EventType dimensions in the
middleware) hasn't been started and has no live-server shortcut the way B did.
