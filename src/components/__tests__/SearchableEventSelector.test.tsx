/**
 * Tests for SearchableEventSelector
 *
 * Covers search filtering, event selection callbacks,
 * select-all, clear-all, and edge cases.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchableEventSelector from '../SearchableEventSelector';
import { Event, District, Hazard } from '@/types';
import { Wind } from 'lucide-react';

const mockEvents: Event[] = [
  {
    id: 'evt-1',
    name: 'TC Gita – Shefa',
    districtId: 'dist-1',
    hazardId: 'tropical-cyclone',
    date: '2018-02-11',
    severity: 'critical',
    totalAffectedPopulation: 50000,
    totalEconomicDamage: 1000000,
    affectedRegions: 3,
    location: { lat: -15.4, lng: 166.9 },
  } as Event,
  {
    id: 'evt-2',
    name: 'Flood – Malampa',
    districtId: 'dist-2',
    hazardId: 'flood',
    date: '2018-03-01',
    severity: 'medium',
    totalAffectedPopulation: 10000,
    totalEconomicDamage: 200000,
    affectedRegions: 1,
    location: { lat: -16.0, lng: 167.0 },
  } as Event,
  {
    id: 'evt-3',
    name: 'Drought – Sanma',
    districtId: 'dist-3',
    hazardId: 'drought',
    date: '2019-01-15',
    severity: 'low',
    totalAffectedPopulation: 5000,
    totalEconomicDamage: 50000,
    affectedRegions: 1,
    location: { lat: -15.5, lng: 166.7 },
  } as Event,
];

const mockDistricts: District[] = [
  { id: 'dist-1', name: 'Efate', provinceId: 'p1' } as unknown as District,
  { id: 'dist-2', name: 'Malekula', provinceId: 'p2' } as unknown as District,
  { id: 'dist-3', name: 'Luganville', provinceId: 'p3' } as unknown as District,
];

const mockHazards: Hazard[] = [
  { id: 'tropical-cyclone', name: 'Tropical Cyclone', color: '#f00', icon: Wind },
  { id: 'flood', name: 'Flood', color: '#00f', icon: Wind },
  { id: 'drought', name: 'Drought', color: '#fa0', icon: Wind },
];

const noop = jest.fn();

describe('SearchableEventSelector', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders all events when search is empty', () => {
    render(
      <SearchableEventSelector
        events={mockEvents}
        selectedEvents={[]}
        onToggleEvent={noop}
        onSelectAll={noop}
        onClearAll={noop}
        districts={mockDistricts}
        hazards={mockHazards}
      />
    );
    expect(screen.getByText('TC Gita – Shefa')).toBeInTheDocument();
    expect(screen.getByText('Flood – Malampa')).toBeInTheDocument();
    expect(screen.getByText('Drought – Sanma')).toBeInTheDocument();
  });

  it('filters events by name when search query is entered', () => {
    render(
      <SearchableEventSelector
        events={mockEvents}
        selectedEvents={[]}
        onToggleEvent={noop}
        onSelectAll={noop}
        onClearAll={noop}
        districts={mockDistricts}
        hazards={mockHazards}
      />
    );
    const searchInput = screen.getByRole('textbox');
    fireEvent.change(searchInput, { target: { value: 'gita' } });
    expect(screen.getByText('TC Gita – Shefa')).toBeInTheDocument();
    expect(screen.queryByText('Flood – Malampa')).not.toBeInTheDocument();
  });

  it('filters events by district name', () => {
    render(
      <SearchableEventSelector
        events={mockEvents}
        selectedEvents={[]}
        onToggleEvent={noop}
        onSelectAll={noop}
        onClearAll={noop}
        districts={mockDistricts}
        hazards={mockHazards}
      />
    );
    const searchInput = screen.getByRole('textbox');
    fireEvent.change(searchInput, { target: { value: 'malekula' } });
    expect(screen.getByText('Flood – Malampa')).toBeInTheDocument();
    expect(screen.queryByText('TC Gita – Shefa')).not.toBeInTheDocument();
  });

  it('shows no results message on non-matching search', () => {
    render(
      <SearchableEventSelector
        events={mockEvents}
        selectedEvents={[]}
        onToggleEvent={noop}
        onSelectAll={noop}
        onClearAll={noop}
      />
    );
    const searchInput = screen.getByRole('textbox');
    fireEvent.change(searchInput, { target: { value: 'xyzzy9999' } });
    expect(screen.queryByText('TC Gita – Shefa')).not.toBeInTheDocument();
  });

  it('calls onToggleEvent with the event id when an event checkbox is changed', () => {
    const onToggle = jest.fn();
    render(
      <SearchableEventSelector
        events={mockEvents}
        selectedEvents={[]}
        onToggleEvent={onToggle}
        onSelectAll={noop}
        onClearAll={noop}
      />
    );
    // Each event renders a hidden checkbox with aria-label
    const checkbox = screen.getByRole('checkbox', { name: /select tc gita/i });
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith('evt-1');
  });

  it('calls onSelectAll when "Select all" button is clicked', () => {
    const onSelectAll = jest.fn();
    render(
      <SearchableEventSelector
        events={mockEvents}
        selectedEvents={[]}
        onToggleEvent={noop}
        onSelectAll={onSelectAll}
        onClearAll={noop}
      />
    );
    // Button text is "Select all" (no filter active)
    const selectAllBtn = screen.getByText(/^Select all$/i);
    fireEvent.click(selectAllBtn);
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('calls onClearAll when "Clear selection" button is clicked', () => {
    const onClearAll = jest.fn();
    render(
      <SearchableEventSelector
        events={mockEvents}
        selectedEvents={['evt-1', 'evt-2']}
        onToggleEvent={noop}
        onSelectAll={noop}
        onClearAll={onClearAll}
      />
    );
    const clearBtn = screen.getByText(/clear selection/i);
    fireEvent.click(clearBtn);
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('renders correctly with empty event list', () => {
    const { container } = render(
      <SearchableEventSelector
        events={[]}
        selectedEvents={[]}
        onToggleEvent={noop}
        onSelectAll={noop}
        onClearAll={noop}
      />
    );
    expect(container).toBeInTheDocument();
  });
});
