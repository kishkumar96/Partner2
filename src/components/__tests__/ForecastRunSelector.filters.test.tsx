import { fireEvent, render, screen, within } from '@testing-library/react';
import ForecastRunSelector from '../ForecastRunSelector';
import type { ForecastRun } from '@/utils/forecastRuns';

const NOW = Date.parse('2026-10-20T12:00:00Z');

const run = (storm: string, issued: string, extra: Partial<ForecastRun> = {}): ForecastRun => ({
  id: `${storm}-${issued}`,
  storm,
  cycloneName: `${issued.replace(/\D/g, '').slice(0, 10)}_${storm}`,
  issuedAt: issued,
  isLatest: false,
  status: 'complete',
  ...extra,
});

const RUNS = [
  run('Wati', '2026-10-19T12:00:00Z', { isLatest: true }),
  run('Wati', '2026-10-19T06:00:00Z', { status: 'failed' }),
  run('Harold', '2026-04-02T00:00:00Z', { isLatest: true }),
  run('Lola', '2025-10-24T12:00:00Z', { isLatest: true }),
  run('Pam', '2025-03-12T06:00:00Z', { isLatest: true }),
];

const WATI_LATEST = RUNS[0].id;

function renderSelector(overrides: Partial<Parameters<typeof ForecastRunSelector>[0]> = {}) {
  const onSelect = jest.fn();
  render(
    <ForecastRunSelector
      runs={RUNS}
      activeRunId={WATI_LATEST}
      onSelect={onSelect}
      now={NOW}
      {...overrides}
    />
  );
  return { onSelect };
}

const stormButtons = () =>
  within(screen.getByTestId('storm-selector'))
    .getAllByRole('button', { hidden: true })
    .map(button => button.textContent);

describe('ForecastRunSelector storm filters', () => {
  it('shows no filters while there are only a few storms and every run has results', () => {
    renderSelector({ runs: RUNS.slice(0, 1).concat(RUNS.slice(2, 4)) });
    expect(screen.queryByTestId('storm-filters')).not.toBeInTheDocument();
  });

  it('offers search, status and dates once there are four storms', () => {
    renderSelector();
    expect(screen.getByRole('searchbox', { name: 'Search storms' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Storm status' })).toBeInTheDocument();
    expect(screen.getByLabelText('Issued from')).toBeInTheDocument();
    expect(screen.getByLabelText('Issued to')).toBeInTheDocument();
  });

  it('finds a storm by name and says how many are shown', () => {
    renderSelector();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search storms' }), {
      target: { value: 'lol' },
    });
    // Wati stays listed because it is the forecast on screen
    expect(stormButtons().join(' ')).toContain('Lola');
    expect(stormButtons().join(' ')).not.toContain('Harold');
    expect(screen.getByTestId('storm-filter-count')).toHaveTextContent('Showing 2 of 4 storms');
  });

  it('narrows to past storms, and keeps the storm on screen listed', () => {
    renderSelector();
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Storm status' })).getByRole('button', {
        name: 'Past',
      })
    );
    const labels = stormButtons().join(' ');
    expect(labels).toContain('Harold');
    expect(labels).toContain('Wati');
  });

  it('never changes the advisory by itself when a filter changes', () => {
    const { onSelect } = renderSelector();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search storms' }), {
      target: { value: 'pam' },
    });
    fireEvent.change(screen.getByLabelText('Issued from'), { target: { value: '2026-01-01' } });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('filters by the dates an advisory was issued', () => {
    renderSelector();
    fireEvent.change(screen.getByLabelText('Issued from'), { target: { value: '2025-10-01' } });
    fireEvent.change(screen.getByLabelText('Issued to'), { target: { value: '2025-12-31' } });
    const labels = stormButtons().join(' ');
    expect(labels).toContain('Lola');
    expect(labels).not.toContain('Pam');
    expect(labels).not.toContain('Harold');
  });

  it('hides advisories without results when asked, but not the one on screen', () => {
    renderSelector({ activeRunId: RUNS[1].id });
    const list = () => within(screen.getByRole('list')).getAllByRole('button');
    expect(list()).toHaveLength(2);
    fireEvent.click(screen.getByLabelText('Only advisories with results'));
    // the failed advisory is the one being viewed, so it stays
    expect(list()).toHaveLength(2);
  });

  it('drops an advisory without results when it is not the one on screen', () => {
    renderSelector();
    expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByLabelText('Only advisories with results'));
    expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(1);
  });

  it('clears every filter at once', () => {
    renderSelector();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search storms' }), {
      target: { value: 'lol' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.queryByTestId('storm-filter-count')).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search storms' })).toHaveValue('');
    expect(stormButtons().join(' ')).toContain('Pam');
  });

  it('offers the results filter on its own for a single storm with a failed advisory', () => {
    renderSelector({ runs: RUNS.slice(0, 2) });
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Only advisories with results')).toBeInTheDocument();
  });

  it('gives every control a tap target of at least 44px', () => {
    renderSelector();
    const controls = [
      screen.getByRole('searchbox', { name: 'Search storms' }),
      screen.getByLabelText('Issued from'),
      screen.getByLabelText('Issued to'),
      ...within(screen.getByRole('group', { name: 'Storm status' })).getAllByRole('button'),
    ];
    for (const control of controls) expect(control.className).toContain('min-h-[44px]');
  });
});
