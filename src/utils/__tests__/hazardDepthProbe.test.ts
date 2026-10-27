/** @jest-environment jsdom */
import type { DepthReading, HazardScenarioRef } from '../hazardZarr';
import {
  attachDepthProbe,
  formatDepthReading,
  type DepthProbeMap,
  type ProbeMarker,
} from '../hazardDepthProbe';
import { addHazardZarrLayer, clearHazardScenarioCache } from '../hazardZarrMapLayer';

const SCENARIO: HazardScenarioRef = { storeUrl: '/store', source: 'tc', slr: 0.5, selector: '100' };
const OTHER: HazardScenarioRef = { ...SCENARIO, selector: '50' };
const ENCODED = {
  dataUrl: 'data:image/png;base64,AA',
  corners: [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ] as never,
};

function fakeMap() {
  const layers = new Map<string, { visibility: string }>();
  const listeners: Record<string, Array<(event: never) => void>> = { click: [], styledata: [] };
  const map = {
    getSource: (id: string) => (layers.has(id.replace('wms-', 'wms-layer-')) ? {} : undefined),
    getLayer: (id: string) => (layers.has(id) ? {} : undefined),
    getLayoutProperty: (id: string, name: string) => layers.get(id)?.[name as 'visibility'],
    addSource: () => undefined,
    addLayer: (layer: { id: string; layout: { visibility: string } }) => {
      layers.set(layer.id, { visibility: layer.layout.visibility });
    },
    on: (type: string, listener: (event: never) => void) => listeners[type].push(listener),
    off: (type: string, listener: (event: never) => void) => {
      listeners[type] = listeners[type].filter(l => l !== listener);
    },
    // test helpers
    hide: (id: string) => layers.set(id, { visibility: 'none' }),
    click: (lng: number, lat: number) =>
      Promise.all(
        listeners.click.map(l => (l as (e: unknown) => unknown)({ lngLat: { lng, lat } }))
      ),
    styleChanged: () => listeners.styledata.forEach(l => (l as () => void)()),
    listenerCount: () => listeners.click.length + listeners.styledata.length,
  };
  return map;
}

async function mapWith(...scenarios: Array<[string, HazardScenarioRef]>) {
  const map = fakeMap();
  for (const [layerId, scenario] of scenarios) {
    await addHazardZarrLayer(map as never, {
      sourceId: layerId.replace('wms-layer-', 'wms-'),
      layerId,
      scenario,
      isWanted: () => true,
      onFallback: () => undefined,
      load: async () => ENCODED,
    });
  }
  return map;
}

function markers() {
  const made: Array<{ element: HTMLElement; lngLat?: [number, number]; removed: boolean }> = [];
  const createMarker = (element: HTMLElement): ProbeMarker => {
    const record = { element, removed: false } as (typeof made)[number];
    made.push(record);
    const marker: ProbeMarker = {
      setLngLat: lngLat => ((record.lngLat = lngLat), marker),
      addTo: () => marker,
      remove: () => (record.removed = true),
    };
    return marker;
  };
  return { made, createMarker };
}

const depth = (metres: number): DepthReading => ({ kind: 'depth', metres });
const text = (record: { element: HTMLElement }) =>
  record.element.querySelector('span')?.textContent;

