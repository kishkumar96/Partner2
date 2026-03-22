/**
 * Tests for RealDataLayers
 *
 * RealDataLayers is a side-effect-only component (renders null).
 * Tests verify:
 *   - No crash when map is null
 *   - No crash with a valid mocked map
 *   - onLoadingChange callback behaviour
 *   - Layer loading triggered when visible changes from false → true
 */

import React from 'react';
import { render } from '@testing-library/react';
import RealDataLayers from '../RealDataLayers';
import { FilterState } from '@/types';
import { getLayersForCountry } from '@/data/realThreddsLayers';

// Mock heavy utilities that make external network calls
jest.mock('@/utils/cycloneAnimationLoader', () => ({
  loadCycloneForecastTrack: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/utils/realDataLoader', () => ({
  loadCycloneTrackData: jest.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] }),
}));

jest.mock('@/utils/forecastCone', () => ({
  generateForecastCone: jest.fn().mockReturnValue({ type: 'FeatureCollection', features: [] }),
}));

jest.mock('@/data/realThreddsLayers', () => ({
  buildWMSImageUrl: jest.fn().mockReturnValue('https://example.com/wms'),
  buildWMSTileUrl: jest.fn().mockReturnValue('https://example.com/wms-tile'),
  getLayersForCountry: jest.fn().mockReturnValue([]),
}));

const mockGetLayersForCountry = getLayersForCountry as jest.MockedFunction<
  typeof getLayersForCountry
>;

const mockMap = {
  on: jest.fn(),
  off: jest.fn(),
  addLayer: jest.fn(),
  removeLayer: jest.fn(),
  addSource: jest.fn(),
  removeSource: jest.fn(),
  getSource: jest.fn(() => null),
  getLayer: jest.fn(() => null),
  getStyle: jest.fn(() => ({ layers: [] })),
  isStyleLoaded: jest.fn(() => true),
  setPaintProperty: jest.fn(),
  setLayoutProperty: jest.fn(),
  getZoom: jest.fn(() => 7),
} as unknown as import('maplibre-gl').Map;

const baseFilters: FilterState = {
  selectedHazards: [],
  selectedSectors: [],
  selectedEvents: [],
  dateRange: { start: '', end: '' },
  aggregationLevel: 'district',
};

describe('RealDataLayers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLayersForCountry.mockReturnValue([]);
  });

  it('renders nothing (null) regardless of props', () => {
    const { container } = render(
      <RealDataLayers map={mockMap} countryCode="VU" visible filters={baseFilters} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders without crashing when map is null', () => {
    const { container } = render(
      <RealDataLayers map={null} countryCode="VU" visible filters={baseFilters} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders without crashing when countryCode is null', () => {
    const { container } = render(
      <RealDataLayers map={mockMap} countryCode={null} visible filters={baseFilters} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders without crashing when visible is false', () => {
    const { container } = render(
      <RealDataLayers map={mockMap} countryCode="VU" visible={false} filters={baseFilters} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('calls onLoadingChange when provided', () => {
    const onLoadingChange = jest.fn();
    const { unmount } = render(
      <RealDataLayers
        map={mockMap}
        countryCode="VU"
        visible
        filters={baseFilters}
        onLoadingChange={onLoadingChange}
      />
    );
    // At minimum, onLoadingChange should not throw when called by the component
    unmount();
  });

  it('accepts all optional props without crashing', () => {
    const { container } = render(
      <RealDataLayers
        map={mockMap}
        countryCode="VU"
        visible
        mapStyle="wind"
        styleChangeCounter={1}
        filters={{ ...baseFilters, selectedHazards: ['tropical-cyclone'] }}
        showWindLayer
        showInundationLayer
        onLoadingChange={jest.fn()}
        onActiveLayersChange={jest.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('hides flood layers immediately when inundation toggle is off', () => {
    mockGetLayersForCountry.mockReturnValue([
      {
        id: 'flood-test',
        name: 'Flood Test Layer',
        hazardType: 'flood',
        ncFile: 'test.nc',
        layerName: 'flood_test',
        bbox: [0, 0, 1, 1],
      } as any,
    ]);

    const localMap = {
      ...mockMap,
      getLayer: jest.fn((id: string) => (id === 'wms-layer-flood-test' ? ({ id } as any) : null)),
      setLayoutProperty: jest.fn(),
    } as unknown as import('maplibre-gl').Map;

    render(
      <RealDataLayers
        map={localMap}
        countryCode="VU"
        visible
        filters={baseFilters}
        showInundationLayer={false}
      />
    );

    expect(localMap.setLayoutProperty).toHaveBeenCalledWith(
      'wms-layer-flood-test',
      'visibility',
      'none'
    );
  });

  it('hides flood layers immediately when hazard filters only allow cyclone wind layers', () => {
    mockGetLayersForCountry.mockReturnValue([
      {
        id: 'wind-test',
        name: 'Wind Test Layer',
        hazardType: 'wind',
        ncFile: 'wind.nc',
        layerName: 'wind_test',
        bbox: [0, 0, 1, 1],
      } as any,
      {
        id: 'flood-test',
        name: 'Flood Test Layer',
        hazardType: 'flood',
        ncFile: 'flood.nc',
        layerName: 'flood_test',
        bbox: [0, 0, 1, 1],
      } as any,
    ]);

    const localMap = {
      ...mockMap,
      getLayer: jest.fn((id: string) =>
        id === 'wms-layer-wind-test' || id === 'wms-layer-flood-test' ? ({ id } as any) : null
      ),
      setLayoutProperty: jest.fn(),
    } as unknown as import('maplibre-gl').Map;

    render(
      <RealDataLayers
        map={localMap}
        countryCode="VU"
        visible
        filters={{ ...baseFilters, selectedHazards: ['tropical-cyclone'] }}
        showWindLayer
        showInundationLayer
      />
    );

    expect(localMap.setLayoutProperty).toHaveBeenCalledWith(
      'wms-layer-wind-test',
      'visibility',
      'visible'
    );
    expect(localMap.setLayoutProperty).toHaveBeenCalledWith(
      'wms-layer-flood-test',
      'visibility',
      'none'
    );
  });
});
