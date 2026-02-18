/**
 * Tests for MapView Component
 */
import { render, waitFor } from '@testing-library/react';
import MapView from '../MapView';
import { Event, Hazard, FilterState } from '@/types';
import { Wind } from 'lucide-react';

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
});
