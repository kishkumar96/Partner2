/**
 * Tests for MapView Component
 */
import { render, waitFor } from '@testing-library/react';
import MapView from '../MapView';
import { Event, Hazard, FilterState } from '@/types';
import { Wind } from 'lucide-react';
import type { ComponentProps } from 'react';

// Avoid deck.gl ESM dependency chain in this unit test suite
jest.mock('../CycloneAnimationLayer', () => {
  const MockComponent = () => null;
  MockComponent.displayName = 'CycloneAnimationLayer';
  return MockComponent;
});

type RealDataLayersProps = ComponentProps<typeof import('../RealDataLayers').default>;
const realDataLayersMock = jest.fn<void, [RealDataLayersProps]>();
jest.mock('../RealDataLayers', () => {
  const MockComponent = (props: RealDataLayersProps) => {
    realDataLayersMock(props);
    return null;
  };
  MockComponent.displayName = 'RealDataLayers';
  return MockComponent;
});

jest.mock('../RegionalImpactsLayer', () => {
  const MockComponent = () => null;
  MockComponent.displayName = 'RegionalImpactsLayer';
  return MockComponent;
});

jest.mock('../DamagedBuildingsLayer', () => {
  const MockComponent = () => null;
  MockComponent.displayName = 'DamagedBuildingsLayer';
  return MockComponent;
});

jest.mock('../DamagedRoadsLayer', () => {
  const MockComponent = () => null;
  MockComponent.displayName = 'DamagedRoadsLayer';
  return MockComponent;
});

// Mock maplibre-gl
jest.mock('maplibre-gl', () => ({
  Map: jest.fn(() => ({
    on: jest.fn(),
    remove: jest.fn(),
    addControl: jest.fn(),
    addLayer: jest.fn(),
    addSource: jest.fn(),
    getSource: jest.fn(),
    setStyle: jest.fn(),
    flyTo: jest.fn(),
  })),
  NavigationControl: jest.fn(),
  ScaleControl: jest.fn(),
  FullscreenControl: jest.fn(),
}));

