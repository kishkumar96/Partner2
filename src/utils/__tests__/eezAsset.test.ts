import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'public', 'data', 'eez');
const read = (name: string) => readFileSync(path.join(dir, name), 'utf8');
const zones = JSON.parse(read('pacific-eez.geojson')) as GeoJSON.FeatureCollection<
  GeoJSON.MultiPolygon,
  Record<string, string>
>;
const labels = JSON.parse(read('eez-labels.geojson')) as GeoJSON.FeatureCollection<
  GeoJSON.Point,
  Record<string, string | number>
>;
const coverage = JSON.parse(read('eez-coverage.json'));

type Ring = number[][];
const inside = (ring: Ring, x: number, y: number) => {
  let hit = false;
  for (let i = 0; i + 1 < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) hit = !hit;
  }
  return hit;
};
const contains = (zone: GeoJSON.Feature<GeoJSON.MultiPolygon>, lon: number, lat: number) =>
  [lon, lon + 360, lon - 360].some(x =>
    zone.geometry.coordinates.some(
      poly => inside(poly[0], x, lat) && !poly.slice(1).some(hole => inside(hole, x, lat))
    )
  );
const byName = (name: string) => zones.features.find(f => f.properties.name === name)!;

describe('Pacific EEZ asset', () => {
  it('stays within the size budget, geometry and labels together', () => {
    const bytes =
      statSync(path.join(dir, 'pacific-eez.geojson')).size +
      statSync(path.join(dir, 'eez-labels.geojson')).size;
    expect(bytes).toBeLessThan(250 * 1024);
    expect(coverage.assets.total_bytes).toBe(bytes);
  });

  it('matches the checksums recorded beside it, so an edit by hand is noticed', () => {
    for (const file of ['pacific-eez.geojson', 'eez-labels.geojson']) {
      expect(createHash('sha256').update(read(file)).digest('hex')).toBe(
        coverage.assets[file].sha256
      );
    }
  });

  it('records its source, licence, retrieval date and the source checksum', () => {
    expect(coverage.source.licence).toMatch(/CC BY 4\.0/);
    expect(coverage.source.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(coverage.source.source_zip_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(coverage.source.citation).toMatch(/doi\.org\/10\.14284\/632/);
  });

  it('covers every Pacific Community member, and lists them all in the coverage file', () => {
    const isos = new Set(zones.features.map(f => f.properties.iso));
    const members = [
      'ASM',
      'COK',
      'FJI',
      'PYF',
      'GUM',
      'KIR',
      'MHL',
      'FSM',
      'NRU',
      'NCL',
      'NIU',
      'MNP',
      'PLW',
      'PNG',
      'PCN',
      'WSM',
      'SLB',
      'TKL',
      'TON',
      'TUV',
      'VUT',
      'WLF',
    ];
    members.forEach(iso => expect(isos).toContain(iso));
    expect(coverage.zones).toHaveLength(zones.features.length);
  });

  it('marks the four dashboard countries, and only them', () => {
    const marked = Object.fromEntries(
      zones.features
        .filter(f => f.properties.country)
        .map(f => [f.properties.country, f.properties.iso])
    );
    expect(marked).toEqual({ VU: 'VUT', WS: 'WSM', TO: 'TON', CK: 'COK' });
  });

  it('keeps zones that cross the dateline whole, with no seam along 180', () => {
    for (const name of [
      'Fijian Exclusive Economic Zone',
      'Tuvaluan Exclusive Economic Zone',
      'Kiribati Exclusive Economic Zone (Gilbert Islands)',
    ]) {
      const zone = byName(name);
      expect(zone.geometry.coordinates).toHaveLength(1);
      const outer = zone.geometry.coordinates[0][0];
      const xs = outer.map(p => p[0]);
      expect(Math.min(...xs)).toBeLessThan(180);
      expect(Math.max(...xs)).toBeGreaterThan(180);
      const onSeam = outer.filter(p => p[0] === 180).length;
      expect(onSeam).toBeLessThanOrEqual(2);
    }
  });

  it('closes every ring and keeps real holes', () => {
    for (const f of zones.features) {
      for (const poly of f.geometry.coordinates) {
        for (const ring of poly) {
          expect(ring.length).toBeGreaterThanOrEqual(4);
          expect(ring[0]).toEqual(ring[ring.length - 1]);
        }
      }
    }
    // Grande Terre is not part of New Caledonia's zone in this dataset
    const ncl = byName('French Exclusive Economic Zone (New Caledonia)');
    expect(ncl.geometry.coordinates[0].length).toBeGreaterThan(1);
  });

  it('has a label for every zone, placed inside it', () => {
    expect(labels.features).toHaveLength(zones.features.length);
    for (const label of labels.features) {
      const [lon, lat] = label.geometry.coordinates;
      const home = zones.features.filter(z => contains(z, lon, lat));
      expect(home.length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(label.properties.rank);
    }
  });

  it('does not label the claims as settled: overlapping claims keep their type', () => {
    const claims = zones.features.filter(f => /^Overlapping claim/.test(f.properties.name));
    expect(claims.length).toBeGreaterThanOrEqual(2);
    claims.forEach(f => expect(f.properties.type).toBe('Overlapping claim'));
  });
});
