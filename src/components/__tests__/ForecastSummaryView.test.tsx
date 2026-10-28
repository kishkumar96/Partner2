import { fireEvent, render, screen, within } from '@testing-library/react';
import ForecastSummaryView from '../ForecastSummaryView';
import { buildForecastInsight } from '@/utils/forecastInsight';
import { WATI_17_OCT, WATI_19_OCT } from '@/utils/testing/forecastFixtures';
import type { TimelinePoint } from '@/utils/forecastTimeline';

const NOW = Date.parse('2026-10-19T13:00:00Z');
const timeline: TimelinePoint[] = [
  { id: 'a', issuedAt: '2026-10-17T12:00:00Z', people: 2622, buildings: 5201, strongest: 'gale' },
  {
    id: 'b',
    issuedAt: '2026-10-18T18:00:00Z',
    people: 14118,
    buildings: 16720,
    strongest: 'storm',
  },
  { id: 'c', issuedAt: '2026-10-19T12:00:00Z', people: 0, buildings: 0, strongest: null },
];

const forecast = (extra: Partial<Parameters<typeof buildForecastInsight>[0]> = {}) =>
  buildForecastInsight({
    exposure: WATI_17_OCT(),
    countryName: 'Cook Islands',
    issuedAt: '2026-10-17T12:00:00Z',
    latestIssuedAt: '2026-10-19T12:00:00Z',
    timeline,
    now: NOW,
    ...extra,
  });

const handlers = () => ({
  onShowDetails: jest.fn(),
  onAbout: jest.fn(),
  onSelectAdvisory: jest.fn(),
  onSwitchToLatest: jest.fn(),
});

describe('ForecastSummaryView, when winds are forecast', () => {
  it('leads with a plain sentence and the people it affects', () => {
    render(<ForecastSummaryView insight={forecast()} {...handlers()} />);

    expect(screen.getByTestId('summary-headline')).toHaveTextContent(
      'Gale-force winds are forecast in Mauke and Mitiaro. Gale-force winds are possible in Aitutaki and Atiu.'
    );
    expect(screen.getByTestId('summary-detail')).toHaveTextContent('About 2,600 people (17%)');
  });

  it('lists the three most affected areas and says how many more there are', () => {
    render(<ForecastSummaryView insight={forecast()} {...handlers()} />);

    const areas = within(screen.getByTestId('summary-areas'));
    expect(areas.getAllByRole('listitem')).toHaveLength(3);
    expect(areas.getByText('Aitutaki')).toBeInTheDocument();
    expect(areas.getAllByText('possible gale')).toHaveLength(2); // Aitutaki and Atiu
    expect(areas.getByText('about 1,600')).toBeInTheDocument();
    expect(areas.queryByText('Mitiaro')).not.toBeInTheDocument();
    expect(areas.getByText(/\+ 1 more area in Details/)).toBeInTheDocument();
  });

  it('shows three numbers with the facilities spelled out', () => {
    render(<ForecastSummaryView insight={forecast()} {...handlers()} />);

    const stats = screen.getByTestId('summary-stats');
    expect(stats).toHaveTextContent('~2.6K');
    expect(stats).toHaveTextContent('people');
    expect(stats).toHaveTextContent('28');
    expect(stats).toHaveTextContent('key facilities');
    expect(stats).toHaveTextContent('3 health · 8 schools · 17 evacuation centres');
  });

  it('shows how exposure moved across advisories, and opens another advisory from the chart', () => {
    const h = handlers();
    render(<ForecastSummaryView insight={forecast()} {...h} />);

    const trend = screen.getByTestId('summary-trend');
    expect(trend).toHaveTextContent(
      'Exposure peaked at about 14,000 people (18 Oct 18:00 UTC); this advisory: about 2,600 people; the latest advisory: no one in forecast winds.'
    );
    fireEvent.click(within(trend).getByRole('button', { name: /19 Oct 12:00 UTC/ }));
    expect(h.onSelectAdvisory).toHaveBeenCalledWith('c');
  });

  it('explains what the figures are not, including what "possible" means', () => {
    render(<ForecastSummaryView insight={forecast()} {...handlers()} />);

    const limits = screen.getByTestId('summary-limits');
    expect(limits).toHaveTextContent('not an estimate of damage');
    expect(limits).toHaveTextContent(
      'Storm surge, waves and heavy rain are not part of this forecast'
    );
    expect(limits).toHaveTextContent(
      '“Possible” means the winds are inside the forecast track’s uncertainty'
    );
  });

  it('opens the full details and the explanation', () => {
    const h = handlers();
    render(<ForecastSummaryView insight={forecast()} {...h} />);

    fireEvent.click(screen.getByRole('button', { name: 'See every affected area in Details →' }));
    fireEvent.click(screen.getByRole('button', { name: 'How to read this forecast' }));
    expect(h.onShowDetails).toHaveBeenCalledTimes(1);
    expect(h.onAbout).toHaveBeenCalledTimes(1);
  });
});

describe('ForecastSummaryView, when nothing is exposed', () => {
  const none = () =>
    buildForecastInsight({
      exposure: WATI_19_OCT(),
      countryName: 'Cook Islands',
      issuedAt: '2026-10-19T12:00:00Z',
      latestIssuedAt: '2026-10-19T12:00:00Z',
      timeline,
      now: NOW,
    });

  it('says so clearly instead of showing a screen of zeros', () => {
    render(<ForecastSummaryView insight={none()} {...handlers()} />);

    expect(screen.getByTestId('summary-headline')).toHaveTextContent(
      'No area of Cook Islands is forecast to see gale-force winds.'
    );
    expect(screen.queryByTestId('summary-areas')).not.toBeInTheDocument();
    expect(screen.queryByTestId('summary-stats')).not.toBeInTheDocument();
    // …but still shows where exposure has come from, which is the useful context
    expect(screen.getByTestId('summary-trend')).toHaveTextContent(
      'Exposure peaked at about 14,000 people'
    );
    expect(screen.queryByText(/Possible” means/)).not.toBeInTheDocument();
  });
});

describe('ForecastSummaryView, the advisory status', () => {
  it('shows the status line only when asked (the parent shows the banner for an older advisory)', () => {
    const { rerender } = render(<ForecastSummaryView insight={forecast()} {...handlers()} />);
    expect(screen.queryByTestId('advisory-banner')).not.toBeInTheDocument();

    rerender(<ForecastSummaryView insight={forecast()} showStatus {...handlers()} />);
    expect(screen.getByTestId('advisory-banner')).toHaveAttribute('data-state', 'older');
  });
});

describe('ForecastSummaryView, readability', () => {
  it('uses no text smaller than 12px', () => {
    const { container } = render(
      <ForecastSummaryView insight={forecast()} showStatus {...handlers()} />
    );
    expect(container.innerHTML).not.toMatch(/text-\[(8|9|10|11)px\]/);
  });

  it('gives every button a tap target of at least 44px', () => {
    render(<ForecastSummaryView insight={forecast()} showStatus {...handlers()} />);
    for (const name of [
      'See every affected area in Details →',
      'How to read this forecast',
      'Switch to the latest advisory',
    ]) {
      expect(screen.getByRole('button', { name }).className).toContain('min-h-[44px]');
    }
  });
});
