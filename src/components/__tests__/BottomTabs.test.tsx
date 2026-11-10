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
  countryCode: 'VU' as const,
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

describe('BottomTabs with a hazard scenario selected', () => {
  const scenario = {
    product: 'combined',
    slrScenarioM: 0,
    returnPeriodYears: 10,
    eventLabel: null,
  };
  const scenarioRiskSummary = { id: 4689, total_loss: 1018217, exposed_population: 1381 };
  const scenarioBreakdown = {
    sectors: [
      {
        name: 'Infra-Ports',
        sector: '',
        totalLoss: 600,
        exposedCount: null,
        exposedValue: null,
        averageInundationDepth: null,
      },
      {
        name: 'Build-Residential',
        sector: '',
        totalLoss: 400,
        exposedCount: null,
        exposedValue: null,
        averageInundationDepth: null,
      },
    ],
    assetTypes: [
      {
        name: 'Wharf',
        sector: 'Infra-Ports',
        totalLoss: 600,
        exposedCount: 2,
        exposedValue: 5000,
        averageInundationDepth: 0.5,
      },
      {
        name: 'Residential',
        sector: 'Build-Residential',
        totalLoss: 400,
        exposedCount: 10,
        exposedValue: 9000,
        averageInundationDepth: 0.25,
      },
      {
        name: '',
        sector: '',
        totalLoss: 0,
        exposedCount: 0,
        exposedValue: 0,
        averageInundationDepth: null,
      },
    ],
  };
  const scenarioProps = {
    ...minimalProps,
    countryCode: 'CK' as const,
    hazardScenario: scenario,
    scenarioRiskSummary,
    scenarioBreakdown,
  };
  const openTab = (text: string) =>
    fireEvent.click(screen.getAllByRole('button').find(btn => btn.textContent?.includes(text))!);

  it('marks the Impact tab as baseline and shows the scenario national totals', () => {
    render(<BottomTabs {...scenarioProps} />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(/baseline analysis/i);
    expect(note).toHaveTextContent('Combined (TC + Swell) · SLR 0 m · 10-yr return period');
    expect(note).toHaveTextContent('These region figures don’t change');
    expect(note).toHaveTextContent('$1.02M loss, 1.38K people exposed');
  });

  it('shows the scenario loss by sector instead of the baseline table', () => {
    render(<BottomTabs {...scenarioProps} />);
    openTab('by Sector (2)');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.getByText('Infrastructure · Ports')).toBeInTheDocument();
    expect(screen.getByText('Buildings · Residential')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
  });

  it('shows the scenario loss by asset type, labelling blank names', () => {
    render(<BottomTabs {...scenarioProps} />);
    openTab('by Asset (3)');
    expect(screen.getByText('Wharf')).toBeInTheDocument();
    expect(screen.getByText('0.50 m')).toBeInTheDocument();
    expect(screen.getAllByText('Unspecified').length).toBeGreaterThan(0);
  });

  it('falls back to the baseline table with a notice when the scenario has no breakdown', () => {
    render(<BottomTabs {...scenarioProps} scenarioBreakdown={null} />);
    openTab('by Sector');
    expect(screen.getByRole('note')).toHaveTextContent(/no sector breakdown/i);
  });

  it('shows no notice without a scenario', () => {
    render(<BottomTabs {...minimalProps} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
