/** @jest-environment node */
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import type { RealWMSLayer } from '@/data/realThreddsLayers';
import {
  buildZarrHazardLayers,
  clearZarrCatalogCache,
  listHazardScenarios,
  loadZarrHazardLayers,
  mergeHazardLayers,
  scenarioLayerName,
  zarrStoreUrls,
} from '../hazardZarrCatalog';
import { ZarrHttpStore } from '../zarrReader';

const ROOT = join(__dirname, 'fixtures', 'hazard_zarr_mini');
const BASE = 'https://wasabi.example/spc-zarr-file/hazard_catalog.zarr';

/** A fetch that serves the fixture store, optionally with extra metadata for groups that have no chunks. */
function fixtureFetch(extraMetadata: Record<string, unknown> = {}): jest.Mock {
  return jest.fn(async (input: RequestInfo | URL) => {
    const key = String(input).slice(BASE.length + 1);
    if (key === '.zmetadata' && Object.keys(extraMetadata).length > 0) {
      const parsed = JSON.parse(readFileSync(join(ROOT, key), 'utf8'));
      return new Response(
        JSON.stringify({ ...parsed, metadata: { ...parsed.metadata, ...extraMetadata } })
      );
    }
    const file = join(ROOT, key);
    return existsSync(file) && statSync(file).isFile()
      ? new Response(readFileSync(file))
      : new Response('', { status: 404 });
  });
}

const array = (shape: number[], chunks: number[], dtype: string, fill: unknown = null) => ({
  shape,
  chunks,
  dtype,
  fill_value: fill,
  order: 'C',
  filters: null,
  compressor: { id: 'zstd', level: 3 },
  zarr_format: 2,
});
// a group whose arrays are declared but whose chunks never arrived, like the published swell_driven
const HALF_UPLOADED = {
  'swell_driven/depth/.zarray': array([3, 2, 6, 10], [1, 1, 6, 10], '<f4', 'NaN'),
  'swell_driven/slr/.zarray': array([2], [2], '<f8'),
  'swell_driven/event/.zarray': array([3], [3], '<U32'),
};

const storeOver = (fetchMock: jest.Mock) =>
  new ZarrHttpStore(BASE, fetchMock as unknown as typeof fetch);

beforeEach(() => {
  clearZarrCatalogCache();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.NEXT_PUBLIC_HAZARD_ZARR_DIRECT;
});

describe('listHazardScenarios', () => {
  it('lists every sea-level rise x return period and sea-level rise x event the store holds', async () => {
    const { scenarios, bounds } = await listHazardScenarios(storeOver(fixtureFetch()));
    const tc = scenarios.filter(s => s.source === 'tc');
    const historical = scenarios.filter(s => s.source === 'historical_tcs');
    expect(tc).toHaveLength(8); // 4 return periods x 2 sea-level rises
    expect(historical).toHaveLength(6); // 3 events x 2 sea-level rises
    expect(tc[0]).toEqual({
      source: 'tc',
      slr: 0,
      selector: '10',
      returnPeriodYears: 10,
      eventLabel: null,
    });
    expect(tc[tc.length - 1]).toEqual({
      source: 'tc',
      slr: 0.5,
      selector: '100',
      returnPeriodYears: 100,
      eventLabel: null,
    });
    expect(historical.map(s => s.eventLabel)).toEqual([
      '01-Mar-1987',
      '02-Jan-1995',
      'Évènement-3',
      '01-Mar-1987',
      '02-Jan-1995',
      'Évènement-3',
    ]);
    expect(historical.every(s => s.returnPeriodYears === null)).toBe(true);
    expect(Object.keys(bounds).sort()).toEqual(['historical_tcs', 'tc']);
  });

  it('keeps the 0 m scenario, which is a real scenario and not a missing value', async () => {
    const { scenarios } = await listHazardScenarios(storeOver(fixtureFetch()));
    expect(scenarios.some(s => s.source === 'tc' && s.slr === 0)).toBe(true);
    expect(scenarios.some(s => Number.isNaN(s.slr))).toBe(false);
  });

  it('places each product on the map from its own grid', async () => {
    const { bounds } = await listHazardScenarios(storeOver(fixtureFetch()));
    const [west, south, east, north] = bounds.tc;
    expect(west).toBeCloseTo(-159.83722, 4);
    expect(east).toBeCloseTo(-159.83674, 4);
    expect(south).toBeCloseTo(-21.28117, 4);
    expect(north).toBeCloseTo(-21.2809, 4);
  });

  it('skips a product whose upload is incomplete instead of offering blank scenarios', async () => {
    const { scenarios } = await listHazardScenarios(storeOver(fixtureFetch(HALF_UPLOADED)));
    expect(scenarios.some(s => s.source === 'swell_driven')).toBe(false);
    expect(scenarios).toHaveLength(14);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("'swell_driven' has no readable event labels")
    );
  });

  it('passes on a failure to read the store, rather than offering a half list', async () => {
    const down = jest.fn(async () => new Response('', { status: 503 }));
    await expect(listHazardScenarios(storeOver(down))).rejects.toThrow('HTTP 503');
  });
});

