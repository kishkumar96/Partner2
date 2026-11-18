#!/usr/bin/env python3
"""Build the Pacific EEZ context layer from Marine Regions' World EEZ v12 (low resolution).

    python3 -I scripts/eez/prepare.py --source-zip World_EEZ_v12_20231025_LR.zip --out public/data/eez

The downloaded zip is untrusted: it is unpacked into a fresh temporary folder, never into the repo, and
nothing in it is run. Needs GDAL (ogr2ogr) built with SpatiaLite; standard-library Python only.

Writes into --out:
  pacific-eez.geojson   the zones (polygons, holes kept except specks, dateline zones merged)
  eez-labels.geojson    hand-placed label points (scripts/eez/labels.json), each checked to lie in its zone
  eez-coverage.json     what is covered, where it came from, licence, retrieval date and checksums

The zones are marked visual context. Marine Regions says the data has no legal value: it is not for
maritime-boundary, navigation or resource purposes.
"""

import argparse
import datetime
import hashlib
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SIMPLIFY_DEGREES = 0.04  # about 4 km: far finer than a 200 nm boundary needs at regional zoom
# A hole smaller than this (about 250 km2 at the equator) is an island's cut-out, smaller than a pixel at
# any zoom the layer is shown at. Larger holes (another zone's enclave, a big island) are kept.
MIN_HOLE_AREA_DEG2 = 0.02
DASHBOARD_COUNTRY = {'VUT': 'VU', 'WSM': 'WS', 'TON': 'TO', 'COK': 'CK'}
BUDGET_BYTES = 250 * 1024


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ring_area(ring):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:]))) / 2


def round_ring(ring):
    """Round to 2 decimals (about 1 km), dropping the repeats that rounding creates. None if it collapses."""
    out = []
    for x, y in ring:
        point = [round(x, 2), round(y, 2)]
        if not out or point != out[-1]:
            out.append(point)
    if out and out[0] != out[-1]:
        out.append(out[0])
    return out if len(out) >= 4 else None


def polygons(geometry):
    if not geometry:
        return []
    if geometry['type'] == 'Polygon':
        return [geometry['coordinates']]
    if geometry['type'] == 'MultiPolygon':
        return geometry['coordinates']
    raise SystemExit(f"unexpected geometry {geometry['type']}: the SQL should keep polygons only")


