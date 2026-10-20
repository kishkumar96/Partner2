import { fireEvent, render, screen, within } from '@testing-library/react';
import { ForecastExposureTables } from '../ForecastExposurePanels';
import ForecastRunSelector from '../ForecastRunSelector';
import { FORECAST_SIGNAL, forecastCsvRows } from '@/utils/forecastBriefing';
import { WATI_17_OCT, exposureFixture } from '@/utils/testing/forecastFixtures';
import type { ForecastRun } from '@/utils/forecastRuns';

describe('region table: areas with nothing exposed', () => {
  const tableRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

  it('leaves one or two empty areas in the table, where folding them would save nothing', () => {
    render(<ForecastExposureTables exposure={WATI_17_OCT()} areaLabel="Region" />);

    // Mangaia and Rarotonga are empty, but only two of them
    expect(screen.queryByTestId('toggle-unexposed')).not.toBeInTheDocument();
    expect(tableRows()).toHaveLength(6);
  });

  it('shows the toggle with a count when three or more areas have nothing exposed', () => {
    const exposure = exposureFixture({
      regions: [
        { name: 'Aitutaki', winds: 'Gale Winds', people: 100 },
        ...['Atiu', 'Mauke', 'Mitiaro', 'Mangaia'].map(name => ({ name, winds: '', people: 0 })),
      ],
    });
    render(<ForecastExposureTables exposure={exposure} areaLabel="Region" />);

    expect(tableRows().map(row => row.textContent)).toEqual([
      expect.stringContaining('Aitutaki'),
      expect.stringContaining('Show 4 regions with nothing exposed'),
    ]);
    fireEvent.click(screen.getByTestId('toggle-unexposed'));
    expect(tableRows()).toHaveLength(6); // 5 areas + the toggle row
    expect(screen.getByTestId('toggle-unexposed')).toHaveTextContent(
      'Hide the 4 regions with nothing exposed'
    );
  });

  it('says so in words when no area has anything exposed, instead of a table of zeros', () => {
    const exposure = exposureFixture({
      regions: ['Atiu', 'Mauke', 'Mitiaro', 'Mangaia'].map(name => ({
        name,
        winds: '',
        people: 0,
      })),
    });
    render(<ForecastExposureTables exposure={exposure} areaLabel="Region" />);

    expect(screen.getByTestId('nothing-exposed-row')).toHaveTextContent(
      'Nothing is under forecast winds in any region.'
    );
    expect(screen.getByTestId('toggle-unexposed')).toHaveTextContent(
      'Show 4 regions with nothing exposed'
    );
  });

  it('keeps the area picked on the map in view even when nothing is exposed there', () => {
    const many = exposureFixture({
      regions: ['Aitutaki', 'Atiu', 'Mauke', 'Mitiaro'].map(name => ({
        name,
        winds: '',
        people: 0,
      })),
    });
    render(<ForecastExposureTables exposure={many} areaLabel="Region" selectedRegion="Mauke" />);

    expect(
      tableRows()
        .map(row => row.textContent)
        .join('|')
    ).toContain('Mauke');
  });
});

describe('advisory list', () => {
  const runs = (count: number): ForecastRun[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `r${i}`,
      storm: 'Wati',
      cycloneName: `Wati ${i}`,
      issuedAt: new Date(Date.UTC(2026, 9, 19, 12) - i * 6 * 3_600_000).toISOString(),
      isLatest: i === 0,
      status: 'complete',
    }));
  const listed = () => within(screen.getByRole('list')).getAllByRole('listitem').length;

  it('shows a list that is only a little long in full, with no button to reveal a row or two', () => {
    render(<ForecastRunSelector runs={runs(8)} activeRunId="r0" onSelect={jest.fn()} />);

    expect(listed()).toBe(8);
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
  });

  it('still folds a long list, and unfolds it', () => {
    render(<ForecastRunSelector runs={runs(9)} activeRunId="r0" onSelect={jest.fn()} />);

    expect(listed()).toBe(6);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 9 advisories' }));
    expect(listed()).toBe(9);
  });
});

describe('the framing line', () => {
  it('uses a real dash, not a hyphen stuck to the next word', () => {
    expect(FORECAST_SIGNAL).toBe('Planning signal — exposure, not a damage estimate');
    expect(FORECAST_SIGNAL).not.toMatch(/ -\w/);
  });

  it('reads cleanly at the top of the CSV export too', () => {
    const [first] = forecastCsvRows(WATI_17_OCT())[0];
    expect(first).toBe(
      'Rapid Exposure Forecast: Planning signal — exposure, not a damage estimate'
    );
  });
});
