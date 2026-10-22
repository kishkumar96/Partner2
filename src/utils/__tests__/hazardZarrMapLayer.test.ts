import {
  addHazardZarrLayer,
  clearHazardScenarioCache,
  type EncodedScenario,
  type HazardLayerMap,
  type HazardLayerOptions,
} from '../hazardZarrMapLayer';
import type { HazardScenarioRef } from '../hazardZarr';

const SCENARIO: HazardScenarioRef = {
  storeUrl: '/api/partner-proxy/partner_api/v1/hazard_zarr',
  source: 'tc',
  slr: 0.5,
  selector: '100',
};
const ENCODED: EncodedScenario = {
  dataUrl: 'data:image/png;base64,AAAA',
  corners: [
    [-159.84, -21.19],
    [-159.72, -21.19],
    [-159.72, -21.28],
    [-159.84, -21.28],
  ],
};

function fakeMap(existing: { sources?: string[]; layers?: string[] } = {}) {
  const sources = new Set(existing.sources ?? []);
  const layers = new Set(existing.layers ?? []);
  const map: HazardLayerMap & {
    added: Array<[string, object, string | undefined]>;
    addedSources: Array<[string, object]>;
  } = {
    added: [],
    addedSources: [],
    getSource: id => (sources.has(id) ? {} : undefined),
    getLayer: id => (layers.has(id) ? {} : undefined),
    addSource(id, source) {
      sources.add(id);
      this.addedSources.push([id, source]);
    },
    addLayer(layer, beforeId) {
      layers.add((layer as { id: string }).id);
      this.added.push([(layer as { id: string }).id, layer, beforeId]);
    },
  };
  return map;
}

const options = (overrides: Partial<HazardLayerOptions> = {}): HazardLayerOptions => ({
  sourceId: 'wms-7',
  layerId: 'wms-layer-7',
  scenario: SCENARIO,
  isWanted: () => true,
  onFallback: jest.fn(),
  load: jest.fn(async () => ENCODED),
  ...overrides,
});

beforeEach(() => {
  clearHazardScenarioCache();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('addHazardZarrLayer', () => {
  it("adds the picture as an image source at its corners, and a raster layer with the tiles' look", async () => {
    const map = fakeMap();
    expect(await addHazardZarrLayer(map, options())).toBe('added');
    expect(map.addedSources).toEqual([
      ['wms-7', { type: 'image', url: ENCODED.dataUrl, coordinates: ENCODED.corners }],
    ]);
    const [id, layer] = map.added[0] as [string, Record<string, unknown>, undefined];
    expect(id).toBe('wms-layer-7');
    expect(layer).toMatchObject({
      type: 'raster',
      source: 'wms-7',
      layout: { visibility: 'visible' },
      paint: { 'raster-opacity': 0.85, 'raster-resampling': 'nearest' },
    });
  });

  it('puts the layer under another one when that one is on the map, and ignores it when it is not', async () => {
    const withTarget = fakeMap({ layers: ['cyclone-forecast-track-line'] });
    await addHazardZarrLayer(withTarget, options({ beforeId: 'cyclone-forecast-track-line' }));
    expect(withTarget.added[0][2]).toBe('cyclone-forecast-track-line');
    const without = fakeMap();
    await addHazardZarrLayer(without, options({ beforeId: 'cyclone-forecast-track-line' }));
    expect(without.added[0][2]).toBeUndefined();
  });

  it('adds a layer that is no longer wanted hidden, so a slow load cannot show a scenario the user left', async () => {
    const map = fakeMap();
    await addHazardZarrLayer(map, options({ isWanted: () => false }));
    expect((map.added[0][1] as { layout: { visibility: string } }).layout.visibility).toBe('none');
  });

  it('uses the server tiles instead when the store cannot be read', async () => {
    const map = fakeMap();
    const onFallback = jest.fn();
    const failing = jest.fn(async () => {
      throw new Error('HTTP 503');
    });
    expect(await addHazardZarrLayer(map, options({ onFallback, load: failing }))).toBe('fallback');
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(map.addedSources).toHaveLength(0);
  });

  it('does not remember a failure, so the next try reads the store again', async () => {
    const failing = jest.fn(async () => {
      throw new Error('boom');
    });
    await addHazardZarrLayer(fakeMap(), options({ load: failing }));
    const ok = jest.fn(async () => ENCODED);
    expect(await addHazardZarrLayer(fakeMap(), options({ load: ok }))).toBe('added');
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a layer the map already has', async () => {
    const load = jest.fn(async () => ENCODED);
    expect(await addHazardZarrLayer(fakeMap({ layers: ['wms-layer-7'] }), options({ load }))).toBe(
      'skipped'
    );
    expect(await addHazardZarrLayer(fakeMap({ sources: ['wms-7'] }), options({ load }))).toBe(
      'skipped'
    );
    expect(load).not.toHaveBeenCalled();
  });

  it('starts one load for a layer however many times it is asked while it loads', async () => {
    let release: (value: EncodedScenario) => void = () => undefined;
    const load = jest.fn(() => new Promise<EncodedScenario>(resolve => (release = resolve)));
    const map = fakeMap();
    const first = addHazardZarrLayer(map, options({ load }));
    expect(await addHazardZarrLayer(map, options({ load }))).toBe('skipped');
    release(ENCODED);
    expect(await first).toBe('added');
    expect(load).toHaveBeenCalledTimes(1);
    expect(map.added).toHaveLength(1);
  });

  it('shares a scenario between layers and maps instead of reading it again', async () => {
    const load = jest.fn(async () => ENCODED);
    await addHazardZarrLayer(fakeMap(), options({ load }));
    await addHazardZarrLayer(
      fakeMap(),
      options({ load, sourceId: 'wms-8', layerId: 'wms-layer-8' })
    );
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not add a layer twice when the map got it while the picture was loading', async () => {
    const map = fakeMap();
    const load = jest.fn(async () => {
      map.addSource('wms-7', {});
      return ENCODED;
    });
    expect(await addHazardZarrLayer(map, options({ load }))).toBe('skipped');
    expect(map.added).toHaveLength(0);
  });

  it('copes with a map that was removed while the picture loaded', async () => {
    const map = fakeMap();
    map.addSource = () => {
      throw new Error('style is not done loading');
    };
    expect(await addHazardZarrLayer(map, options())).toBe('skipped');
  });

  it('keeps only the most recent scenarios', async () => {
    const load = jest.fn(async () => ENCODED);
    for (let i = 0; i < 10; i += 1) {
      await addHazardZarrLayer(
        fakeMap(),
        options({ load, scenario: { ...SCENARIO, selector: String(i) } })
      );
    }
    expect(load).toHaveBeenCalledTimes(10);
    await addHazardZarrLayer(
      fakeMap(),
      options({ load, scenario: { ...SCENARIO, selector: '9' } })
    ); // recent: kept
    expect(load).toHaveBeenCalledTimes(10);
    await addHazardZarrLayer(
      fakeMap(),
      options({ load, scenario: { ...SCENARIO, selector: '0' } })
    ); // oldest: gone
    expect(load).toHaveBeenCalledTimes(11);
  });
});
