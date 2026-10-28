import { act, fireEvent, render, screen } from '@testing-library/react';
import { ForecastExposureSummary } from '../ForecastExposurePanels';
import { WATI_17_OCT, recordFixture } from '@/utils/testing/forecastFixtures';
import type { TimelinePoint } from '@/utils/forecastTimeline';

const KEY = 'ref-forecast-panel-view';
const exposure = WATI_17_OCT();
const event = recordFixture({
  id: '10-run-3',
  trackIssuedTime: '2026-10-17T12:00:00Z',
  backendEventId: '10',
} as never);
const timeline: TimelinePoint[] = [
  {
    id: '10-run-3',
    issuedAt: '2026-10-17T12:00:00Z',
    people: 2622,
    buildings: 5201,
    strongest: 'gale',
  },
  { id: '10', issuedAt: '2026-10-19T12:00:00Z', people: 0, buildings: 0, strongest: null },
];

function panel(extra: Record<string, unknown> = {}, summary: Record<string, unknown> | null = {}) {
  return (
    <ForecastExposureSummary
      exposure={exposure}
      event={event}
      countryName="Cook Islands"
      {...(summary === null
        ? {}
        : { summary: { timeline, latestIssuedAt: '2026-10-19T12:00:00Z', ...summary } })}
      {...extra}
    />
  );
}

beforeEach(() => window.localStorage.clear());

describe('ForecastExposureSummary with the summary view', () => {
  it('opens on the plain-language summary, with Summary and Details tabs', () => {
    render(panel());

    expect(screen.getByTestId('forecast-summary-view')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'forecast-tab-summary');
    // none of the detailed material is on screen yet
    expect(screen.queryByTestId('operational-priorities')).not.toBeInTheDocument();
  });

  it('is the detailed view only, as before, when it is given no summary context', () => {
    render(panel({}, null));

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByTestId('forecast-summary-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('operational-priorities')).toBeInTheDocument();
  });

  it('shows the full details from the Details tab, and remembers the choice', () => {
    const { unmount } = render(panel());
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));

    expect(screen.queryByTestId('forecast-summary-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('operational-priorities')).toBeInTheDocument();
    expect(window.localStorage.getItem(KEY)).toBe('details');

    unmount();
    render(panel());
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('operational-priorities')).toBeInTheDocument();
  });

  it('goes to the details from the button at the bottom of the summary', () => {
    render(panel());
    fireEvent.click(screen.getByRole('button', { name: 'See every affected area in Details →' }));

    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens the explanation, in the details, from "How to read this forecast"', () => {
    render(panel());
    fireEvent.click(screen.getByRole('button', { name: 'How to read this forecast' }));

    expect(screen.getByTestId('forecast-info')).toBeInTheDocument();
  });

  it('shows the details when an area is picked on the map, and the summary tab clears the pick', () => {
    const onRegionClear = jest.fn();
    render(panel({ selectedRegion: 'Aitutaki', onRegionClear }));

    expect(screen.queryByTestId('forecast-summary-view')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Summary' }));
    expect(onRegionClear).toHaveBeenCalledTimes(1);
  });

  it('still opens when the browser blocks storage', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(panel());
    expect(screen.getByTestId('forecast-summary-view')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(screen.getByTestId('operational-priorities')).toBeInTheDocument();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe('ForecastExposureSummary, an advisory that is not the latest', () => {
  it('shows the banner in the summary and in the details, with one button to the latest', () => {
    const onSwitchToLatest = jest.fn();
    render(panel({}, { onSwitchToLatest }));

    expect(screen.getByTestId('advisory-banner')).toHaveAttribute('data-state', 'older');
    // the banner replaces the quiet status line and the old small grey one
    expect(screen.getAllByTestId('advisory-banner')).toHaveLength(1);
    expect(screen.queryByTestId('advisory-age')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to the latest advisory' }));
    expect(onSwitchToLatest).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(screen.getByTestId('advisory-banner')).toHaveAttribute('data-state', 'older');
    expect(screen.queryByTestId('advisory-age')).not.toBeInTheDocument();
  });

  it('leaves the older-advisory notice to the page when the page shows it', () => {
    render(panel({}, { statusShownAbove: true }));

    expect(screen.queryByTestId('advisory-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('advisory-age')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(screen.queryByTestId('advisory-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('advisory-age')).not.toBeInTheDocument();
  });

  it('still shows an aging latest advisory in the panel when the page shows the older notice', () => {
    const staleEvent = recordFixture({
      id: '10',
      trackIssuedTime: '2020-01-01T00:00:00Z',
    } as never);
    render(
      panel(
        { event: staleEvent },
        { statusShownAbove: true, latestIssuedAt: '2020-01-01T00:00:00Z' }
      )
    );

    expect(screen.getByTestId('advisory-banner')).toHaveAttribute('data-state', 'aging');
  });

  it('keeps the original age line in the details when this is the latest advisory', () => {
    const fresh = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const freshEvent = recordFixture({ id: '10', trackIssuedTime: fresh } as never);
    render(panel({ event: freshEvent }, { latestIssuedAt: fresh }));
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));

    expect(screen.queryByTestId('advisory-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('advisory-age')).toBeInTheDocument();
  });

  it('warns, in a banner, when the latest advisory is itself old', () => {
    render(panel({}, { latestIssuedAt: '2026-10-17T12:00:00Z' }));

    expect(screen.getByTestId('advisory-banner')).toHaveAttribute('data-state', 'aging');
    expect(screen.queryByTestId('advisory-age')).not.toBeInTheDocument();
  });

  it('opens another advisory from the trend chart', () => {
    const onSelectAdvisory = jest.fn();
    render(panel({}, { onSelectAdvisory }));

    fireEvent.click(screen.getByRole('button', { name: /19 Oct 12:00 UTC: no one/ }));
    expect(onSelectAdvisory).toHaveBeenCalledWith('10');
  });
});

describe('ForecastExposureSummary header', () => {
  it('names the wind band and its range, not the band’s top speed', () => {
    render(panel({}, null));

    const header = screen.getByTestId('summary-panel');
    // the national row says "Possible Gale Winds", but Mauke and Mitiaro have confirmed gale
    expect(header).toHaveTextContent('up to gale winds (63–88 km/h)');
    expect(header).not.toHaveTextContent('possible gale winds');
    expect(header).not.toHaveTextContent('(89 km/h)');
    act(() => undefined);
  });
});
