import React from 'react';
import { act, render } from '@testing-library/react';
import PacificEezLayer from '../PacificEezLayer';
import { resetEezCache } from '@/utils/pacificEez';
import { readFileSync } from 'fs';
import path from 'path';

const asset = (name: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), 'public', 'data', 'eez', name), 'utf8'));
const zones = asset('pacific-eez.geojson');
const labels = asset('eez-labels.geojson');

interface Spec {
  id: string;
  type: string;
  source: string;
  filter?: unknown;
  minzoom?: number;
}

function fakeMap(styleLoaded = true) {
  const sources: Record<string, { data: unknown; attribution?: string }> = {};
  const layers: Spec[] = [];
  const handlers: Record<string, Array<() => void>> = {};
  const map = {
    sources,
    layers,
    handlers,
    isStyleLoaded: jest.fn(() => styleLoaded),
    addSource: jest.fn((id: string, spec) => {
      sources[id] = spec;
    }),
    addLayer: jest.fn((spec: Spec) => {
      layers.push(spec);
    }),
    getSource: jest.fn((id: string) => sources[id]),
    getLayer: jest.fn((id: string) => layers.find(l => l.id === id)),
    removeLayer: jest.fn((id: string) => {
      layers.splice(
        layers.findIndex(l => l.id === id),
        1
      );
    }),
    removeSource: jest.fn((id: string) => {
      delete sources[id];
    }),
    getStyle: jest.fn(() => ({ layers: [] })),
    on: jest.fn((event: string, handler: () => void) => {
      (handlers[event] ??= []).push(handler);
    }),
    off: jest.fn((event: string, handler: () => void) => {
      handlers[event] = (handlers[event] ?? []).filter(h => h !== handler);
    }),
  };
  return map;
}

const originalFetch = global.fetch;
function serve(ok = true) {
  global.fetch = jest.fn(async (url: string) => ({
    ok,
    status: ok ? 200 : 503,
    json: async () => (String(url).includes('labels') ? labels : zones),
  })) as never;
}

const flush = () => act(async () => {});

beforeEach(() => {
  resetEezCache();
  serve();
});
afterEach(() => {
  global.fetch = originalFetch;
});

