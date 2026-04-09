/**
 * Tests for SummaryPanel Component
 */
import { render, screen } from '@testing-library/react';
import SummaryPanel from '../SummaryPanel';
import { Event, FilterState, District, Province, Sector, Hazard } from '@/types';

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
  const mockHazards: Hazard[] = [];

  it('renders summary panel', () => {
    render(
      <SummaryPanel
        events={mockEvents}
        filters={mockFilters}
        districts={mockDistricts}
        provinces={mockProvinces}
        sectors={mockSectors}
        hazards={mockHazards}
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
        hazards={mockHazards}
      />
    );

    expect(screen.getByText('$1,000,000')).toBeInTheDocument();
    expect(screen.getByText('50,000')).toBeInTheDocument();
  });

  it('handles missing data gracefully', () => {
    render(
      <SummaryPanel
        events={[]}
        filters={mockFilters}
        districts={[]}
        provinces={[]}
        sectors={[]}
        hazards={mockHazards}
      />
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
        hazards={mockHazards}
      />
    );

    expect(screen.getByText('$1,234,567,890')).toBeInTheDocument();
  });

  it('updates when data prop changes', () => {
    const { rerender } = render(
      <SummaryPanel
        events={mockEvents}
        filters={mockFilters}
        districts={mockDistricts}
        provinces={mockProvinces}
        sectors={mockSectors}
        hazards={mockHazards}
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
        hazards={mockHazards}
      />
    );

    expect(screen.getByText('$2,000,000')).toBeInTheDocument();
  });
});
