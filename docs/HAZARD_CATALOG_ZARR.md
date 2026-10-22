# Hazard catalogue Zarr store (Wasabi → API row → dashboard)

The Cook Islands flood hazard rasters (SLR × return period / event) live in one Zarr store,
`hazard_catalog.zarr`, on Wasabi (S3). The dashboard reads it directly; the API holds one row that
says where it is. The middleware's `hazard_tiles` endpoint, which draws PNG tiles from the same
store, still works and is the fallback for rows that have tile addresses.

```
Wasabi  s3://spc-zarr-file/hazard_catalog.zarr  (Zarr v2, publicly readable)
   ▲                         ▲
   │ pointer row             │ chunks, read in the browser
API hazard_information  ──▶  Dashboard   (scenario list from the store's own metadata)
```

## Which format, and why v2
The original store is Zarr v3 and keeps event labels as fixed-length UTF-32 strings, a type the v3
specification does not define yet (zarr warns it "may be unreadable by other Zarr libraries"). The
copy on Wasabi is Zarr v2, which every Zarr reader understands. Django (zarr 3.1) reads both.

## Publish (or republish) the store
```bash
# convert to v2, compare every block with the original, upload, then compare names and sizes
python manage.py publish_hazard_catalog s3://spc-zarr-file/hazard_catalog.zarr --dry-run   # check only
python manage.py publish_hazard_catalog s3://spc-zarr-file/hazard_catalog.zarr
python manage.py publish_hazard_catalog s3://spc-zarr-file/hazard_catalog.zarr --replace   # over an existing one
```
Chunks are copied unchanged (the arrays are `bytes` + `zstd`, so a v3 chunk is the same bytes as a v2
chunk); only metadata is rewritten. It needs the Wasabi keys in the environment (below).
`--replace` deletes what is at the destination first, so use it deliberately.

## Point the middleware at Wasabi (tile endpoint and pass-through)
Only needed for the middleware's own `hazard_tiles` / `hazard_zarr` endpoints. Add to the middleware's environment (`middleware/.env`, never committed):
```
HAZARD_CATALOG_STORE=s3://spc-zarr-file/hazard_catalog.zarr
HAZARD_CATALOG_CACHE_DIR=/code/data/.hazard_cache      # chunks kept on local disk
WASABI_ENDPOINT_URL=https://s3.ap-southeast-2.wasabisys.com
AWS_DEFAULT_REGION=ap-southeast-2
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```
With `HAZARD_CATALOG_STORE` unset Django reads `middleware/data/hazard_catalog.zarr` as before.
The image needs `s3fs` (in `requirements.txt`), so rebuild it before restarting the web container.

Measured against the real store from the production server: a first tile for a slice takes
1–2 s (it reads that slice's chunks), the next tile on the same slice 0.1–0.4 s with the chunk cache,
and a tile already drawn comes from the PNG cache under `media/hazard_tiles/` in a few milliseconds.
Empty `HAZARD_CATALOG_CACHE_DIR` and `media/hazard_tiles/` after replacing the store in the bucket.

## How the dashboard gets its scenarios (no endpoint needed)
The `spc-zarr-file` bucket is publicly readable and sends `Access-Control-Allow-Origin: *`, so a
browser reads the Zarr store from Wasabi directly. The API only has to say where the store is:

1. **One `hazard_information` row per country**, protocol `zarr`, `url` = the store's address
   (`https://s3.ap-southeast-2.wasabisys.com/spc-zarr-file/hazard_catalog.zarr`). Nothing else on
   the row is needed, so the API's hazard table needs no extra columns.
   `python3 pacific_api_push.py hazard-zarr --url ... --title ... --country-id 3 [--apply]` creates it
   (the Pacific Disaster API has no delete, so it is a dry run until `--apply`). It exists on that
   API as row 10.
2. **The scenario list comes from the store itself.** `loadZarrHazardLayers` (`src/utils/hazardZarrCatalog.ts`)
   reads the store's `.zmetadata` and its coordinate arrays (sea-level rises, return periods, event
   labels) and builds one layer per scenario, in the shape the existing scenario selector reads
   (`hazardScenario`). A product whose upload is incomplete (blank labels) is skipped. The
   Cook Islands store gives 140 layers: combined 24, tc 24, swell 24, historical events 68.
3. **Drawing one:** `ZarrHttpStore` (`src/utils/zarrReader.ts`) reads only that scenario's chunks and
   decodes zstd in the browser (`fzstd`, no WebAssembly); `loadHazardScenario` (`hazardZarr.ts`) colours
   the depths with the ramp the server's tiles used and places the picture from the grid's
   georeference (`utm.ts`); `addHazardZarrLayer` (`hazardZarrMapLayer.ts`) adds it as one MapLibre image
   source and raster layer under the same ids (`wms-<id>` / `wms-layer-<id>`), so the map's show/hide
   and clean-up apply. A picture that arrives after the user has moved on is added hidden.
4. **Fallbacks:** a layer that came from a catalogue row with a tile address falls back to the server's
   tiles if the store cannot be read. A scenario that exists only in the store has no tiles, so it is
   simply not drawn (the console says why). If rows and the store describe the same scenario it is
   offered once, from the store (`mergeHazardLayers`).

`NEXT_PUBLIC_HAZARD_ZARR_DIRECT=false` turns all of this off: pointer rows are ignored and the
server-drawn tiles are used. The proxy (`src/utils/partnerProxyPath.ts`) never adds a trailing slash
to `hazard_zarr` paths, since chunk names such as `slr/0` have no extension.

Checked against the real store: decoded depths and colours match the original data and the server's
colour maths cell for cell, and the picture lands on Rarotonga's coastline in MapLibre, read from
Wasabi with no server in between.

Access: the bucket's policy makes every store in it public, this one included. If the hazard
rasters should not be public, use the Django pass-through below instead (keys stay on the server).

## Optional: reading it through Django
`GET /partner_api/v1/hazard_zarr/<key>` (middleware only) hands over one object of the store,
read-only, with `Range` requests (`206`/`416`), `HEAD` and `Cache-Control`
(`HAZARD_ZARR_CACHE_SECONDS`, default one hour). Only Zarr object names are served (folders named
with letters, digits, `_` and `-`, then `.zmetadata`/`.zgroup`/`.zarray`/`.zattrs`/`zarr.json` or a
chunk index such as `0.1.2.3`). Use it when the bucket must stay private: point the pointer row at
`.../partner_api/v1/hazard_zarr` instead of Wasabi.

## Why the copy is not a plain file copy
In Zarr v2 xarray reads an array's `fill_value` as a missing-data marker, so a real `0.0` (0 m of
sea-level rise) or index `0` would read as NaN. `publish_hazard_catalog` leaves that field unset for
0 / "" fills (never-written chunks still read as 0) and compares what **xarray decodes** from the
original and the copy (dtypes, dims and coordinate values), not only the raw arrays.

## Known gap
In the copy that was published, the `swell_driven` and `synthetic_tcs` groups hold no data (their
arrays are declared but no chunk was ever written). `populate_hazard_catalog` skips such groups.
Publish again with `--replace` from a source that has them.