describe('PacificEezLayer', () => {
  it('draws neighbours muted, the selected country bright, and labels, once the files load', async () => {
    const map = fakeMap();
    const onStatusChange = jest.fn();
    render(
      <PacificEezLayer
        map={map as never}
        visible
        selectedCountry="VU"
        onStatusChange={onStatusChange}
      />
    );
    await flush();
    expect(onStatusChange.mock.calls.map(c => c[0])).toEqual(['loading', 'ready']);
    expect(map.layers.map(l => l.id).sort()).toEqual([
      'pacific-eez-labels',
      'pacific-eez-labels-minor',
      'pacific-eez-outline',
      'pacific-eez-selected',
    ]);
    const outline = map.layers.find(l => l.id === 'pacific-eez-outline')!;
    const selected = map.layers.find(l => l.id === 'pacific-eez-selected')!;
    expect(selected.filter).toEqual(['==', ['get', 'country'], 'VU']);
    expect(outline.filter).toEqual(['!=', ['get', 'country'], 'VU']);
    // Lines and labels only: nothing that could take a click from an asset or a cyclone track
    expect(map.layers.map(l => l.type).sort()).toEqual(['line', 'line', 'symbol', 'symbol']);
    expect(map.on).not.toHaveBeenCalledWith('click', expect.anything(), expect.anything());
    expect(map.sources['pacific-eez-outlines'].attribution).toMatch(/Marine Regions/);
  });

  it('gives the minor labels their own later zoom, and fades every label out between 6 and 7', async () => {
    const map = fakeMap();
    render(<PacificEezLayer map={map as never} visible selectedCountry="WS" />);
    await flush();
    const minor = map.layers.find(l => l.id === 'pacific-eez-labels-minor') as Spec & {
      paint?: Record<string, unknown>;
    };
    expect(minor.minzoom).toBeGreaterThan(
      map.layers.find(l => l.id === 'pacific-eez-labels')!.minzoom!
    );
    const addCalls = (map.addLayer as jest.Mock).mock.calls.map(c => c[0]);
    for (const spec of addCalls.filter(s => s.type === 'symbol')) {
      expect(spec.paint['text-opacity']).toEqual(['interpolate', ['linear'], ['zoom'], 6, 1, 7, 0]);
      expect(spec.layout['text-allow-overlap']).toBe(false);
    }
  });

  it('draws nothing while switched off, and removes everything when switched off or unmounted', async () => {
    const map = fakeMap();
    const onStatusChange = jest.fn();
    const { rerender, unmount } = render(
      <PacificEezLayer
        map={map as never}
        visible={false}
        selectedCountry="TO"
        onStatusChange={onStatusChange}
      />
    );
    await flush();
    expect(map.addSource).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onStatusChange).toHaveBeenLastCalledWith('idle');

    rerender(
      <PacificEezLayer
        map={map as never}
        visible
        selectedCountry="TO"
        onStatusChange={onStatusChange}
      />
    );
    await flush();
    expect(map.layers).toHaveLength(4);
    rerender(
      <PacificEezLayer
        map={map as never}
        visible={false}
        selectedCountry="TO"
        onStatusChange={onStatusChange}
      />
    );
    expect(map.layers).toHaveLength(0);
    expect(Object.keys(map.sources)).toHaveLength(0);

    rerender(
      <PacificEezLayer
        map={map as never}
        visible
        selectedCountry="TO"
        onStatusChange={onStatusChange}
      />
    );
    await flush();
    unmount();
    expect(map.layers).toHaveLength(0);
  });

  it('redraws with the new country highlighted when the country changes', async () => {
    const map = fakeMap();
    const { rerender } = render(
      <PacificEezLayer map={map as never} visible selectedCountry="VU" />
    );
    await flush();
    rerender(<PacificEezLayer map={map as never} visible selectedCountry="CK" />);
    await flush();
    expect(map.layers.find(l => l.id === 'pacific-eez-selected')!.filter).toEqual([
      '==',
      ['get', 'country'],
      'CK',
    ]);
  });

  it('uses lighter text on a dark basemap', async () => {
    const light = fakeMap();
    render(<PacificEezLayer map={light as never} visible selectedCountry="VU" />);
    await flush();
    const dark = fakeMap();
    render(<PacificEezLayer map={dark as never} visible selectedCountry="VU" dark />);
    await flush();
    const colour = (m: ReturnType<typeof fakeMap>) =>
      (m.addLayer as jest.Mock).mock.calls.map(c => c[0]).find(s => s.id === 'pacific-eez-selected')
        .paint['line-color'];
    expect(colour(dark)).not.toBe(colour(light));
  });

  it('puts the outlines back when a style reload drops them', async () => {
    const map = fakeMap(false);
    render(<PacificEezLayer map={map as never} visible selectedCountry="VU" />);
    await flush();
    expect(map.layers).toHaveLength(0); // style not ready yet
    map.isStyleLoaded.mockReturnValue(true);
    act(() => map.handlers['style.load'].forEach(h => h()));
    expect(map.layers).toHaveLength(4);
    // A reload that drops the source brings them back again
    for (const id of [
      'pacific-eez-labels-minor',
      'pacific-eez-labels',
      'pacific-eez-selected',
      'pacific-eez-outline',
    ]) {
      map.removeLayer(id);
    }
    map.removeSource('pacific-eez-outlines');
    map.removeSource('pacific-eez-label-points');
    act(() => map.handlers['style.load'].forEach(h => h()));
    expect(map.layers).toHaveLength(4);
  });

  it('reports a failed load, leaves the map alone, and loads on retry', async () => {
    serve(false);
    const map = fakeMap();
    const onStatusChange = jest.fn();
    const { rerender } = render(
      <PacificEezLayer
        map={map as never}
        visible
        selectedCountry="VU"
        onStatusChange={onStatusChange}
      />
    );
    await flush();
    expect(onStatusChange).toHaveBeenLastCalledWith('failed');
    expect(map.layers).toHaveLength(0);

    serve(true);
    rerender(
      <PacificEezLayer
        map={map as never}
        visible
        selectedCountry="VU"
        retryKey={1}
        onStatusChange={onStatusChange}
      />
    );
    await flush();
    expect(onStatusChange).toHaveBeenLastCalledWith('ready');
    expect(map.layers).toHaveLength(4);
  });
});
