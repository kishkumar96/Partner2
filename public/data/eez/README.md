# Pacific EEZ outlines

Visual context for the map: where each Pacific island country's and territory's exclusive economic zone lies.
**Not a maritime boundary.** Marine Regions states its data has no legal value and is not for legal, economic,
navigational or resource purposes. The outlines here are also simplified (about 4 km), so they are looser still.

| File | What it is |
|---|---|
| `pacific-eez.geojson` | 31 zones as polygons. Properties: `name`, `iso`, `territory`, `sovereign`, `type`, `mrgid`, `country` (the dashboard's `VU`/`WS`/`TO`/`CK` for the four dashboard countries, otherwise empty) |
| `eez-labels.geojson` | One hand-placed label point per zone, with `label`, `rank` (1 country, 2 territory, 3 small zone) and `country` |
| `eez-coverage.json` | Everything below in machine-readable form, plus every zone and the checksums of the files |

## Source and licence

- **Data:** World EEZ v12, low resolution (`eez_v12_lowres`, 2023-10-25), Flanders Marine Institute (VLIZ), Marine Regions, <https://www.marineregions.org/downloads.php>
- **Licence:** CC BY 4.0. Cite as: *Flanders Marine Institute (2023). Maritime Boundaries Geodatabase: Maritime Boundaries and Exclusive Economic Zones (200NM), version 12. https://doi.org/10.14284/632*. The map shows this attribution. The publisher asks that its products are not made available for download elsewhere; this folder holds only a simplified Pacific subset, with attribution, which CC BY allows.
- **Retrieved:** 2026-11-19. Source zip `World_EEZ_v12_20231025_LR.zip`, SHA-256 `5be66b2b2038b489ee9ad1675ae9c1ef3ac7b10fa016e6a6e8796fb37d31e55a`.
- **Not the SPREP file:** an earlier plan named the SPREP Pacific EEZ GeoJSON. This is the global Marine Regions dataset, cut down to the Pacific, so field names and coverage differ from that file.

## Coverage

The 22 Pacific Community members (American Samoa, Cook Islands, Fiji, French Polynesia, Guam, Kiribati's three
groups, Marshall Islands, Micronesia, Nauru, New Caledonia, Niue, Northern Mariana Islands, Palau, Papua New
Guinea, Pitcairn, Samoa, Solomon Islands, Tokelau, Tonga, Tuvalu, Vanuatu, Wallis and Futuna), plus Norfolk
Island, the US minor outlying islands (Palmyra, Johnston, Jarvis, Howland and Baker) and two overlapping claims
(Wake Island, Matthew and Hunter Islands: `type` is `Overlapping claim`, and the map should not draw these as
settled boundaries). Left out: joint-regime areas, Hawaii, Easter Island, and states on the Asian and American
rims. See `eez-coverage.json` for the full list.

## Geometry

- Zones that cross the dateline (Fiji, Tuvalu, the Gilbert Islands) are each **one polygon** with longitudes
  past 180 (up to about 184), so the outline has no seam on the dateline. MapLibre draws these correctly. Do not
  run them through a ±180 normaliser. Every other zone keeps ordinary ±180 longitudes.
- Polygons keep their holes, except specks under 0.02 deg² (about 250 km²). All holes kept are islands that the
  dataset leaves out of the zone (New Britain, Grande Terre, Viti Levu...), not another zone's enclave. **Draw
  the outline from each polygon's outer ring**, or it traces those islands' coasts.
- Coordinates are rounded to 0.01 degrees (about 1 km).

## Rebuild

```bash
python3 -I scripts/eez/prepare.py --source-zip World_EEZ_v12_20231025_LR.zip --out public/data/eez
```

Needs GDAL (`ogr2ogr`) built with SpatiaLite. The script unpacks the zip into a temporary folder, checks that
every label lies inside its zone and that every zone has a label, and fails above the 250 KB budget for
geometry plus labels. Zone selection is `scripts/eez/pacific.sql`; label points are `scripts/eez/labels.json`.
