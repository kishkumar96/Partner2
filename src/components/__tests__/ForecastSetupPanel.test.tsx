import { fireEvent, render, screen, within } from '@testing-library/react';
import ForecastSetupPanel from '../ForecastSetupPanel';
import type { ForecastRun } from '@/utils/forecastRuns';

const run = (issued: string, extra: Partial<ForecastRun> = {}): ForecastRun => ({
  id: `wati-${issued}`,
  storm: 'Wati',
  cycloneName: `${issued.replace(/\D/g, '').slice(0, 10)}_Wati`,
  issuedAt: issued,
  isLatest: false,
  status: 'complete',
  ...extra,
});

const runs = [
  run('2026-10-18T18:00:00Z', { isLatest: true }),
  run('2026-10-18T12:00:00Z'),
  run('2026-10-17T18:00:00Z'),
];

describe('ForecastSetupPanel', () => {
  it('offers the advisories of the forecast and selects the one clicked', () => {
    const onRunSelect = jest.fn();
    render(<ForecastSetupPanel runs={runs} activeRunId={runs[0].id} onRunSelect={onRunSelect} />);

    const panel = screen.getByTestId('forecast-setup-panel');
    expect(screen.getByRole('heading', { name: 'Forecast setup' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /2026-10-18 18:00 UTC/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.click(within(panel).getByRole('button', { name: /2026-10-18 12:00 UTC/ }));
    expect(onRunSelect).toHaveBeenCalledWith(runs[1].id);
  });

  it('shows none of the observed-event filters, which a forecast ignores', () => {
    render(<ForecastSetupPanel runs={runs} activeRunId={runs[0].id} onRunSelect={jest.fn()} />);

    for (const name of [/hazards/i, /sectors/i, /geography/i, /events & time/i, /data filters/i]) {
      expect(screen.queryByRole('heading', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /advanced filters/i })).not.toBeInTheDocument();
  });

  it('says so when there are no advisories, instead of an empty list', () => {
    render(<ForecastSetupPanel runs={[]} onRunSelect={jest.fn()} />);

    expect(screen.getByTestId('forecast-no-advisories')).toHaveTextContent(
      'No forecast advisories'
    );
    expect(screen.queryByTestId('forecast-run-selector')).not.toBeInTheDocument();
  });

  it('opens the forecast layers from its shortcut, and only offers it when it can', () => {
    const onOpenLayers = jest.fn();
    const { rerender } = render(
      <ForecastSetupPanel runs={runs} onRunSelect={jest.fn()} onOpenLayers={onOpenLayers} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Forecast layers/ }));
    expect(onOpenLayers).toHaveBeenCalledTimes(1);

    rerender(<ForecastSetupPanel runs={runs} onRunSelect={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /Forecast layers/ })).not.toBeInTheDocument();
  });
});
