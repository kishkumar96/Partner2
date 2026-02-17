/**
 * Tests for FilterPanel Component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import FilterPanel from '../FilterPanel';
import type { AggregationLevel } from '../../types';

describe('FilterPanel Component', () => {
  const mockOnFilterChange = jest.fn();
  const mockProps = {
    hazards: [],
    sectors: [],
    events: [],
    districts: [],
    filters: {
      selectedHazards: [],
      selectedSectors: [],
      selectedEvents: [],
      dateRange: { start: '', end: '' },
      aggregationLevel: 'district' as AggregationLevel,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders filter panel', () => {
    render(<FilterPanel onFilterChange={mockOnFilterChange} {...mockProps} />);
    expect(screen.getByText(/filter/i)).toBeInTheDocument();
  });

  it('displays filter options', () => {
    render(<FilterPanel onFilterChange={mockOnFilterChange} {...mockProps} />);

    // Verify specific filter-related UI elements are rendered
    expect(screen.getByText(/hazard/i)).toBeInTheDocument();
    expect(screen.getByText(/sector/i)).toBeInTheDocument();
    expect(screen.getByText(/event/i)).toBeInTheDocument();
    expect(screen.getByText(/date/i)).toBeInTheDocument();
  });

  it('calls onFilterChange when filter is applied', () => {
    render(<FilterPanel onFilterChange={mockOnFilterChange} {...mockProps} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(mockOnFilterChange).toHaveBeenCalled();
  });

  it('resets filters when reset button is clicked', () => {
    render(<FilterPanel onFilterChange={mockOnFilterChange} {...mockProps} />);

    const resetButton = screen.getByRole('button', { name: /reset|clear/i });
    fireEvent.click(resetButton);

    expect(mockOnFilterChange).toHaveBeenCalledWith({
      selectedHazards: [],
      selectedSectors: [],
      selectedEvents: [],
      dateRange: { start: '', end: '' },
      aggregationLevel: 'district',
    });
  });
});
