import { act, fireEvent, render, screen, within } from '@testing-library/react';
import EventPicker from '../EventPicker';
import { groupForecastRuns, type ForecastRun } from '@/utils/forecastRuns';

const runs: ForecastRun[] = [
  { id: '10', storm: 'Wati', issuedAt: '2026-10-19T12:00:00Z', status: 'complete', isLatest: true },
  {
    id: '10-run-11',
    storm: 'Wati',
    issuedAt: '2026-10-19T00:00:00Z',
    status: 'complete',
    isLatest: false,
  },
];
const observed = [
  { id: '3', name: 'Cyclone Meena', date: '2005-02-01' },
  { id: '9', name: 'Placeholder', date: '' },
];

function renderPicker(onPick = jest.fn()) {
  render(
    <EventPicker
      label="Wati · issued 19 Oct 12:00 UTC"
      stormGroups={groupForecastRuns(runs, Date.parse('2026-11-02T00:00:00Z'))}
      observedEvents={observed}
      activeId="10"
      onPick={onPick}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /Wati · issued/ }));
  return onPick;
}

describe('EventPicker', () => {
  it('lists advisories under their storm, not as separate events, and the observed events', () => {
    renderPicker();
    const dialog = screen.getByRole('dialog', { name: 'Choose an event' });
    const storms = within(dialog).getByRole('region', { name: 'Forecast storms' });
    expect(storms).toHaveTextContent('Wati');
    expect(storms).toHaveTextContent('2 advisories');
    expect(within(storms).getAllByRole('button')).toHaveLength(2);
    expect(within(storms).getByRole('button', { current: true })).toHaveTextContent('Latest');
    const events = within(dialog).getByRole('region', { name: 'Observed events' });
    expect(events).toHaveTextContent('Cyclone Meena');
    expect(events).toHaveTextContent('1 Feb 2005');
    expect(events).toHaveTextContent('date not recorded');
  });

  it('picks an advisory or an event, and closes', () => {
    const onPick = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /19 Oct 00:00/ }));
    expect(onPick).toHaveBeenCalledWith('10-run-11');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('searches by name or year', () => {
    renderPicker();
    fireEvent.change(screen.getByPlaceholderText('Search storms and events'), {
      target: { value: '2005' },
    });
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).queryByRole('region', { name: 'Forecast storms' })
    ).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent('Cyclone Meena');
  });

  it('closes on Escape and marks the key handled, so the side panels stay open', () => {
    renderPicker();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      document.body.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
