/**
 * Tests for SummaryPanel Component
 */
import { render, screen } from '@testing-library/react';
import SummaryPanel from '../SummaryPanel';
import { Event, FilterState, District, Province, Sector } from '@/types';

describe('SummaryPanel Component', () => {
  const mockEvents: Event[] = [];
  const mockFilters: FilterState = {
    selectedHazards: [],
    selectedSectors: [],
    selectedEvents: [],
    dateRange: { start: '', end: '' },
    aggregationLevel: 'district',
  };
  const mockDistricts: District[] = [];
  const mockProvinces: Province[] = [];
  const mockSectors: Sector[] = [];

  it('renders summary panel', () => {
    render(
      <SummaryPanel
        events={mockEvents}
        filters={mockFilters}
        districts={mockDistricts}
        provinces={mockProvinces}
        sectors={mockSectors}
      />
    );
    expect(screen.getByText(/summary/i)).toBeInTheDocument();
  });

  it('displays key metrics', () => {
    render(
      <SummaryPanel
        events={mockEvents}
        filters={mockFilters}
        districts={mockDistricts}
        provinces={mockProvinces}
        sectors={mockSectors}
      />
    );

    // Should display formatted numbers
    const metrics = screen.getByText(/1,000,000|50,000|1,500/);
    expect(metrics).toBeInTheDocument();
  });

  it('handles missing data gracefully', () => {
    render(
      <SummaryPanel events={[]} filters={mockFilters} districts={[]} provinces={[]} sectors={[]} />
    );

    // Should display loading or empty state
    const emptyState = screen.queryByText(/no data|loading/i);
    expect(emptyState).toBeTruthy();
  });

  it('formats large numbers correctly', () => {
    const largeEvents: Event[] = [
      {
        id: '1',
        name: 'Test Event',
        date: '2024-01-01',
        hazardId: 'wind',
        totalAffectedPopulation: 987654,
        totalEconomicDamage: 1234567890,
        affectedRegions: 5,
        severity: 'high',
        location: { lat: 0, lng: 0 },
      } as Event,
    ];

    render(
      <SummaryPanel
        events={largeEvents}
        filters={mockFilters}
        districts={mockDistricts}
        provinces={mockProvinces}
        sectors={mockSectors}
      />
    );

    // Should have abbreviated or comma-separated numbers
    const content = screen.getByText(/1,234,567,890|1.2B|1.23B/);
    expect(content).toBeTruthy();
  });

  it('updates when data prop changes', () => {
    const { rerender } = render(
      <SummaryPanel
        events={mockEvents}
        filters={mockFilters}
        districts={mockDistricts}
        provinces={mockProvinces}
        sectors={mockSectors}
      />
    );

    const newEvents: Event[] = [
      {
        id: '1',
        name: 'Test Event',
        date: '2024-01-01',
        hazardId: 'wind',
        totalAffectedPopulation: 50000,
        totalEconomicDamage: 2000000,
        affectedRegions: 3,
        severity: 'medium',
        location: { lat: 0, lng: 0 },
      } as Event,
    ];

    rerender(
      <SummaryPanel
        events={newEvents}
        filters={mockFilters}
        districts={mockDistricts}
        provinces={mockProvinces}
        sectors={mockSectors}
      />
    );

    // Should display updated value
    expect(screen.getByText(/2,000,000/)).toBeInTheDocument();
  });
});
