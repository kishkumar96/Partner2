/**
 * The Forecast advisory section of MapPanel (the left panel): which track
 * issue time the dashboard shows.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import MapPanel from '../MapPanel';
import type { ForecastRun } from '@/utils/forecastRuns';

const runs: ForecastRun[] = [
  { id: '15', cycloneName: '2026101718_Wati', issuedAt: '2026-10-17T18:00:00Z', isLatest: true },
  { id: '14', cycloneName: '2026101712_Wati', issuedAt: '2026-10-17T12:00:00Z', isLatest: false },
];

describe('MapPanel forecast advisory section', () => {
  it('lists the advisories in the left panel and reports a pick', () => {
    const onForecastRunSelect = jest.fn();
    render(
      <MapPanel
        forecastRuns={runs}
        activeForecastRunId="15"
        onForecastRunSelect={onForecastRunSelect}
      />
    );
    const section = screen.getByTestId('forecast-advisory-section');
    expect(within(section).getByText('Forecast advisory')).toBeInTheDocument();
    expect(section).toHaveTextContent('2026-10-17 18:00 UTC');
    fireEvent.click(within(section).getByRole('button', { name: /2026-10-17 12:00 UTC/ }));
    expect(onForecastRunSelect).toHaveBeenCalledWith('14');
  });

  it('summarises the active advisory when collapsed', () => {
    render(
      <MapPanel forecastRuns={runs} activeForecastRunId="14" onForecastRunSelect={jest.fn()} />
    );
    const section = screen.getByTestId('forecast-advisory-section');
    fireEvent.click(within(section).getByRole('button', { name: /Forecast advisory/ }));
    expect(screen.queryByRole('button', { name: /2026-10-17 18:00 UTC/ })).toBeNull();
    expect(section).toHaveTextContent('2026-10-17 12:00 UTC');
  });

  it('is absent when there are fewer than two advisories, or no handler', () => {
    const { rerender } = render(
      <MapPanel forecastRuns={[runs[0]]} onForecastRunSelect={jest.fn()} />
    );
    expect(screen.queryByTestId('forecast-advisory-section')).toBeNull();
    rerender(<MapPanel forecastRuns={runs} />);
    expect(screen.queryByTestId('forecast-advisory-section')).toBeNull();
  });
});
