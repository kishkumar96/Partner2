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
    render(<MapView events={mockEvents} hazards={mockHazards} filters={mockFilters} />);
    const mapContainer = document.querySelector('.map-container, [class*="map"]');
    expect(mapContainer).toBeTruthy();
  });

  it('handles map initialization errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Force an error
    const MapLibreGL = jest.requireActual('maplibre-gl');
    MapLibreGL.Map.mockImplementationOnce(() => {
      throw new Error('Map initialization failed');
    });

    render(<MapView events={mockEvents} hazards={mockHazards} filters={mockFilters} />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  it('cleans up map on unmount', () => {
    const { unmount } = render(
      <MapView events={mockEvents} hazards={mockHazards} filters={mockFilters} />
    );
    const MapLibreGL = jest.requireActual('maplibre-gl');
    const mockRemove = jest.fn();

    MapLibreGL.Map.mockImplementation(() => ({
      on: jest.fn(),
      remove: mockRemove,
      addControl: jest.fn(),
      addLayer: jest.fn(),
      addSource: jest.fn(),
    }));

    unmount();

    // Map cleanup should be called
    expect(mockRemove).toHaveBeenCalled();
  });
});