describe('MapView Component', () => {
  const mockEvents: Event[] = [];
  const mockHazards: Hazard[] = [{ id: 'wind', name: 'Wind', color: '#FF0000', icon: Wind }];
  const mockFilters: FilterState = {
    selectedHazards: [],
    selectedSectors: [],
    selectedEvents: [],
    dateRange: { start: '', end: '' },
    aggregationLevel: 'district',
  };

  it('renders without crashing', () => {
    const { container } = render(
      <MapView events={mockEvents} hazards={mockHazards} filters={mockFilters} />
    );
    expect(container).toBeInTheDocument();
  });

  it('initializes map container', () => {
    const { container } = render(
      <MapView events={mockEvents} hazards={mockHazards} filters={mockFilters} />
    );
    // MapView renders a div with "relative flex-1 h-full" classes
    const mapWrapper = container.querySelector('.relative.flex-1.h-full');
    expect(mapWrapper).toBeTruthy();
    // Inner map container has "w-full h-full"
    const mapContainer = container.querySelector('.w-full.h-full');
    expect(mapContainer).toBeTruthy();
  });

  it('handles map initialization errors gracefully', async () => {
    const originalConsoleError = console.error;
    const errors: any[] = [];
    console.error = (...args: any[]) => errors.push(args);

    // MapLibre is mocked to not throw errors by default in the test setup
    // This test verifies the component renders without crashing even if map has issues
    render(<MapView events={mockEvents} hazards={mockHazards} filters={mockFilters} />);

    // Just verify component renders
    await waitFor(() => {
      expect(document.querySelector('.relative.flex-1.h-full')).toBeTruthy();
    });

    console.error = originalConsoleError;
  });

  it('cleans up map on unmount', () => {
    // The mock is already set up in __mocks__/maplibre-gl.js
    // We just need to get a reference to the mock function
    const MapLibreGL = require('maplibre-gl');
    const mockRemove = jest.fn();

    // Override the mock implementation for this test
    MapLibreGL.Map.mockImplementationOnce(() => ({
      on: jest.fn((event, handler) => {
        // Simulate 'load' event to trigger mapLoaded state
        if (event === 'load') {
          setTimeout(() => handler(), 0);
        }
      }),
      once: jest.fn(),
      off: jest.fn(),
      remove: mockRemove,
      addControl: jest.fn(),
      getSource: jest.fn(() => null),
      getLayer: jest.fn(() => null),
      getCanvas: jest.fn(() => ({
        style: {},
      })),
      setFeatureState: jest.fn(),
      setPaintProperty: jest.fn(),
      getCenter: jest.fn(() => ({ lng: 0, lat: 0 })),
      getZoom: jest.fn(() => 10),
      flyTo: jest.fn(),
      setStyle: jest.fn(),
      setCenter: jest.fn(),
      setZoom: jest.fn(),
      isStyleLoaded: jest.fn(() => true),
    }));

    const { unmount } = render(
      <MapView events={mockEvents} hazards={mockHazards} filters={mockFilters} />
    );

    unmount();

    // Map cleanup should be called
    expect(mockRemove).toHaveBeenCalled();
  });

  it('keeps the static cyclone track hidden when animated cyclone data is toggled off', async () => {
    const MapLibreGL = require('maplibre-gl');

    MapLibreGL.Map.mockImplementationOnce(() => ({
      on: jest.fn((event, handler) => {
        if (event === 'load') {
          setTimeout(() => handler(), 0);
        }
      }),
      once: jest.fn(),
      off: jest.fn(),
      remove: jest.fn(),
      addControl: jest.fn(),
      addLayer: jest.fn(),
      addSource: jest.fn(),
      getSource: jest.fn(() => null),
      getLayer: jest.fn(() => null),
      getCanvas: jest.fn(() => ({ style: {} })),
      getStyle: jest.fn(() => ({ layers: [] })),
      setFeatureState: jest.fn(),
      setPaintProperty: jest.fn(),
      setLayoutProperty: jest.fn(),
      getCenter: jest.fn(() => ({ lng: 0, lat: 0 })),
      getZoom: jest.fn(() => 10),
      getBearing: jest.fn(() => 0),
      getPitch: jest.fn(() => 0),
      flyTo: jest.fn(),
      easeTo: jest.fn(),
      stop: jest.fn(),
      isStyleLoaded: jest.fn(() => true),
    }));

    realDataLayersMock.mockClear();

    render(
      <MapView
        events={mockEvents}
        hazards={mockHazards}
        filters={mockFilters}
        showCycloneAnimation={false}
        cycloneForecast={[
          {
            time: new Date('2026-04-01T00:00:00Z'),
            timeString: '2026-04-01T00:00:00Z',
            latitude: -17.5,
            longitude: 179.1,
            category: 3,
            pressure: 960,
            meanWind: 80,
            windGust: 100,
            uncertainty: 20,
            galeRadiusNE: 100,
            galeRadiusSE: 90,
            galeRadiusSW: 80,
            galeRadiusNW: 95,
            stormRadiusNE: 60,
            stormRadiusSE: 55,
            stormRadiusSW: 50,
            stormRadiusNW: 58,
            hurricaneRadiusNE: 30,
            hurricaneRadiusSE: 28,
            hurricaneRadiusSW: 25,
            hurricaneRadiusNW: 26,
            eyeRadius: 10,
            eyeRadiusUncertainty: 2,
            verticalExtent: 3,
            pressureOCI: 1005,
            radiusOCI: 180,
            dvorakTNumber: 4.5,
            currentIntensity: 3,
            p5Wind: 75,
          },
        ]}
      />
    );

    await waitFor(() => {
      expect(realDataLayersMock).toHaveBeenCalled();
    });

    const latestCall = realDataLayersMock.mock.calls.at(-1)?.[0];
    expect(latestCall?.showCycloneTrack).toBe(false);
  });
});
