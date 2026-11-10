/**
 * Hazard Scenario section of MapPanel: selection carries over between
 * product/SLR changes, options are ordered sensibly, and the controls
 * expose their state to assistive tech.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import MapPanel from '../MapPanel';
import type { HazardScenarioSelection, RealWMSLayer } from '@/data/realThreddsLayers';

const layer = (scenario: HazardScenarioSelection) =>
  ({ id: JSON.stringify(scenario), hazardScenario: scenario }) as unknown as RealWMSLayer;

const probabilistic = (product: string, slrs: number[], periods: number[]) =>
  slrs.flatMap(slr =>
    periods.map(rp =>
      layer({ product, slrScenarioM: slr, returnPeriodYears: rp, eventLabel: null })
    )
  );

const LAYERS = [
  ...probabilistic('combined', [0, 0.5, 1], [10, 100, 500]),
  ...probabilistic('tc', [0, 1], [10, 100]),
  // swell has no 100-yr scenario at 0.5 m
  ...probabilistic('swell', [0, 0.5], [10, 25]),
  ...['02-Jan-1995', '01-Mar-1987', '16-Feb-2005'].map(label =>
    layer({
      product: 'historical_tcs',
      slrScenarioM: 0,
      returnPeriodYears: null,
      eventLabel: label,
    })
  ),
];

function renderPanel(selection: HazardScenarioSelection) {
  const onChange = jest.fn();
  render(
    <MapPanel
      hazardScenarioLayers={LAYERS}
      hazardScenarioSelection={selection}
      onHazardScenarioChange={onChange}
      onInundationLayerToggle={() => {}}
      showInundationLayer
    />
  );
  return onChange;
}

const select = (label: RegExp) => screen.getByLabelText(label) as HTMLSelectElement;

describe('MapPanel hazard scenario selection', () => {
  const combined100 = {
    product: 'combined',
    slrScenarioM: 0,
    returnPeriodYears: 100,
    eventLabel: null,
  };

  it('keeps the return period when sea level rise changes', () => {
    const onChange = renderPanel(combined100);
    fireEvent.change(select(/sea level rise/i), { target: { value: '1' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...combined100, slrScenarioM: 1 });
  });

  it('keeps SLR and return period when the product changes and has them', () => {
    const onChange = renderPanel({ ...combined100, slrScenarioM: 1 });
    fireEvent.change(select(/^product$/i), { target: { value: 'tc' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...combined100, product: 'tc', slrScenarioM: 1 });
  });

  it('falls back to the first available option when the new product lacks them', () => {
    const onChange = renderPanel({ ...combined100, slrScenarioM: 1 });
    fireEvent.change(select(/^product$/i), { target: { value: 'swell' } });
    expect(onChange).toHaveBeenLastCalledWith({
      product: 'swell',
      slrScenarioM: 0,
      returnPeriodYears: 10,
      eventLabel: null,
    });
  });

  it('lists historical events chronologically', () => {
    renderPanel({
      product: 'historical_tcs',
      slrScenarioM: 0,
      returnPeriodYears: null,
      eventLabel: '02-Jan-1995',
    });
    const options = Array.from(select(/^event$/i).options).map(o => o.textContent);
    expect(options).toEqual(['Event 01-Mar-1987', 'Event 02-Jan-1995', 'Event 16-Feb-2005']);
  });
});

describe('MapPanel hazard scenario accessibility', () => {
  it('exposes the section as a heading whose button reports expanded state', () => {
    renderPanel({ product: 'combined', slrScenarioM: 0, returnPeriodYears: 10, eventLabel: null });
    const heading = screen.getByRole('heading', { name: 'Hazard Scenario' });
    const toggle = within(heading).getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('marks the active scenario type as pressed', () => {
    renderPanel({ product: 'combined', slrScenarioM: 0, returnPeriodYears: 10, eventLabel: null });
    const group = screen.getByRole('group', { name: 'Scenario type' });
    expect(within(group).getByRole('button', { name: /probabilistic/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(group).getByRole('button', { name: /historical/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });
});

describe('MapPanel loss curve', () => {
  const curve = {
    points: [0, 0.5, 1].flatMap(slr =>
      [10, 100, 500].map(rp => ({
        slrScenarioM: slr,
        returnPeriodYears: rp,
        totalLoss: (1 + slr) * rp * 1000,
        exposedPopulation: 100,
      }))
    ),
    annualAverageLoss: [{ slrScenarioM: 0, totalLoss: 400 }],
  };

  it('selects a scenario from a point on the curve', () => {
    const onChange = jest.fn();
    render(
      <MapPanel
        hazardScenarioLayers={LAYERS}
        hazardScenarioSelection={{
          product: 'combined',
          slrScenarioM: 0,
          returnPeriodYears: 10,
          eventLabel: null,
        }}
        hazardScenarioCurve={curve}
        onHazardScenarioChange={onChange}
        onInundationLayerToggle={() => {}}
        showInundationLayer
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /1-in-500-year, \+0\.5 m/i }));
    expect(onChange).toHaveBeenLastCalledWith({
      product: 'combined',
      slrScenarioM: 0.5,
      returnPeriodYears: 500,
      eventLabel: null,
    });
    // The dropdowns stay as a keyboard / screen reader alternative
    expect(screen.getByRole('combobox', { name: 'Return period' })).toBeInTheDocument();
  });

  it('shows no curve for event-based products', () => {
    render(
      <MapPanel
        hazardScenarioLayers={LAYERS}
        hazardScenarioSelection={{
          product: 'historical_tcs',
          slrScenarioM: 0,
          returnPeriodYears: null,
          eventLabel: '02-Jan-1995',
        }}
        hazardScenarioCurve={curve}
        onInundationLayerToggle={() => {}}
        showInundationLayer
      />
    );
    expect(screen.queryByText('Expected annual loss')).not.toBeInTheDocument();
  });
});

describe('MapPanel basemap', () => {
  it('lets the user switch basemap from Map Controls', () => {
    const onBasemapChange = jest.fn();
    render(
      <MapPanel
        basemapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        onBasemapChange={onBasemapChange}
      />
    );
    const toggle = within(screen.getByRole('heading', { name: /^Basemap/ })).getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('Light');

    fireEvent.click(toggle);
    const group = screen.getByRole('group', { name: 'Basemap' });
    expect(within(group).getByRole('button', { name: /light/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(within(group).getByRole('button', { name: /dark/i }));
    expect(onBasemapChange).toHaveBeenCalledWith(
      'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
    );
  });
});
