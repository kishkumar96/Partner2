# Model outputs (REF and PDIE)

The dashboard reads RiskScape result files that were uploaded as `risk_information` rows. On the shared API a row has no `dataset_type`, so **the file name decides which table a file becomes**: `inferLogicalDatasetTypeFromFilename` in `utils/realDataLoader.ts`. It matches substrings in order and the first match wins, so a more specific name must come before a shorter one. `regional-impacts-by-sector` is checked before `regional-impacts`.

## REF (Rapid Exposure Forecast), one set per advisory

| File (substring) | Logical type | Shown as |
|---|---|---|
| `total-exposed-by-country` | `forecastNational` | headline exposure; the runner also uses it to pick the country |
| `total-by-windspeed` | `forecastByWindSpeed` | exposure per wind band |
| `total-by-track-distance` | `forecastByTrackDistance` | exposure by distance from the track |
| `wind-swaths` | `forecastWindSwaths` | coloured wind-band areas on the map |
| `track-distance` | `forecastTrackDistance` | distance rings |
| `cyclone-track` | `forecastCycloneTrack` | the model's own copy of the track |
| `floodplain-exposure` | `forecastFloodplain` | floodplain exposure layer |
| `regional-summary`, `exposure-by-cluster` | as below | per-area and per-facility exposure |

`utils/forecastExposure.ts` (`buildForecastExposure`) turns these into the forecast panels. A facility's `WindSpeed_kmph` holds only the band's lower limit (63 or 89), so the facility table shows the band's range, e.g. "Storm Winds (89–117 km/h)".

## PDIE (post-disaster), two formats

### Older outputs (Gita, Harold, Meena, the first Lola)

| File | Logical type |
|---|---|
| `national-summary.csv` | `nationalSummary` |
| `regional-summary.csv` | `regionalSummary` |
| `regional-summary-by-sector.csv` | `regionalSummaryBySector` |
| `regional-impacts.geojson` | `regionalImpacts` (area polygons) |
| `regional-impacts-by-sector.geojson` | `regionalImpactsBySector` |
| `impact-by-sector.csv` | `impactBySector` |
| `impact-by-asset-type.csv` | `impactByAsset` |
| `exposure-by-cluster.geojson` | `exposureByCluster` |
| `damaged-buildings.*`, `damaged-roads.*` | `damagedBuildings`, `damagedRoads` |

### 2026 outputs (`event-loss-*`, Ryan's naming scheme)

| File | Logical type | Notes |
|---|---|---|
| `event-loss-table.csv` | `nationalSummary` | one national row; columns have a `Total_` prefix |
| `event-loss-admin1-area-table.csv` | `regionalSummary` | one row per area (`Area`, `ID`) |
| `event-loss-admin1-area-map.gpkg` | `regionalImpacts` | area polygons with the same columns |
| `event-loss-admin2-*` | not read yet | finer areas |
| `event-loss-building-map.gpkg` | `damagedBuildings` | **damaged buildings only**; `Input_Layer`, `Windspeed_kmph`, `*_Flooding_Loss` |
| `event-loss-road-map.gpkg` | `damagedRoads` | damaged roads only; no `Road_km` and no admin area |
| `event-loss-features-map.gpkg` | not read | 78 MB, 314k rows; skipped by the runner and the upload |
| `event-exposure-population-*` | not read yet | population exposure |
| `hazard-cyclone-track.gpkg` | not read | the dashboard takes the track from SPC |

**Translation.** `utils/pdieOutputs.ts` turns the new format into the old one, so the rest of the UI does not change. Old-format rows pass through untouched.

- `legacyImpactRow`: renames area and national columns, e.g. `Loss_All_Sectors` → `Total_Loss`, `Exposed_Count_Population` → `Population_Exposed_To_Any_Hazard`, `Damaged_Building_Count_All_Sectors` → `Damaged_Buildings`. National rows get `Region: 'National'`. Area rows get `Region` ← `Area` and `Region_ID` ← `ID`.
- Wind bands: each `Windspeed_>=_{lo}_kmph_*` column is **one band** up to the next threshold, not a cumulative total. They become `Wind_Gusts_kmph.range_{lo}_{hi}.{Buildings|Population|Total_Loss}`, and the top band is `{lo}_+`.
- `sectorRowsFromNational`, `sectorRowsFromAreas`, `sectorFeaturesFromAreas`: rebuild the by-sector tables, which the new model no longer writes, from the `Loss_<Sector>_Sector` columns. This picks up the new sectors Health and Emergency management.
- `legacyAssetFeatures`: renames building and road map properties (`Input_Layer` → `Asset`, `Windspeed_kmph` → `WindGust_kmph`, `Coastal_Flooding_Loss` → `Coastal_Flood_Loss`) and computes `Road_km` from the line geometry (haversine).
- `withLegacyImpactNames(bundle)`: applies all of the above to a loaded bundle.

**Still empty for 2026-format events**, because the files do not carry the data: regional maximum and average wind, the band below 83 km/h, which area a damaged building or road is in, unexposed totals, and the per-facility exposure list.

**Coordinates.** The road and population maps come in EPSG:3857 and the track in EPSG:3832. The dashboard needs lon/lat (EPSG:4326). Our middleware reprojects on upload (`_lonlat_geojson` in `middleware/risk_information/utils.py`). The shared API must receive files already in lon/lat.

## Adding a new output file

1. Add its substring to `inferLogicalDatasetTypeFromFilename`, before any shorter name it contains.
2. If the columns differ from a table the UI already reads, translate them at the boundary in `pdieOutputs.ts` (or a sibling module) and do not teach every component a second name.
3. On the backend, map the file name in `DATASET_TYPE_BY_FILENAME` (`middleware/runners/tc_runner.py`). If it is large, add it to `LARGE_ASSET_UPLOAD_MARKERS` (`risk_information/serializers.py`) or to `SKIPPED_OUTPUTS`.
4. Add a test with real values from a model run (see `utils/__tests__/pdieOutputs.test.ts`, which uses the Tonga example run).
