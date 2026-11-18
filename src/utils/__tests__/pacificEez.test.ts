import { readFileSync } from 'fs';
import path from 'path';
import { COUNTRIES } from '@/types/thredds';
import {
  applyMapViewCommand,
  PACIFIC_OVERVIEW_BOUNDS,
  countryEezBounds,
  EEZ_LABELS_PATH,
  EEZ_ZONES_PATH,
  loadEezAssets,
  outlinesOf,
  resetEezCache,
  type EezLabels,
  type EezZones,
} from '@/utils/pacificEez';

const asset = (name: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), 'public', 'data', 'eez', name), 'utf8'));
const zones = asset('pacific-eez.geojson') as EezZones;
const labels = asset('eez-labels.geojson') as EezLabels;

describe('outlinesOf', () => {
  it('draws only outer rings, so island holes do not trace coasts', () => {
    const ncl = zones.features.find(f => f.properties.iso === 'NCL')!;
    expect(ncl.geometry.coordinates[0].length).toBeGreaterThan(1); // it has holes
    const line = outlinesOf(zones).features.find(f => f.properties.iso === 'NCL')!;
    expect(line.geometry.coordinates).toHaveLength(ncl.geometry.coordinates.length);
    expect(line.geometry.coordinates[0]).toEqual(ncl.geometry.coordinates[0][0]);
  });

  it('keeps every zone and its properties', () => {
    const lines = outlinesOf(zones);
    expect(lines.features).toHaveLength(zones.features.length);
    expect(lines.features[0].properties).toEqual(zones.features[0].properties);
  });
});

describe('countryEezBounds', () => {
  it('frames each dashboard country zone', () => {
    const [w, s, e, n] = countryEezBounds(zones, 'VU')!;
    expect(w).toBeGreaterThan(160);
    expect(e).toBeLessThan(175);
    expect(s).toBeLessThan(-18);
    expect(n).toBeGreaterThan(-14);
    expect(countryEezBounds(zones, 'CK')![0]).toBeLessThan(-155);
  });

  it('is null for a country with no zone, and ignores neighbours', () => {
    expect(countryEezBounds(zones, 'XX')).toBeNull();
    // Fiji is not a dashboard country: asking for VU must not stretch to Fiji's waters
    expect(countryEezBounds(zones, 'VU')![2]).toBeLessThan(176);
  });
});

describe('loadEezAssets', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    resetEezCache();
  });

  const respond = (calls: string[]) =>
    jest.fn(async (url: string) => {
      calls.push(url);
      return {
        ok: true,
        json: async () => (url.includes('labels') ? labels : zones),
      } as Response;
    });

  it('fetches both files once, from the base path, and reuses them', async () => {
    const calls: string[] = [];
    global.fetch = respond(calls) as never;
    const first = await loadEezAssets();
    const second = await loadEezAssets();
    expect(second).toBe(first);
    expect(calls).toHaveLength(2);
    expect(calls.some(c => c.endsWith(EEZ_ZONES_PATH))).toBe(true);
    expect(calls.some(c => c.endsWith(EEZ_LABELS_PATH))).toBe(true);
    expect(first.outlines.features).toHaveLength(zones.features.length);
  });

  it('does not remember a failure, so a retry fetches again', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 503 }) as Response) as never;
    await expect(loadEezAssets()).rejects.toThrow(/503/);
    const calls: string[] = [];
    global.fetch = respond(calls) as never;
    await expect(loadEezAssets()).resolves.toBeDefined();
    expect(calls).toHaveLength(2);
  });
});

describe('applyMapViewCommand', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    resetEezCache();
  });
  const fakeMap = () => ({ fitBounds: jest.fn(), flyTo: jest.fn() });
  const serve = () => {
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes('labels') ? labels : zones),
    })) as never;
  };

  it('frames the whole Pacific for the overview, whatever the country', async () => {
    const map = fakeMap();
    expect(await applyMapViewCommand(map, 'overview', null)).toBe(true);
    expect(map.fitBounds).toHaveBeenCalledWith(
      PACIFIC_OVERVIEW_BOUNDS,
      expect.objectContaining({ duration: expect.any(Number) })
    );
  });

  it("flies back to the country's own landing view, not its EEZ", async () => {
    const map = fakeMap();
    await applyMapViewCommand(map, 'country', 'TO');
    expect(map.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: COUNTRIES.TO.center, zoom: COUNTRIES.TO.zoom })
    );
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it('frames the country EEZ only when asked, from the loaded outlines', async () => {
    serve();
    const map = fakeMap();
    expect(await applyMapViewCommand(map, 'countryEez', 'CK')).toBe(true);
    const [bounds] = map.fitBounds.mock.calls[0];
    expect(bounds).toEqual(countryEezBounds(zones, 'CK'));
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it('does nothing without a map or a country, and survives a failed load', async () => {
    expect(await applyMapViewCommand(null, 'overview', 'VU')).toBe(false);
    const map = fakeMap();
    expect(await applyMapViewCommand(map, 'country', null)).toBe(false);
    expect(await applyMapViewCommand(map, 'countryEez', null)).toBe(false);
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 }) as Response) as never;
    expect(await applyMapViewCommand(map, 'countryEez', 'VU')).toBe(false);
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(map.flyTo).not.toHaveBeenCalled();
  });
});
