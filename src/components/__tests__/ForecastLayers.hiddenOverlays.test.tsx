/**
 * While the cyclone animation plays it draws the forecast track itself, so the
 * static track overlay steps aside without the user's switch changing.
 */

import React from 'react';
import { render } from '@testing-library/react';
import ForecastLayers from '../ForecastLayers';
import type { ForecastLayerControls } from '@/utils/useForecastLayers';

const collection = (type: 'LineString' | 'Polygon'): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry:
        type === 'LineString'
          ? {
              type,
              coordinates: [
                [-162.9, -14.4],
                [-147.4, -25.3],
              ],
            }
          : {
              type,
              coordinates: [
                [
                  [-160, -20],
                  [-159, -20],
                  [-159, -19],
                  [-160, -20],
                ],
              ],
            },
    },
  ],
});

const controls = {
  shown: {
    track: true,
    swaths: true,
    rings: false,
    facilities: false,
    floodplain: false,
    priority: false,
  },
  toggle: jest.fn(),
  options: [
    { id: 'track', label: 'Track', short: 'Track', available: true },
    { id: 'swaths', label: 'Swaths', short: 'Swaths', available: true },
  ],
  data: {
    track: collection('LineString'),
    swaths: collection('Polygon'),
    rings: null,
    facilities: null,
    floodplain: null,
    priority: null,
  },
  floodplainState: 'idle',
  activeCount: 2,
  summary: 'Track · Swaths',
} as unknown as ForecastLayerControls;

function fakeMap() {
  const sources: string[] = [];
  const store = new Set<string>();
  return {
    sources,
    map: new Proxy(
      {
        addSource: (id: string) => {
          sources.push(id);
          store.add(id);
        },
        getSource: (id: string) => (store.has(id) ? {} : undefined),
        getLayer: () => undefined,
        getStyle: () => ({ layers: [] }),
      } as Record<string, unknown>,
      { get: (target, key: string) => target[key] ?? jest.fn() }
    ),
  };
}

describe('ForecastLayers hiddenOverlays', () => {
  it('draws the track and the wind swaths by default', () => {
    const { map, sources } = fakeMap();
    render(<ForecastLayers map={map as never} controls={controls} onOpenControls={jest.fn()} />);
    expect(sources).toEqual(
      expect.arrayContaining(['forecast-cyclone-track', 'forecast-wind-swaths'])
    );
  });

  it('leaves the track undrawn, but not the swaths, while it is hidden', () => {
    const { map, sources } = fakeMap();
    render(
      <ForecastLayers
        map={map as never}
        controls={controls}
        onOpenControls={jest.fn()}
        hiddenOverlays={['track']}
      />
    );
    expect(sources).toContain('forecast-wind-swaths');
    expect(sources).not.toContain('forecast-cyclone-track');
    // The user's own switch is untouched
    expect(controls.shown.track).toBe(true);
  });
});
