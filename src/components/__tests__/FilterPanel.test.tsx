/**
 * Tests for FilterPanel Component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import FilterPanel from '../FilterPanel';
import type { FilterState, Hazard, Sector, ExposureData } from '../../types';

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Minimal icon stub that satisfies the LucideIcon signature */
const MockIcon = () => <svg data-testid="mock-icon" />;

const EMPTY_FILTERS: FilterState = {
  selectedHazards: [],
  selectedSectors: [],
  selectedEvents: [],
  dateRange: { start: '', end: '' },
  aggregationLevel: 'district',
};

const sampleHazards: Hazard[] = [
  { id: 'TC', name: 'Tropical Cyclone', color: '#00aaff', icon: MockIcon as any },
  { id: 'FL', name: 'Flood',            color: '#0044ff', icon: MockIcon as any },
];

const sampleSectors: Sector[] = [
  { id: 'AGR', name: 'Agriculture', color: '#22c55e', icon: MockIcon as any },
  { id: 'HSG', name: 'Housing',     color: '#f59e0b', icon: MockIcon as any },
];

/**
 * ExposureData that makes sampleSectors "available".
 * FilterPanel derives activeSectorIds from exposureData.sectorId, not from events.
 */
const sampleExposureData: ExposureData[] = [
  { id: 'ex1', hazardId: 'TC', sectorId: 'AGR', population: 1000, assets: 500, infrastructure: 200 },
  { id: 'ex2', hazardId: 'FL', sectorId: 'HSG', population: 800, assets: 400, infrastructure: 100 },
];

/**
 * Events that make sampleHazards "available" (activeHazardIds is derived from events).
 */
const sampleEvents = [
  {
    id: 'e1', name: 'TC Lola', date: '2023-10-01', hazardId: 'TC',
    totalAffectedPopulation: 1000, totalEconomicDamage: 5_000_000,
    affectedRegions: 3, severity: 'high' as const,
    location: { lat: -15, lng: 167 },
  },
  {
    id: 'e2', name: 'Flood 2024', date: '2024-03-01', hazardId: 'FL',
    totalAffectedPopulation: 500, totalEconomicDamage: 2_000_000,
    affectedRegions: 1, severity: 'medium' as const,
    location: { lat: -15, lng: 167 },
    sectorId: 'AGR',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderPanel(filterOverrides: Partial<FilterState> = {}, onFilterChange = jest.fn()) {
  const filters = { ...EMPTY_FILTERS, ...filterOverrides };
  render(
    <FilterPanel
      hazards={sampleHazards}
      sectors={sampleSectors}
      events={sampleEvents}
      districts={[]}
      filters={filters}
      onFilterChange={onFilterChange}
      exposureData={sampleExposureData}
    />
  );
  return { onFilterChange };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FilterPanel Component', () => {
  beforeEach(() => jest.clearAllMocks());

  // 1. Basic render
  it('renders the filter panel container', () => {
    renderPanel();
    expect(screen.getByText(/filter/i)).toBeInTheDocument();
  });

  // 2. Real options rendered from props (hazards section is expanded by default)
  it('displays hazard options sourced from the hazards prop', () => {
    renderPanel();
    // Both hazard NAMES must appear as checkbox labels.
    // Use anchored regex so we match "Flood" (hazard label) but not
    // "Select Flood 2024" (event checkbox aria-label).
    expect(screen.getByRole('checkbox', { name: /tropical cyclone/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^flood$/i })).toBeInTheDocument();
  });

  it('displays sector options sourced from the sectors prop after expanding the Sectors section', () => {
    renderPanel();
    // Sectors section is collapsed by default – expand it first
    fireEvent.click(screen.getByRole('button', { name: /sectors/i }));
    expect(screen.getByRole('checkbox', { name: /agriculture/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /housing/i })).toBeInTheDocument();
  });

  // 3. Hazard toggle – specific payload assertion
  it('calls onFilterChange with the checked hazard when a hazard checkbox is toggled on', () => {
    const { onFilterChange } = renderPanel({ selectedHazards: [] });

    fireEvent.click(screen.getByRole('checkbox', { name: /tropical cyclone/i }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ selectedHazards: ['TC'] })
    );
  });

  it('calls onFilterChange with the hazard removed when a selected hazard is toggled off', () => {
    // Start with TC already selected
    const { onFilterChange } = renderPanel({ selectedHazards: ['TC'] });

    fireEvent.click(screen.getByRole('checkbox', { name: /tropical cyclone/i }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ selectedHazards: [] })
    );
  });

  // 4. Sector toggle
  it('calls onFilterChange with the checked sector when a sector checkbox is toggled on', () => {
    const { onFilterChange } = renderPanel({ selectedSectors: [] });

    // expand
    fireEvent.click(screen.getByRole('button', { name: /sectors/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /agriculture/i }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ selectedSectors: ['AGR'] })
    );
  });

  // 5. Aggregation level change
  it('calls onFilterChange with the new aggregation level when a radio is selected', () => {
    const { onFilterChange } = renderPanel({ aggregationLevel: 'district' });

    // Aggregation section starts collapsed – expand it
    fireEvent.click(screen.getByRole('button', { name: /aggregation/i }));
    fireEvent.click(screen.getByRole('radio', { name: /province/i }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ aggregationLevel: 'province' })
    );
  });

  // 6. Reset – starting from a non-empty state
  it('resets filters to defaults when "Clear all filters" is clicked from a non-empty state', () => {
    const { onFilterChange } = renderPanel({
      selectedHazards: ['TC'],
      selectedSectors: ['AGR'],
      selectedEvents: ['e1'],
      dateRange: { start: '2023-01-01', end: '2023-12-31' },
      aggregationLevel: 'province',
    });

    fireEvent.click(screen.getByRole('button', { name: /clear all filters/i }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({
      selectedHazards: [],
      selectedSectors: [],
      selectedEvents: [],
      dateRange: { start: '', end: '' },
      aggregationLevel: 'district',
    });
  });
});
