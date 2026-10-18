import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LossCurveSelector, { chanceWithin } from '../LossCurveSelector';
import type { HazardScenarioCurve } from '@/utils/realDataLoader';

// Real Cook Islands Combined (TC + Swell) figures, two SLR levels
const curve: HazardScenarioCurve = {
  points: [
    { slrScenarioM: 0, returnPeriodYears: 10, totalLoss: 1018217, exposedPopulation: 1381 },
    { slrScenarioM: 0, returnPeriodYears: 100, totalLoss: 9429929, exposedPopulation: 2204 },
    { slrScenarioM: 1, returnPeriodYears: 10, totalLoss: 5974000, exposedPopulation: 2600 },
    { slrScenarioM: 1, returnPeriodYears: 100, totalLoss: 27210992, exposedPopulation: 4092 },
  ],
  annualAverageLoss: [
    { slrScenarioM: 0, totalLoss: 407003 },
    { slrScenarioM: 1, totalLoss: 1464547 },
  ],
};

function renderCurve(overrides: Partial<React.ComponentProps<typeof LossCurveSelector>> = {}) {
  const onSelect = jest.fn();
  render(
    <LossCurveSelector
      curve={curve}
      slrScenarioM={1}
      returnPeriodYears={100}
      isAvailable={() => true}
      onSelect={onSelect}
      {...overrides}
    />
  );
  return onSelect;
}

describe('LossCurveSelector', () => {
  it('offers every curve point as a selectable button', () => {
    const onSelect = renderCurve();
    const point = screen.getByRole('button', { name: /1-in-10-year, today/i });
    fireEvent.click(point);
    expect(onSelect).toHaveBeenCalledWith(0, 10);
    fireEvent.keyDown(screen.getByRole('button', { name: /1-in-100-year, \+1 m/i }), {
      key: 'Enter',
    });
    expect(onSelect).toHaveBeenLastCalledWith(1, 100);
  });

  it('marks the selected point as pressed', () => {
    renderCurve();
    expect(screen.getByRole('button', { name: /1-in-100-year, \+1 m/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /1-in-10-year, today/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('does not select points without a map layer', () => {
    const onSelect = renderCurve({ isAvailable: (slr, rp) => !(slr === 0 && rp === 10) });
    const point = screen.getByRole('button', { name: /1-in-10-year, today.*no map layer/i });
    expect(point).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(point);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('states the change against today and the likelihood in plain language', () => {
    renderCurve();
    expect(screen.getByText(/vs today/)).toHaveTextContent('+$17.78M (+189%) vs today');
    expect(screen.getByText(/chance in any year/)).toHaveTextContent(
      '1% chance in any year · 26% chance of at least one in 30 years'
    );
  });

  it('leads with expected annual loss today and at the highest SLR', () => {
    renderCurve();
    expect(screen.getByText('Expected annual loss').parentElement).toHaveTextContent(
      /\$407K\s*today\s*→ \$1\.46M at \+1 m/
    );
  });

  it('computes chance over a horizon assuming independent years', () => {
    expect(chanceWithin(100, 30)).toBeCloseTo(0.26, 2);
    expect(chanceWithin(10, 1)).toBeCloseTo(0.1, 5);
  });
});
