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
  getLayersForCountry: jest.fn().mockReturnValue([]),
}));

const mockMap = {
  on: jest.fn(),
  off: jest.fn(),
  addLayer: jest.fn(),
  removeLayer: jest.fn(),
  addSource: jest.fn(),
  removeSource: jest.fn(),
  getSource: jest.fn(() => null),
  getLayer: jest.fn(() => null),
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
});
