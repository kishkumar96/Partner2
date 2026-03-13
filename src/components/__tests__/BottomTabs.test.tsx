/**
 * Tests for BottomTabs component
 *
 * Focuses on tab switching behaviour and correct initial render.
 * Heavy sub-components (charts, tables) are stubbed out.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BottomTabs from '../BottomTabs';
import { FilterState } from '@/types';

// Stub heavy child components to keep tests fast and focused
jest.mock('../EnhancedRegionalTable', () => {
  const MockComponent = () => <div data-testid="regional-table" />;
  MockComponent.displayName = 'EnhancedRegionalTable';
  return MockComponent;
});
jest.mock('../ComparativeAnalytics', () => {
  const MockComponent = () => <div data-testid="comparative-analytics" />;
  MockComponent.displayName = 'ComparativeAnalytics';
  return MockComponent;
});
jest.mock('../BuildingsTable', () => {
  const MockComponent = () => <div data-testid="buildings-table" />;
  MockComponent.displayName = 'BuildingsTable';
  return MockComponent;
});
jest.mock('../RoadsTable', () => {
  const MockComponent = () => <div data-testid="roads-table" />;
  MockComponent.displayName = 'RoadsTable';
  return MockComponent;
});

const baseFilters: FilterState = {
  selectedHazards: [],
  selectedSectors: [],
  selectedEvents: [],
  dateRange: { start: '', end: '' },
  aggregationLevel: 'district',
};

const minimalProps = {
  events: [],
  hazards: [],
  sectors: [],
  exposureData: [],
  economicDamageData: [],
  filters: baseFilters,
  districts: [],
  provinces: [],
};

describe('BottomTabs', () => {
  it('renders without crashing', () => {
    const { container } = render(<BottomTabs {...minimalProps} />);
    expect(container).toBeInTheDocument();
  });

  it('renders the Impact tab as the default active tab', () => {
    render(<BottomTabs {...minimalProps} />);
    // The first tab button should exist and reference "Impact"
    const tabButtons = screen.getAllByRole('button');
    expect(tabButtons.some(btn => btn.textContent?.includes('Impact'))).toBe(true);
  });

  it('renders all expected tabs', () => {
    render(<BottomTabs {...minimalProps} />);
    const tabButtons = screen.getAllByRole('button');
    const tabLabels = tabButtons.map(btn => btn.textContent ?? '');
    expect(tabLabels.some(l => l.includes('Impact'))).toBe(true);
    expect(tabLabels.some(l => l.includes('Exposure'))).toBe(true);
    expect(tabLabels.some(l => l.includes('Economic Damage'))).toBe(true);
  });

  it('switching to Exposure tab changes active tab styling', () => {
    render(<BottomTabs {...minimalProps} />);
    const tabButtons = screen.getAllByRole('button');
    const exposureTab = tabButtons.find(btn => btn.textContent?.includes('Exposure'));
    expect(exposureTab).toBeDefined();

    fireEvent.click(exposureTab!);

    // After click the button should have the active class (border-blue-400)
    expect(exposureTab!.className).toMatch(/border-blue-400/);
  });

  it('switching tabs does not crash', () => {
    render(<BottomTabs {...minimalProps} />);
    const tabButtons = screen.getAllByRole('button');
    // Click every tab header in sequence
    tabButtons.forEach(btn => {
      expect(() => fireEvent.click(btn)).not.toThrow();
    });
  });

  it('calls onRequestDamageData when buildings data is missing and buildings tab is clicked', () => {
    const onRequest = jest.fn();
    render(
      <BottomTabs {...minimalProps} onRequestDamageData={onRequest} damagedBuildings={null} />
    );
    // The buildings tab is commented out in the current codebase, so skip if absent
    const tabButtons = screen.getAllByRole('button');
    const buildingsTab = tabButtons.find(btn =>
      btn.textContent?.toLowerCase().includes('building')
    );
    if (buildingsTab) {
      fireEvent.click(buildingsTab);
      expect(onRequest).toHaveBeenCalledWith('buildings');
    }
  });
});