def inside(ring, x, y):
    hit = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def point_in_polygons(polys, lon, lat):
    # Zones across the dateline use longitudes past 180, so try the point on both sides of it
    for x in (lon, lon + 360, lon - 360):
        for poly in polys:
            if inside(poly[0], x, lat) and not any(inside(hole, x, lat) for hole in poly[1:]):
                return True
    return False


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--source-zip', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--retrieved', default=datetime.date.today().isoformat())
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix='eez-') as work_name:
        work = Path(work_name)
        with zipfile.ZipFile(args.source_zip) as archive:
            archive.extractall(work / 'src')
        shapefile = next((work / 'src').rglob('eez_v12_lowres.shp'))
        raw = work / 'pacific.geojson'
        subprocess.run(
            ['ogr2ogr', '-f', 'GeoJSON', str(raw), str(shapefile), '-dialect', 'SQLite',
             '-sql', f"@{HERE / 'pacific.sql'}", '-nln', 'pacific_eez'],
            check=True,
        )
        data = json.loads(raw.read_text())
        licence = next((work / 'src').rglob('LICENSE_EEZ_v12.txt'), None)
        licence_text = licence.read_text(encoding='utf-8-sig') if licence else ''

    features, dropped_holes, kept_holes = [], 0, 0
    for feature in data['features']:
        polys = []
        for poly in polygons(feature['geometry']):
            outer = round_ring(poly[0])
            if outer is None:
                continue
            rings = [outer]
            for hole in map(round_ring, poly[1:]):
                if hole is None:
                    dropped_holes += 1
                elif ring_area(hole) >= MIN_HOLE_AREA_DEG2:
                    rings.append(hole)
                    kept_holes += 1
                else:
                    dropped_holes += 1
            polys.append(rings)
        if not polys:
            raise SystemExit(f"{feature['properties']['name']} has no polygon left")
        p = feature['properties']
        features.append({
            'type': 'Feature',
            'properties': {
                'name': p['name'],
                'iso': p['iso'] or '',
                'territory': p['territory'],
                'sovereign': p['sovereign'],
                'type': p['type'],
                'mrgid': p['mrgid'],
                'country': DASHBOARD_COUNTRY.get(p['iso'] or '', ''),
            },
            'geometry': {'type': 'MultiPolygon', 'coordinates': polys},
        })
    features.sort(key=lambda f: f['properties']['name'])

    by_name = {f['properties']['name']: f for f in features}
    labels = []
    for item in json.loads((HERE / 'labels.json').read_text())['labels']:
        zone = by_name.get(item['zone'])
        if zone is None:
            raise SystemExit(f"label '{item['label']}': no zone named '{item['zone']}'")
        if not point_in_polygons(zone['geometry']['coordinates'], item['lon'], item['lat']):
            raise SystemExit(f"label '{item['label']}' at {item['lon']},{item['lat']} is outside its zone")
        labels.append({
            'type': 'Feature',
            'properties': {'label': item['label'], 'rank': item['rank'], 'country': zone['properties']['country']},
            'geometry': {'type': 'Point', 'coordinates': [item['lon'], item['lat']]},
        })
    unlabelled = sorted(set(by_name) - {i['zone'] for i in json.loads((HERE / 'labels.json').read_text())['labels']})
    if unlabelled:
        raise SystemExit(f'zones with no label: {unlabelled}')

    args.out.mkdir(parents=True, exist_ok=True)
    zones_path = args.out / 'pacific-eez.geojson'
    labels_path = args.out / 'eez-labels.geojson'

    def dump(path, collection):
        path.write_text(json.dumps(collection, separators=(',', ':'), ensure_ascii=False) + '\n', encoding='utf-8')

    dump(zones_path, {'type': 'FeatureCollection', 'features': features})
    dump(labels_path, {'type': 'FeatureCollection', 'features': labels})
    total = zones_path.stat().st_size + labels_path.stat().st_size

    coverage = {
        'source': {
            'name': 'World EEZ v12, low resolution (eez_v12_lowres)',
            'publisher': 'Flanders Marine Institute (VLIZ), Marine Regions',
            'url': 'https://www.marineregions.org/downloads.php',
            'citation': 'Flanders Marine Institute (2023). Maritime Boundaries Geodatabase: Maritime Boundaries and Exclusive Economic Zones (200NM), version 12. https://www.marineregions.org/. https://doi.org/10.14284/632',
            'licence': 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)',
            'terms': 'Visual context only: the publisher states the data has no legal value and is not for legal, economic, navigational or resource purposes.',
            'retrieved': args.retrieved,
            'source_zip': args.source_zip.name,
            'source_zip_sha256': sha256(args.source_zip),
        },
        'processing': {
            'selection': 'Pacific Community members, plus Norfolk Island, the US minor outlying islands and two overlapping claims (Wake, Matthew and Hunter). Joint-regime areas, Hawaii, Easter Island and Asia-Pacific rim states are not included.',
            'simplify_degrees': SIMPLIFY_DEGREES,
            'dateline': 'Zones crossing +-180 are merged into one polygon with longitudes past 180.',
            'min_hole_area_deg2': MIN_HOLE_AREA_DEG2,
            'holes_kept': kept_holes,
            'holes_dropped_as_specks': dropped_holes,
            'coordinate_decimals': 2,
        },
        'assets': {
            'pacific-eez.geojson': {'bytes': zones_path.stat().st_size, 'sha256': sha256(zones_path)},
            'eez-labels.geojson': {'bytes': labels_path.stat().st_size, 'sha256': sha256(labels_path)},
            'total_bytes': total,
            'budget_bytes': BUDGET_BYTES,
        },
        'zones': [
            {k: f['properties'][k] for k in ('name', 'iso', 'territory', 'sovereign', 'type', 'mrgid', 'country')}
            for f in features
        ],
        'licence_file': licence_text,
    }
    (args.out / 'eez-coverage.json').write_text(json.dumps(coverage, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    print(f"{len(features)} zones, {len(labels)} labels, holes kept {kept_holes} / dropped {dropped_holes}")
    print(f"zones {zones_path.stat().st_size} B + labels {labels_path.stat().st_size} B = {total} B (budget {BUDGET_BYTES})")
    if total > BUDGET_BYTES:
        sys.exit('over the size budget')


if __name__ == '__main__':
    main()
