/**
 * Flood scenarios read from the hazard store take seconds, and used to fail silently (QA H5: "the map shows bare
 * Rarotonga each time"). The layers component must stay "loading" until the picture is in, and say when a
 * scenario could not be drawn.
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import RealDataLayers from '../RealDataLayers';
import { buildZarrHazardLayers } from '@/utils/hazardZarrCatalog';
import { addHazardZarrLayer } from '@/utils/hazardZarrMapLayer';

jest.mock('@/utils/hazardZarrMapLayer', () => ({ addHazardZarrLayer: jest.fn() }));
jest.mock('@/utils/cycloneAnimationLoader', () => ({
  loadCycloneForecastTrack: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/utils/forecastCone', () => ({
  generateForecastCone: jest.fn().mockReturnValue({ type: 'FeatureCollection', features: [] }),
}));

const addLayer = addHazardZarrLayer as jest.MockedFunction<typeof addHazardZarrLayer>;

const map = {
  on: jest.fn(),
  off: jest.fn(),
  addLayer: jest.fn(),
  removeLayer: jest.fn(),
  addSource: jest.fn(),
  removeSource: jest.fn(),
  getSource: jest.fn(() => null),
  getLayer: jest.fn(() => null),
  getStyle: jest.fn(() => ({ layers: [] })),
  getCanvas: jest.fn(() => document.createElement('canvas')),
  getContainer: jest.fn(() => document.createElement('div')),
  getCenter: jest.fn(() => ({ lng: -159.8, lat: -21.2 })),
  isStyleLoaded: jest.fn(() => true),
  setPaintProperty: jest.fn(),
  setLayoutProperty: jest.fn(),
  getZoom: jest.fn(() => 11),
  once: jest.fn(),
  loaded: jest.fn(() => true),
} as never;

const layers = buildZarrHazardLayers({
  countryCode: 'CK',
  countryName: 'Cook Islands',
  storeUrl: 'https://s3.example/hazard_catalog.zarr',
  catalog: {
    scenarios: [
      { source: 'tc', slr: 0, selector: '100', returnPeriodYears: 100, eventLabel: null },
      { source: 'tc', slr: 0, selector: '10', returnPeriodYears: 10, eventLabel: null },
    ],
    bounds: { tc: [-159.84, -21.28, -159.71, -21.19] },
  } as never,
});

const filters = {
  selectedHazards: [],
  selectedSectors: [],
  selectedEvents: [],
  dateRange: { start: '', end: '' },
  aggregationLevel: 'district',
} as never;

const selection100 = { product: 'tc', slrScenarioM: 0, returnPeriodYears: 100, eventLabel: null };

function mount(
  handlers: { onLoadingChange?: jest.Mock; onHazardLayerIssue?: jest.Mock },
  extra: Record<string, unknown> = {}
) {
  return render(
    <RealDataLayers
      map={map}
      countryCode="CK"
      visible
      filters={filters}
      partnerHazardLayers={layers}
      dataReady
      hazardLayerMode="planning"
      showInundationLayer
      hazardScenarioSelection={selection100}
      {...handlers}
      {...(extra as Record<string, unknown>)}
    />
  );
}

const settle = () => act(async () => new Promise(resolve => setTimeout(resolve, 150)));
const loadingCalls = (fn: jest.Mock) => fn.mock.calls.map(call => call[0]);

beforeEach(() => {
  addLayer.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('a flood scenario read from the hazard store', () => {
  it('asks for the chosen scenario, and keeps the page loading until its picture is in', async () => {
    let finish: (result: 'added') => void = () => undefined;
    addLayer.mockReturnValue(new Promise(resolve => (finish = resolve as never)));
    const onLoadingChange = jest.fn();
    mount({ onLoadingChange });
    await settle();

    expect(addLayer).toHaveBeenCalledTimes(1);
    expect(addLayer.mock.calls[0][1].layerId).toBe('wms-layer-zarr-ck-tc_slr0_rp100');
    // Still reading: loading must not have been switched off yet
    expect(loadingCalls(onLoadingChange)).not.toContain(false);
    expect(loadingCalls(onLoadingChange)).toContain(true);

    await act(async () => finish('added'));
    expect(loadingCalls(onLoadingChange).at(-1)).toBe(false);
  });

  it('says so when the scenario could not be read, naming the scenario', async () => {
    addLayer.mockRejectedValue(new Error('HTTP 503'));
    const onHazardLayerIssue = jest.fn();
    const onLoadingChange = jest.fn();
    mount({ onHazardLayerIssue, onLoadingChange });
    await settle();

    expect(onHazardLayerIssue).toHaveBeenLastCalledWith(
      expect.objectContaining({
        layerId: 'wms-layer-zarr-ck-tc_slr0_rp100',
        name: expect.stringContaining('100yr return period'),
      })
    );
    // and the page stops saying "loading"
    expect(loadingCalls(onLoadingChange).at(-1)).toBe(false);
  });

  it('says so when the store cannot be read and there are no server tiles to fall back on', async () => {
    addLayer.mockImplementation(async (_map, options) => {
      options.onFallback();
      return 'fallback';
    });
    const onHazardLayerIssue = jest.fn();
    mount({ onHazardLayerIssue });
    await settle();
    expect(onHazardLayerIssue).toHaveBeenCalledWith(
      expect.objectContaining({ layerId: 'wms-layer-zarr-ck-tc_slr0_rp100' })
    );
  });

  it('clears the issue once a scenario is drawn', async () => {
    addLayer.mockResolvedValue('added');
    const onHazardLayerIssue = jest.fn();
    mount({ onHazardLayerIssue });
    await settle();
    expect(onHazardLayerIssue).toHaveBeenLastCalledWith(null);
  });

  it('clears an issue about a scenario the user has moved on from', async () => {
    addLayer.mockRejectedValueOnce(new Error('HTTP 503')).mockResolvedValue('skipped');
    const onHazardLayerIssue = jest.fn();
    const view = mount({ onHazardLayerIssue });
    await settle();
    expect(onHazardLayerIssue).toHaveBeenLastCalledWith(
      expect.objectContaining({ layerId: expect.stringContaining('rp100') })
    );
    view.rerender(
      <RealDataLayers
        map={map}
        countryCode="CK"
        visible
        filters={filters}
        partnerHazardLayers={layers}
        dataReady
        hazardLayerMode="planning"
        showInundationLayer
        hazardScenarioSelection={{ ...selection100, returnPeriodYears: 10 }}
        onHazardLayerIssue={onHazardLayerIssue}
      />
    );
    await settle();
    expect(onHazardLayerIssue).toHaveBeenLastCalledWith(null);
  });

  it('draws nothing, and reports nothing, while the scenario layer is switched off', async () => {
    const onHazardLayerIssue = jest.fn();
    mount({ onHazardLayerIssue }, { showInundationLayer: false });
    await settle();
    expect(addLayer).not.toHaveBeenCalled();
    expect(onHazardLayerIssue).not.toHaveBeenCalledWith(
      expect.objectContaining({ layerId: expect.anything() })
    );
  });
});