beforeEach(() => {
  clearHazardScenarioCache();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('formatDepthReading', () => {
  it('says what is there in words', () => {
    expect(formatDepthReading(depth(1.234))).toBe('1.23 m deep');
    expect(formatDepthReading(depth(0))).toBe('0.00 m deep');
    expect(formatDepthReading(depth(0.5))).toBe('0.50 m deep');
    expect(formatDepthReading(depth(9.996))).toBe('10.00 m deep'.replace('10.00', '10.00'));
    expect(formatDepthReading(depth(28.245))).toBe('28.2 m deep');
    expect(formatDepthReading({ kind: 'dry' })).toBe('No flooding modelled here');
    expect(formatDepthReading({ kind: 'outside' })).toBe('Outside the modelled area');
    expect(formatDepthReading(null)).toBe('Could not read the depth here');
  });
});

describe('attachDepthProbe', () => {
  it('reads the depth where the map was clicked, for the scenario that is drawn', async () => {
    const map = await mapWith(['wms-layer-1', SCENARIO]);
    const { made, createMarker } = markers();
    const read = jest.fn(async () => depth(1.234));
    attachDepthProbe(map as unknown as DepthProbeMap, { createMarker, read });
    await map.click(-159.78, -21.24);
    expect(read).toHaveBeenCalledWith(SCENARIO, -159.78, -21.24);
    expect(made).toHaveLength(1);
    expect(made[0].lngLat).toEqual([-159.78, -21.24]);
    expect(text(made[0])).toBe('1.23 m deep');
    expect(made[0].element.getAttribute('role')).toBe('status');
  });

  it('does nothing when no scenario is drawn from the store, so other clicks are left alone', async () => {
    const map = fakeMap();
    const { made, createMarker } = markers();
    const read = jest.fn(async () => depth(1));
    attachDepthProbe(map as unknown as DepthProbeMap, { createMarker, read });
    await map.click(0, 0);
    expect(read).not.toHaveBeenCalled();
    expect(made).toHaveLength(0);
  });

  it('ignores a scenario that is hidden', async () => {
    const map = await mapWith(['wms-layer-1', SCENARIO]);
    map.hide('wms-layer-1');
    const { made, createMarker } = markers();
    attachDepthProbe(map as unknown as DepthProbeMap, { createMarker, read: async () => depth(1) });
    await map.click(0, 0);
    expect(made).toHaveLength(0);
  });

  it('asks about the top layer when more than one is visible', async () => {
    const map = await mapWith(['wms-layer-1', SCENARIO], ['wms-layer-2', OTHER]);
    const { createMarker } = markers();
    const read = jest.fn(async () => depth(1));
    attachDepthProbe(map as unknown as DepthProbeMap, { createMarker, read });
    await map.click(0, 0);
    expect(read).toHaveBeenCalledWith(OTHER, 0, 0);
    map.hide('wms-layer-2');
    await map.click(0, 0);
    expect(read).toHaveBeenLastCalledWith(SCENARIO, 0, 0);
  });

  it('moves the reading to a new click, leaving one marker', async () => {
    const map = await mapWith(['wms-layer-1', SCENARIO]);
    const { made, createMarker } = markers();
    attachDepthProbe(map as unknown as DepthProbeMap, { createMarker, read: async () => depth(2) });
    await map.click(1, 1);
    await map.click(2, 2);
    expect(made.map(m => m.removed)).toEqual([true, false]);
    expect(made[1].lngLat).toEqual([2, 2]);
  });

  it('shows only the newest click when an older one is still being read', async () => {
    const map = await mapWith(['wms-layer-1', SCENARIO]);
    const { made, createMarker } = markers();
    const releases: Array<(reading: DepthReading) => void> = [];
    const read = jest.fn(() => new Promise<DepthReading>(resolve => releases.push(resolve)));
    attachDepthProbe(map as unknown as DepthProbeMap, { createMarker, read });
    const first = map.click(1, 1);
    const second = map.click(2, 2);
    releases[1](depth(5));
    await second;
    releases[0](depth(9));
    await first;
    expect(made).toHaveLength(1);
    expect(text(made[0])).toBe('5.00 m deep');
  });

  it('closes with its button, and with Escape, and a press on it is not a click on the map', async () => {
    const map = await mapWith(['wms-layer-1', SCENARIO]);
    const { made, createMarker } = markers();
    attachDepthProbe(map as unknown as DepthProbeMap, { createMarker, read: async () => depth(1) });
    await map.click(1, 1);
    const leaked = jest.fn();
    document.body.addEventListener('click', leaked);
    document.body.append(made[0].element);
    made[0].element.querySelector('button')!.click();
    expect(made[0].removed).toBe(true);
    expect(leaked).not.toHaveBeenCalled();
    await map.click(1, 1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(made[1].removed).toBe(true);
    expect(made[1].element.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Close depth reading'
    );
  });

  it('says so when the depth cannot be read', async () => {
    const map = await mapWith(['wms-layer-1', SCENARIO]);
    const { made, createMarker } = markers();
    attachDepthProbe(map as unknown as DepthProbeMap, {
      createMarker,
      read: async () => {
        throw new Error('HTTP 503');
      },
    });
    await map.click(1, 1);
    expect(text(made[0])).toBe('Could not read the depth here');
    expect(console.warn).toHaveBeenCalled();
  });

  it('drops its reading when the scenario it was read from is switched off', async () => {
    const map = await mapWith(['wms-layer-1', SCENARIO]);
    const { made, createMarker } = markers();
    attachDepthProbe(map as unknown as DepthProbeMap, { createMarker, read: async () => depth(1) });
    await map.click(1, 1);
    map.styleChanged();
    expect(made[0].removed).toBe(false);
    map.hide('wms-layer-1');
    map.styleChanged();
    expect(made[0].removed).toBe(true);
  });

  it('stops listening, clears its reading and ignores a read still in flight when detached', async () => {
    const map = await mapWith(['wms-layer-1', SCENARIO]);
    const { made, createMarker } = markers();
    let release: (reading: DepthReading) => void = () => undefined;
    const detach = attachDepthProbe(map as unknown as DepthProbeMap, {
      createMarker,
      read: () => new Promise<DepthReading>(resolve => (release = resolve)),
    });
    const pending = map.click(1, 1);
    detach();
    release(depth(3));
    await pending;
    expect(made).toHaveLength(0);
    expect(map.listenerCount()).toBe(0);
  });
});
