import { fireEvent, render, screen, within } from '@testing-library/react';
import ForecastRunSelector from '../ForecastRunSelector';
import type { ForecastRun } from '@/utils/forecastRuns';

const NOW = Date.parse('2026-10-18T12:00:00Z');

const run = (storm: string, issued: string, extra: Partial<ForecastRun> = {}): ForecastRun => ({
  id: `${storm}-${issued}`,
  storm,
  cycloneName: `${issued.replace(/\D/g, '').slice(0, 10)}_${storm}`,
  issuedAt: issued,
  isLatest: false,
  status: 'complete',
  ...extra,
});

// Six-hourly advisories ending at 06:00Z on the 18th, newest first
const watiAdvisories = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    run('Wati', new Date(Date.UTC(2026, 9, 18, 6) - i * 6 * 3600e3).toISOString(), {
      isLatest: i === 0,
    })
  );

describe('ForecastRunSelector with several storms', () => {
  const runs = [
    ...watiAdvisories(2),
    run('Xavier', '2026-10-18T00:00:00Z', { isLatest: true }),
    run('Xavier', '2026-10-17T12:00:00Z'),
    run('Harold', '2026-10-10T06:00:00Z', { isLatest: true }),
  ];

  it('offers each storm as its own choice and names the active ones', () => {
    render(<ForecastRunSelector runs={runs} onSelect={jest.fn()} now={NOW} />);
    const storms = screen.getByTestId('storm-selector');
    expect(screen.getByTestId('active-storms')).toHaveTextContent('2 active storms: Wati, Xavier');
    expect(within(storms).getByRole('button', { name: 'Wati · 2' })).toBeInTheDocument();
    expect(within(storms).getByRole('button', { name: 'Xavier · 2' })).toBeInTheDocument();
  });

  it('opens a chosen storm on its newest advisory', () => {
    const onSelect = jest.fn();
    render(<ForecastRunSelector runs={runs} onSelect={onSelect} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xavier · 2' }));
    expect(onSelect).toHaveBeenCalledWith('Xavier-2026-10-18T00:00:00Z');
  });

  it("lists only the selected storm's advisories, not an interleaved mix", () => {
    render(
      <ForecastRunSelector
        runs={runs}
        activeRunId="Xavier-2026-10-18T00:00:00Z"
        onSelect={jest.fn()}
        now={NOW}
      />
    );
    const list = screen.getByRole('list');
    expect(list).toHaveTextContent('2026101800_Xavier');
    expect(list).toHaveTextContent('2026101712_Xavier');
    expect(list).not.toHaveTextContent('Wati');
  });

  it('marks the newest advisory of each storm as latest', () => {
    const { rerender } = render(
      <ForecastRunSelector
        runs={runs}
        activeRunId="Xavier-2026-10-18T00:00:00Z"
        onSelect={jest.fn()}
        now={NOW}
      />
    );
    expect(within(screen.getByRole('list')).getAllByText('Latest')).toHaveLength(1);
    rerender(
      <ForecastRunSelector runs={runs} activeRunId={runs[0].id} onSelect={jest.fn()} now={NOW} />
    );
    expect(within(screen.getByRole('list')).getAllByText('Latest')).toHaveLength(1);
  });

  it('keeps a storm with no recent advisory under a collapsed "Past storms"', () => {
    render(
      <ForecastRunSelector
        runs={runs}
        activeRunId="Xavier-2026-10-18T00:00:00Z"
        onSelect={jest.fn()}
        now={NOW}
      />
    );
    const past = screen.getByText('Past storms (1)').closest('details') as HTMLDetailsElement;
    expect(past.open).toBe(false);
    expect(within(past).getByRole('button', { name: 'Harold · 1' })).toBeInTheDocument();
  });

  it('opens the past-storms group when a past storm is the one being shown', () => {
    render(
      <ForecastRunSelector
        runs={runs}
        activeRunId="Harold-2026-10-10T06:00:00Z"
        onSelect={jest.fn()}
        now={NOW}
      />
    );
    const past = screen.getByText('Past storms (1)').closest('details') as HTMLDetailsElement;
    expect(past.open).toBe(true);
  });
});

describe('ForecastRunSelector with one long storm', () => {
  const runs = watiAdvisories(20);

  it('shows no storm choices, and the newest six advisories first', () => {
    render(
      <ForecastRunSelector runs={runs} activeRunId={runs[0].id} onSelect={jest.fn()} now={NOW} />
    );
    expect(screen.queryByTestId('storm-selector')).toBeNull();
    expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(6);
  });

  it('expands to all of them, and back', () => {
    render(
      <ForecastRunSelector runs={runs} activeRunId={runs[0].id} onSelect={jest.fn()} now={NOW} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show all 20 advisories' }));
    expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer advisories' }));
    expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(6);
  });

  it('keeps the chosen advisory on show even when it is an old one', () => {
    const old = runs[19];
    render(<ForecastRunSelector runs={runs} activeRunId={old.id} onSelect={jest.fn()} now={NOW} />);
    const buttons = within(screen.getByRole('list')).getAllByRole('button');
    expect(buttons).toHaveLength(7);
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent('2026-10-13 12:00 UTC');
  });

  it('has no "Show all" for a short list', () => {
    render(<ForecastRunSelector runs={watiAdvisories(4)} onSelect={jest.fn()} now={NOW} />);
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });
});
