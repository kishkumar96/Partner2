import { render, screen, fireEvent } from '@testing-library/react';
import ActiveFilters from '../ActiveFilters';
import type { FilterState, Hazard, Sector } from '../../types';

const MockIcon = () => <svg data-testid="mock-icon" />;

const EMPTY_FILTERS: FilterState = {
  selectedHazards: [],
  selectedSectors: [],
  selectedEvents: [],
  dateRange: { start: '', end: '' },
  aggregationLevel: 'district',
};

const hazards: Hazard[] = [
  {
    id: 'tropical-cyclone',
    name: 'Tropical Cyclone',
    color: '#00aaff',
    icon: MockIcon as any,
  },
  {
    id: 'flood',
    name: 'Flood',
    color: '#0044ff',
    icon: MockIcon as any,
  },
];

const sectors: Sector[] = [
  {
    id: 'AGR',
    name: 'Agriculture',
    color: '#22c55e',
    icon: MockIcon as any,
  },
];

describe('ActiveFilters', () => {
  it('shows no-active-filters state when empty', () => {
    render(
      <ActiveFilters
        filters={EMPTY_FILTERS}
        hazards={hazards}
        sectors={sectors}
        onClearFilter={jest.fn()}
      />
    );

    expect(screen.getByText(/no filters applied/i)).toBeInTheDocument();
  });

  it('renders normalized hazard chip and clears using original selected hazard id', () => {
    const onClearFilter = jest.fn();

    render(
      <ActiveFilters
        filters={{ ...EMPTY_FILTERS, selectedHazards: ['TC'] }}
        hazards={hazards}
        sectors={sectors}
        onClearFilter={onClearFilter}
      />
    );

    const hazardChip = screen.getByRole('button', { name: /tropical cyclone/i });
    expect(hazardChip).toBeInTheDocument();

    fireEvent.click(hazardChip);
    expect(onClearFilter).toHaveBeenCalledWith('hazard', 'TC');
  });

  it('renders fallback chip for unknown hazard ids and keeps it removable', () => {
    const onClearFilter = jest.fn();

    render(
      <ActiveFilters
        filters={{ ...EMPTY_FILTERS, selectedHazards: ['mystery-hazard'] }}
        hazards={hazards}
        sectors={sectors}
        onClearFilter={onClearFilter}
      />
    );

    const fallbackChip = screen.getByRole('button', { name: /hazard: mystery-hazard/i });
    expect(fallbackChip).toBeInTheDocument();

    fireEvent.click(fallbackChip);
    expect(onClearFilter).toHaveBeenCalledWith('hazard', 'mystery-hazard');
  });

  it('clears all filters from clear all button', () => {
    const onClearFilter = jest.fn();

    render(
      <ActiveFilters
        filters={{ ...EMPTY_FILTERS, selectedSectors: ['AGR'] }}
        hazards={hazards}
        sectors={sectors}
        onClearFilter={onClearFilter}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(onClearFilter).toHaveBeenCalledWith('all');
  });
});
