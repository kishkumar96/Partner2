/**
 * Tests for SummaryPanel Component
 */
import { render, screen } from '@testing-library/react';
import SummaryPanel from '../SummaryPanel';
import { Event, FilterState, District, Province, Sector } from '@/types';

describe('SummaryPanel Component', () => {
  const mockEvents: Event[] = [
    {
      id: 'seed',
      name: 'Seed Event',
      date: '2024-01-01',
      hazardId: 'wind',
      totalAffectedPopulation: 50000,
      totalEconomicDamage: 1000000,
      affectedRegions: 1,
      severity: 'medium',
      location: { lat: 0, lng: 0 },
    } as Event,
  ];
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
    expect(screen.getByRole('heading', { name: /summary dashboard/i })).toBeInTheDocument();
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

    // Current UI uses compact formatting helpers.
    expect(screen.getByText(/\$1\.0M/)).toBeInTheDocument();
    expect(screen.getByText(/50\.0K/)).toBeInTheDocument();
  });

  it('handles missing data gracefully', () => {
    render(
      <SummaryPanel events={[]} filters={mockFilters} districts={[]} provinces={[]} sectors={[]} />
    );

    expect(screen.getByText(/No Impact Data Available/i)).toBeInTheDocument();
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

    expect(screen.getByText(/\$1\.2B/)).toBeInTheDocument();
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

    // Should display updated compact value
    expect(screen.getByText(/\$2\.0M/)).toBeInTheDocument();
  });
});