describe('buildZarrHazardLayers', () => {
  async function layers(): Promise<RealWMSLayer[]> {
    const catalog = await listHazardScenarios(storeOver(fixtureFetch()));
    return buildZarrHazardLayers({
      countryCode: 'CK',
      countryName: 'Cook Islands',
      storeUrl: `${BASE}/`,
      catalog,
    });
  }

  it('makes one layer per scenario, in the shape the scenario selector already reads', async () => {
    const all = await layers();
    expect(all).toHaveLength(14);
    const layer = all.find(l => l.layerName === 'tc_slr0.5_rp100') as RealWMSLayer;
    expect(layer).toMatchObject({
      id: 'zarr-ck-tc_slr0.5_rp100',
      name: 'Cook Islands tc flood depth — SLR 0.5m, 100yr return period',
      countryCode: 'CK',
      hazardType: 'flood',
      source: 'partner_api',
      styleConfig: { colorScaleRange: '0,5' },
      hazardScenario: {
        product: 'tc',
        slrScenarioM: 0.5,
        returnPeriodYears: 100,
        eventLabel: null,
      },
      zarrScenario: { storeUrl: BASE, source: 'tc', slr: 0.5, selector: '100' },
    });
    expect(layer.tileUrlTemplate).toBeUndefined();
    expect(layer.bbox).toHaveLength(4);
  });

  it('names an event scenario by its label, and gives every layer its own id', async () => {
    const all = await layers();
    const event = all.find(
      l => l.hazardScenario?.eventLabel === 'Évènement-3' && l.hazardScenario.slrScenarioM === 0
    ) as RealWMSLayer;
    expect(event.layerName).toBe('historical_tcs_slr0_eventÉvènement-3');
    expect(event.name).toContain('event Évènement-3');
    expect(event.hazardScenario).toMatchObject({
      product: 'historical_tcs',
      returnPeriodYears: null,
    });
    expect(new Set(all.map(l => l.id)).size).toBe(all.length);
    expect(all.every(l => /^[A-Za-z0-9_.-]+$/.test(l.id))).toBe(true);
  });

  it('spells layer names as the server catalogue does', () => {
    expect(
      scenarioLayerName({
        source: 'combined',
        slr: 0.25,
        selector: '50',
        returnPeriodYears: 50,
        eventLabel: null,
      })
    ).toBe('combined_slr0.25_rp50');
    expect(
      scenarioLayerName({
        source: 'historical_tcs',
        slr: 0,
        selector: '01-Mar-1987',
        returnPeriodYears: null,
        eventLabel: '01-Mar-1987',
      })
    ).toBe('historical_tcs_slr0_event01-Mar-1987');
  });
});

describe('zarrStoreUrls', () => {
  it('takes the address from the rows whose protocol is zarr, once each', () => {
    expect(
      zarrStoreUrls([
        { protocol: 'zarr', url: `${BASE}/` },
        { protocol: 'ZARR', url: BASE },
        { protocol: 'xyz', url: 'https://x/{z}/{x}/{y}.png' },
        { protocol: 'zarr' },
        { protocol: 'zarr', url: '   ' },
        { url: 'https://nothing.example' },
      ])
    ).toEqual([BASE]);
  });
});

describe('loadZarrHazardLayers', () => {
  const rows = [{ id: 9, protocol: 'zarr', url: BASE, country: 3 }];
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("turns a pointer row into the store's scenarios, and reads the store only once", async () => {
    const fetchMock = fixtureFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await loadZarrHazardLayers('CK', 'Cook Islands', rows)).toHaveLength(14);
    const reads = fetchMock.mock.calls.length;
    expect(await loadZarrHazardLayers('CK', 'Cook Islands', rows)).toHaveLength(14);
    expect(fetchMock.mock.calls.length).toBe(reads);
  });

  it('offers nothing when there is no pointer row', async () => {
    global.fetch = fixtureFetch() as unknown as typeof fetch;
    expect(
      await loadZarrHazardLayers('CK', 'Cook Islands', [{ protocol: 'xyz', url: 'x' }])
    ).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('offers nothing, and says so, when the store cannot be read, and tries again next time', async () => {
    global.fetch = jest.fn(
      async () => new Response('', { status: 503 })
    ) as unknown as typeof fetch;
    expect(await loadZarrHazardLayers('CK', 'Cook Islands', rows)).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not be read'),
      expect.anything()
    );
    global.fetch = fixtureFetch() as unknown as typeof fetch;
    expect(await loadZarrHazardLayers('CK', 'Cook Islands', rows)).toHaveLength(14);
  });

  it('can be switched off, keeping the server-drawn tiles', async () => {
    process.env.NEXT_PUBLIC_HAZARD_ZARR_DIRECT = 'false';
    global.fetch = fixtureFetch() as unknown as typeof fetch;
    expect(await loadZarrHazardLayers('CK', 'Cook Islands', rows)).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('mergeHazardLayers', () => {
  const layer = (id: string, hazardScenario?: RealWMSLayer['hazardScenario']): RealWMSLayer => ({
    id,
    name: id,
    countryCode: 'CK',
    ncFile: id,
    layerName: id,
    description: id,
    hazardType: 'flood',
    bbox: [0, 0, 1, 1],
    hazardScenario,
  });
  const scenario = (slr: number, rp: number) => ({
    product: 'tc',
    slrScenarioM: slr,
    returnPeriodYears: rp,
    eventLabel: null,
  });

  it('offers a scenario once when both the rows and the store describe it', () => {
    const rowLayers = [
      layer('row-a', scenario(0.5, 100)),
      layer('row-b', scenario(0.5, 50)),
      layer('wms-wind'),
    ];
    const storeLayers = [layer('zarr-a', scenario(0.5, 100))];
    expect(mergeHazardLayers(rowLayers, storeLayers).map(l => l.id)).toEqual([
      'row-b',
      'wms-wind',
      'zarr-a',
    ]);
  });

  it('leaves the rows alone when the store offers nothing', () => {
    const rowLayers = [layer('row-a', scenario(0.5, 100))];
    expect(mergeHazardLayers(rowLayers, [])).toBe(rowLayers);
  });
});
