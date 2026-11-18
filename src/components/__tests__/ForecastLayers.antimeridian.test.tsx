/**
 * A forecast that crosses the dateline arrives with longitudes in ±180. The overlay must
 * hand MapLibre a continuous line, or the track is drawn across the whole map.
 */

import React from 'react';
import { render } from '@testing-library/react';
import ForecastLayers from '../ForecastLayers';
import type { ForecastLayerControls } from '@/utils/useForecastLayers';

const track: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [-178, -15],
          [179, -16],
          [175, -17],
        ],
      },
    },
  ],
};

const controls = {
  shown: { track: true },
  toggle: jest.fn(),
  options: [{ id: 'track', label: 'Track', short: 'Track', available: true }],
  data: { track },
  floodplainState: 'idle',
  activeCount: 1,
  summary: 'Track',
} as unknown as ForecastLayerControls;

it('adds the track with continuous longitudes and leaves the input alone', () => {
  const added: Record<string, { data: GeoJSON.FeatureCollection }> = {};
  const map = new Proxy(
    {
      addSource: (id: string, spec: { data: GeoJSON.FeatureCollection }) => {
        added[id] = spec;
      },
      getSource: () => undefined,
      getLayer: () => undefined,
      getStyle: () => ({ layers: [] }),
    } as Record<string, unknown>,
    { get: (target, key: string) => target[key] ?? jest.fn() }
  );
  render(<ForecastLayers map={map as never} controls={controls} onOpenControls={jest.fn()} />);
  const line = added['forecast-cyclone-track'].data.features[0].geometry as GeoJSON.LineString;
  expect(line.coordinates.map(p => p[0])).toEqual([-178, -181, -185]);
  expect((track.features[0].geometry as GeoJSON.LineString).coordinates[1][0]).toBe(179);
});

describe('advisory starts and track times', () => {
  const origins: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { runId: 'a', selected: false, label: '18 Nov 00Z', isLatest: false },
        geometry: { type: 'Point', coordinates: [-178, -10] },
      },
    ],
  };
  const times: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'day', label: '19 Nov', sortKey: 0 },
        geometry: { type: 'Point', coordinates: [-175, -12] },
      },
    ],
  };

  const tracks: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { runId: 'a', age: 1 },
        geometry: {
          type: 'LineString',
          coordinates: [
            [179, -10],
            [-179, -12],
          ],
        },
      },
    ],
  };

  it('adds the overlays with their own sources and layers when switched on', () => {
    const layers: string[] = [];
    const sources: string[] = [];
    const map = new Proxy(
      {
        addSource: (id: string) => sources.push(id),
        addLayer: (spec: { id: string }) => layers.push(spec.id),
        getSource: () => undefined,
        getLayer: () => undefined,
        getStyle: () => ({ layers: [] }),
      } as Record<string, unknown>,
      { get: (target, key: string) => target[key] ?? jest.fn() }
    );
    const both = {
      ...controls,
      shown: { origins: true, times: true, releases: true },
      data: { origins, times, releases: tracks },
      options: [
        { id: 'origins', label: 'o', short: 'o', available: true },
        { id: 'releases', label: 'r', short: 'r', available: true },
        { id: 'times', label: 't', short: 't', available: true },
      ],
    } as unknown as ForecastLayerControls;
    render(<ForecastLayers map={map as never} controls={both} onOpenControls={jest.fn()} />);
    expect(sources).toEqual(
      expect.arrayContaining(['forecast-advisory-origins', 'forecast-track-times'])
    );
    expect(layers).toEqual(
      expect.arrayContaining([
        'forecast-advisory-origins',
        'forecast-advisory-origins-label',
        'forecast-advisory-tracks',
        'forecast-track-times-dot',
        'forecast-track-times-label',
      ])
    );
  });
});

describe('wind radii', () => {
  const ring = (lon: number): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'gale', threshold: '34 kt', at: '2026-11-19T00:00:00.000Z' },
        geometry: {
          type: 'Polygon',
          // A ring around 179.5°E that spills past 180° and arrives wrapped to -179.x
          coordinates: [
            [
              [lon, -15],
              [-179.2, -15.5],
              [-179.4, -14.5],
              [lon, -15],
            ],
          ],
        },
      },
    ],
  });

  function drawn(shown: boolean) {
    const sources: Record<string, { data: GeoJSON.FeatureCollection }> = {};
    const layers: string[] = [];
    const removed: string[] = [];
    const map = new Proxy(
      {
        addSource: (id: string, spec: { data: GeoJSON.FeatureCollection }) => {
          sources[id] = spec;
        },
        addLayer: (spec: { id: string }) => layers.push(spec.id),
        removeLayer: (id: string) => removed.push(id),
        removeSource: jest.fn(),
        getSource: (id: string) => (sources[id] ? {} : undefined),
        getLayer: (id: string) => (layers.includes(id) ? {} : undefined),
        getStyle: () => ({ layers: [] }),
      } as Record<string, unknown>,
      { get: (target, key: string) => target[key] ?? jest.fn() }
    );
    const controls = {
      shown: { radii: shown },
      toggle: jest.fn(),
      options: [{ id: 'radii', label: 'r', short: 'r', available: true }],
      data: { radii: ring(179.5) },
      floodplainState: 'idle',
      activeCount: 1,
      summary: 'r',
      timeZoneName: 'UTC',
    } as unknown as ForecastLayerControls;
    const view = render(
      <ForecastLayers map={map as never} controls={controls} onOpenControls={jest.fn()} />
    );
    return { sources, layers, removed, view };
  }

  it('adds a fill and an outline, and hands MapLibre a ring that does not cross the map', () => {
    const { sources, layers } = drawn(true);
    expect(layers).toEqual(
      expect.arrayContaining(['forecast-wind-radii-fill', 'forecast-wind-radii-line'])
    );
    const polygon = sources['forecast-wind-radii'].data.features[0].geometry as GeoJSON.Polygon;
    const lons = polygon.coordinates[0].map(p => p[0]);
    lons.slice(1).forEach((lon, i) => expect(Math.abs(lon - lons[i])).toBeLessThan(180));
  });

  it('adds nothing when switched off, and removes its layers when unmounted', () => {
    const off = drawn(false);
    expect(off.layers).toEqual([]);
    const on = drawn(true);
    on.view.unmount();
    expect(on.removed).toEqual(
      expect.arrayContaining(['forecast-wind-radii-line', 'forecast-wind-radii-fill'])
    );
  });
});
