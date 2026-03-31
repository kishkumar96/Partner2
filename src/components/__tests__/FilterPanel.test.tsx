/**
 * Tests for FilterPanel Component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import FilterPanel from '../FilterPanel';
import type { FilterState, Hazard, Sector, ExposureData } from '../../types';
import type { Event } from '@/types';

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
  { id: 'tropical-cyclone', name: 'Tropical Cyclone', color: '#00aaff', icon: MockIcon as any },
  { id: 'flood', name: 'Flood', color: '#0044ff', icon: MockIcon as any },
];

const sampleSectors: Sector[] = [
  { id: 'AGR', name: 'Agriculture', color: '#22c55e', icon: MockIcon as any },
  { id: 'HSG', name: 'Housing', color: '#f59e0b', icon: MockIcon as any },
];

/**
 * ExposureData that makes sampleSectors "available".
 * FilterPanel derives activeSectorIds from exposureData.sectorId, not from events.
 */
const sampleExposureData: ExposureData[] = [
  {
    id: 'ex1',
    hazardId: 'tropical-cyclone',
    sectorId: 'AGR',
    population: 1000,
    assets: 500,
    infrastructure: 200,
  },
  {
    id: 'ex2',
    hazardId: 'flood',
    sectorId: 'HSG',
    population: 800,
    assets: 400,
    infrastructure: 100,
  },
];

/**
 * Events that make sampleHazards "available" (activeHazardIds is derived from events).
 */
const sampleEvents: Event[] = [
  {
    id: 'e1',
    name: 'TC Lola',
    date: '2023-10-01',
    hazardId: 'tropical-cyclone',
    totalAffectedPopulation: 1000,
    totalEconomicDamage: 5_000_000,
    affectedRegions: 3,
    severity: 'high' as const,
    location: { lat: -15, lng: 167 },
  },
  {
    id: 'e2',
    name: 'Flood 2024',
    date: '2024-03-01',
    hazardId: 'flood',
    totalAffectedPopulation: 500,
    totalEconomicDamage: 2_000_000,
    affectedRegions: 1,
    severity: 'medium' as const,
    location: { lat: -15, lng: 167 },
    sectorId: 'AGR',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderPanel(
  filterOverrides: Partial<FilterState> = {},
  onFilterChange = jest.fn(),
  options?: { events?: Event[]; hazards?: Hazard[] }
) {
  const filters = { ...EMPTY_FILTERS, ...filterOverrides };
  render(
    <FilterPanel
      hazards={options?.hazards ?? sampleHazards}
      sectors={sampleSectors}
      events={options?.events ?? sampleEvents}
      districts={[]}
      countryCode="VU"
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
    expect(screen.getByRole('heading', { level: 2, name: /filters/i })).toBeInTheDocument();
  });

  // 2. Real options rendered from props (hazards are in the advanced section)
  it('displays hazard options sourced from the hazards prop', () => {
    renderPanel();
    // Expand advanced filters first
    fireEvent.click(screen.getByRole('button', { name: /show advanced filters/i }));
    // Expand hazards section (collapsed by default)
    fireEvent.click(screen.getByRole('button', { name: /hazards/i }));
    // Both hazard NAMES must appear as checkbox labels.
    // Use anchored regex so we match "Flood" (hazard label) but not
    // "Select Flood 2024" (event checkbox aria-label).
    expect(screen.getByRole('checkbox', { name: /tropical cyclone/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^flood$/i })).toBeInTheDocument();
  });

  it('displays sector options sourced from the sectors prop (sectors section is expanded by default)', () => {
    renderPanel();
    // Sectors section is expanded by default - no need to click
    expect(screen.getByRole('checkbox', { name: /agriculture/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /housing/i })).toBeInTheDocument();
  });

  // 3. Hazard toggle – specific payload assertion
  it('calls onFilterChange with the checked hazard when a hazard checkbox is toggled on', () => {
    const { onFilterChange } = renderPanel({ selectedHazards: [] });

    // Expand advanced filters and hazards section
    fireEvent.click(screen.getByRole('button', { name: /show advanced filters/i }));
    fireEvent.click(screen.getByRole('button', { name: /hazards/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /tropical cyclone/i }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ selectedHazards: ['tropical-cyclone'] })
    );
  });

  it('calls onFilterChange with the hazard removed when a selected hazard is toggled off', () => {
    // Start with TC already selected
    const { onFilterChange } = renderPanel({ selectedHazards: ['tropical-cyclone'] });

    // Expand advanced filters and hazards section
    fireEvent.click(screen.getByRole('button', { name: /show advanced filters/i }));
    fireEvent.click(screen.getByRole('button', { name: /hazards/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /tropical cyclone/i }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ selectedHazards: [] }));
  });

  // 4. Sector toggle
  it('calls onFilterChange with the checked sector when a sector checkbox is toggled on', () => {
    const { onFilterChange } = renderPanel({ selectedSectors: [] });

    // Sectors section is expanded by default - no need to click
    fireEvent.click(screen.getByRole('checkbox', { name: /agriculture/i }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ selectedSectors: ['AGR'] })
    );
  });

  // 5. Aggregation level change
  it('calls onFilterChange with the new aggregation level when a radio is selected', () => {
    const { onFilterChange } = renderPanel({ aggregationLevel: 'district' });

    // Expand advanced filters section first, then aggregation section
    fireEvent.click(screen.getByRole('button', { name: /show advanced filters/i }));
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
      selectedHazards: ['tropical-cyclone'],
      selectedSectors: ['AGR'],
      selectedEvents: ['e1'],
      dateRange: { start: '2023-01-01', end: '2023-12-31' },
      aggregationLevel: 'province',
    });

    // Expand advanced filters section first
    fireEvent.click(screen.getByRole('button', { name: /show advanced filters/i }));
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

  it('auto-corrects the date range when the end date is set before the start date', () => {
    const { onFilterChange } = renderPanel({
      dateRange: { start: '2024-12-31', end: '2024-12-31' },
    });

    // Temporal section is expanded by default - no need to click
    fireEvent.change(screen.getByLabelText(/to date/i), {
      target: { value: '2024-01-01' },
    });

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dateRange: { start: '2024-01-01', end: '2024-01-01' },
      })
    );
  });

  it('keeps flood available when events use inundation hazard id', () => {
    const aliasEvents = [
      {
        id: 'e-inundation',
        name: 'Inundation Event',
        date: '2024-02-01',
        hazardId: 'inundation',
        totalAffectedPopulation: 100,
        totalEconomicDamage: 1000,
        affectedRegions: 1,
        severity: 'medium' as const,
        location: { lat: -15, lng: 167 },
      },
    ];

    renderPanel({}, jest.fn(), { events: aliasEvents });

    // Expand advanced filters and hazards section
    fireEvent.click(screen.getByRole('button', { name: /show advanced filters/i }));
    fireEvent.click(screen.getByRole('button', { name: /hazards/i }));

    const floodCheckbox = screen.getByRole('checkbox', { name: /^flood$/i });
    expect(floodCheckbox).not.toBeDisabled();
  });
});
