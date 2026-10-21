import { fireEvent, render, screen } from '@testing-library/react';
import ForecastRunSelector from '../ForecastRunSelector';
import {
  ForecastExposureSummary,
  ForecastExposureTables,
  ForecastRunStatusPanel,
} from '../ForecastExposurePanels';
import type { ExposureArea, ExposureTotals, ForecastExposure } from '@/utils/forecastExposure';
import type { EventRecord } from '@/data/eventRecords';
import type { ForecastRun } from '@/utils/forecastRuns';

const totals = (over: Partial<ExposureTotals> = {}) =>
  ({
    population: 0,
    buildings: 0,
    residentialBuildings: 0,
    nonresidentialBuildings: 0,
    buildingValue: 0,
    roadKm: 0,
    roadValue: 0,
    cropValue: 0,
    infrastructureValue: 0,
    evacuationCentres: 0,
    healthFacilities: 0,
    schools: 0,
    ...over,
  }) as ExposureTotals;

const area = (name: string, population: number): ExposureArea =>
  ({
    name,
    overallWinds: 'Hurricane Winds',
    minWindKmph: null,
    maxWindKmph: 119,
    exposed: totals({ population, buildings: 10, buildingValue: 1000 }),
    inFloodplains: totals(),
    inTrackUncertainty: totals(),
    total: totals(),
    totalPopulation: 1000,
    totalBuildings: 100,
    populationInFloodplains: 5,
    populationInTrackUncertainty: 0,
  }) as ExposureArea;

const exposure: ForecastExposure = {
  national: area('Vanuatu', 500),
  regions: [area('Sanma', 300), area('Shefa', 200)],
  byWindDanger: [],
  byTrackDistance: [],
  facilities: [],
  layers: {
    facilities: null,
    windSwaths: null,
    trackDistance: null,
    cycloneTrack: null,
    cycloneTrackSource: null,
    floodplainRowId: null,
  },
};

const event = {
  id: '12',
  name: 'TC Lola – Rapid exposure forecast',
  date: '2020-01-01',
  trackIssuedTime: '2020-01-01T00:00:00Z',
  dataSource: 'rapid_exposure_forecast',
} as EventRecord;

describe('Rapid Exposure Forecast framing', () => {
  it('states it is a planning signal and labels figures as exposure, never damage or affected', () => {
    render(<ForecastExposureSummary exposure={exposure} event={event} />);
    const panel = screen.getByTestId('summary-panel');
    expect(panel).toHaveTextContent('Planning signal -exposure, not a damage estimate');
    expect(panel).toHaveTextContent(/people exposed to forecast winds/i);
    expect(panel).toHaveTextContent(/buildings in forecast wind zones/i);
    expect(panel).toHaveTextContent(/building value potentially exposed/i);
    expect(panel).toHaveTextContent('Replacement value, not expected loss');
    expect(panel.textContent).not.toMatch(/people affected|expected damage|impact estimate/i);
  });

  it('flags an old advisory and says to check for a newer one', () => {
    render(<ForecastExposureSummary exposure={exposure} event={event} />);
    expect(screen.getByTestId('advisory-age')).toHaveTextContent(
      /newer advisory may be available/i
    );
  });

  it('lists operational priorities with the worst-hit area first', () => {
    render(<ForecastExposureSummary exposure={exposure} event={event} />);
    const priorities = screen.getByTestId('operational-priorities');
    expect(priorities).toHaveTextContent('Operational priorities');
    expect(priorities.textContent!.indexOf('Sanma')).toBeLessThan(
      priorities.textContent!.indexOf('Shefa')
    );
  });

  it('repeats the framing above the tables', () => {
    render(<ForecastExposureTables exposure={exposure} areaLabel="Province" />);
    expect(screen.getByTestId('forecast-signal')).toHaveTextContent(
      'Planning signal -exposure, not a damage estimate'
    );
  });
});

describe('Forecast run (track issue time) selector', () => {
  const runs: ForecastRun[] = [
    { id: '131', cycloneName: '2026101718_Wati', issuedAt: '2026-10-17T18:00:00Z', isLatest: true },
    {
      id: '132',
      cycloneName: '2026101712_Wati',
      issuedAt: '2026-10-17T12:00:00Z',
      isLatest: false,
    },
  ];

  it('lists each issue time, marks the active and latest runs, and reports a pick', () => {
    const onSelect = jest.fn();
    render(<ForecastRunSelector runs={runs} activeRunId="131" onSelect={onSelect} />);
    const selector = screen.getByTestId('forecast-run-selector');
    expect(selector).toHaveTextContent('2026-10-17 18:00 UTC');
    expect(selector).toHaveTextContent('Latest');
    const buttons = screen.getAllByRole('button', { pressed: true });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('18:00');

    fireEvent.click(screen.getByRole('button', { name: /2026-10-17 12:00 UTC/ }));
    expect(onSelect).toHaveBeenCalledWith('132');
  });

  it('is hidden when there is only one run to choose from', () => {
    render(<ForecastRunSelector runs={[runs[0]]} onSelect={jest.fn()} />);
    expect(screen.queryByTestId('forecast-run-selector')).toBeNull();
  });

  it('shows a visible title as a card, but only a screen-reader title inside a section', () => {
    const { rerender } = render(<ForecastRunSelector runs={runs} onSelect={jest.fn()} />);
    expect(screen.getByText('Track issue time')).not.toHaveClass('sr-only');
    rerender(<ForecastRunSelector runs={runs} onSelect={jest.fn()} variant="plain" />);
    expect(screen.getByText('Track issue time')).toHaveClass('sr-only');
  });

  it('is no longer part of the right-hand summary panel', () => {
    render(<ForecastExposureSummary exposure={exposure} event={event} />);
    expect(screen.queryByTestId('forecast-run-selector')).toBeNull();
  });
});

describe('Forecast run status panel', () => {
  const runs: ForecastRun[] = [
    { id: '23', issuedAt: '2026-10-18T00:00:00Z', isLatest: true, status: 'failed' },
    { id: '22', issuedAt: '2026-10-17T18:00:00Z', isLatest: false, status: 'complete' },
  ];
  const withStatus = (modelRunStatus: string, modelRunError?: string) =>
    ({ ...event, id: '23', modelRunStatus, modelRunError }) as EventRecord;

  it('says a run is pending, never showing zeros', () => {
    render(<ForecastRunStatusPanel event={withStatus('running')} />);
    const panel = screen.getByTestId('forecast-run-status-panel');
    expect(panel).toHaveTextContent('Exposure results are not ready yet');
    expect(panel).toHaveTextContent('Planning signal -exposure, not a damage estimate');
    expect(panel.textContent).not.toMatch(/people exposed to forecast winds/i);
  });

  it('shows why a run failed', () => {
    render(<ForecastRunStatusPanel event={withStatus('failed', 'model dropped the track')} />);
    expect(screen.getByRole('status')).toHaveTextContent('The model run for this advisory failed');
    expect(screen.getByRole('status')).toHaveTextContent('model dropped the track');
  });

  it('does not call a finished-but-empty run "no exposure"', () => {
    render(<ForecastRunStatusPanel event={withStatus('complete')} />);
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent('This run returned no exposure results');
    expect(note).toHaveTextContent(/not a confirmed finding of zero exposure/i);
  });

  it('points to the Forecast advisory section in the left panel', () => {
    render(<ForecastRunStatusPanel event={withStatus('failed')} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      /another advisory under “Forecast advisory” in the left panel/
    );
  });
});

describe('Wind and distance wording', () => {
  it('says which wind band is stronger and what "possible" means', () => {
    render(
      <ForecastExposureSummary
        exposure={{
          ...exposure,
          byWindDanger: [
            { label: 'Gale Winds', value: 63, totals: totals({ population: 100 }) },
          ] as never,
        }}
        event={event}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'About this forecast' }));
    const key = screen.getByTestId('wind-scale-key');
    expect(key).toHaveTextContent(/gale \(63–88 km\/h\), storm \(89–117 km\/h\)/i);
    expect(key).toHaveTextContent(/less certain, not weaker/i);
  });
});

describe('Advisory change block', () => {
  const previousExposure = {
    ...exposure,
    national: area('Vanuatu', 400),
    regions: [area('Sanma', 250), area('Shefa', 150)],
  } as ForecastExposure;
  const previous = {
    record: { ...event, trackIssuedTime: '2026-10-17T12:00:00Z' } as EventRecord,
    exposure: previousExposure,
  };

  it('says what moved since the previous advisory, with its time', () => {
    render(<ForecastExposureSummary exposure={exposure} event={event} previous={previous} />);
    const block = screen.getByTestId('advisory-change');
    expect(block).toHaveTextContent('Since the 12:00 UTC 17 Oct advisory');
    expect(block).toHaveTextContent('People exposed: +100');
    expect(block).toHaveTextContent(/can reflect the forecast moving/i);
  });

  it('is absent without a previous advisory, and says "no change" when nothing moved', () => {
    const { rerender } = render(<ForecastExposureSummary exposure={exposure} event={event} />);
    expect(screen.queryByTestId('advisory-change')).toBeNull();
    rerender(
      <ForecastExposureSummary
        exposure={exposure}
        event={event}
        previous={{ ...previous, exposure }}
      />
    );
    expect(screen.getByTestId('advisory-change')).toHaveTextContent('No change in exposure');
  });
});

describe('Facilities tab', () => {
  const facility = (
    id: string,
    name: string,
    asset: string,
    area: string,
    over: Record<string, unknown> = {}
  ) => ({
    id,
    name,
    asset,
    useType: 'Water_Tank,Toilets',
    area,
    danger: 'Possible Gale Winds',
    windKmph: 63,
    trackDistance: '',
    inFloodplain: false,
    ...over,
  });
  const withFacilities = {
    ...exposure,
    facilities: [
      facility('1', 'Araura', 'Health Facility', 'Aitutaki', { useType: 'Hospital' }),
      facility('2', 'Enuamanu school', 'School', 'Atiu'),
      facility('3', 'Inanui hall', 'Evacuation Centre', 'Mauke', { inFloodplain: true }),
      facility('4', 'Catholic hall', 'Evacuation Centre', 'Atiu'),
    ],
  } as unknown as ForecastExposure;

  it('names each exposed facility under its own tab, with its area and wind', () => {
    render(<ForecastExposureTables exposure={withFacilities} areaLabel="Island" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Facilities (4)' }));
    const list = screen.getByTestId('facility-list');
    expect(list).toHaveTextContent('Araura');
    expect(list).toHaveTextContent('Enuamanu school');
    expect(list).toHaveTextContent('Possible Gale Winds (63 km/h)');
    expect(list).toHaveTextContent('Hospital');
    expect(list).toHaveTextContent('In floodplain');
  });

  it('filters by type and says when none of a type is exposed', () => {
    render(<ForecastExposureTables exposure={withFacilities} areaLabel="Island" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Facilities (4)' }));
    fireEvent.click(screen.getByRole('button', { name: /Schools \(1\)/ }));
    const list = screen.getByTestId('facility-list');
    expect(list).toHaveTextContent('Enuamanu school');
    expect(list).not.toHaveTextContent('Araura');
    fireEvent.click(screen.getByRole('button', { name: /Health \(1\)/ }));
    expect(screen.getByTestId('facility-list')).toHaveTextContent('Araura');
  });

  it('follows the selected island, and shows all when that island has none', () => {
    const { rerender } = render(
      <ForecastExposureTables exposure={withFacilities} areaLabel="Island" selectedRegion="Atiu" />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Facilities (4)' }));
    expect(screen.getByTestId('facility-list')).toHaveTextContent('Catholic hall');
    expect(screen.getByTestId('facility-list')).not.toHaveTextContent('Araura');
    rerender(
      <ForecastExposureTables
        exposure={withFacilities}
        areaLabel="Island"
        selectedRegion="Nowhere"
      />
    );
    expect(screen.getByTestId('facility-list')).toHaveTextContent('Araura');
  });

  it('has no Facilities tab when none are exposed', () => {
    render(<ForecastExposureTables exposure={exposure} areaLabel="Island" />);
    expect(screen.queryByRole('tab', { name: /Facilities/ })).toBeNull();
  });
});

describe('Information button', () => {
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'About this forecast' }));

  it('keeps the explanation out of the way until asked for it', () => {
    render(<ForecastExposureSummary exposure={exposure} event={event} />);
    expect(screen.queryByTestId('forecast-info')).toBeNull();
    expect(screen.queryByTestId('wind-scale-key')).toBeNull();
    const button = screen.getByRole('button', { name: 'About this forecast' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the planning-signal note, data status, wind key and how to read it', () => {
    render(<ForecastExposureSummary exposure={exposure} event={event} />);
    open();
    const info = screen.getByTestId('forecast-info');
    expect(screen.getByRole('button', { name: 'About this forecast' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(info).toHaveTextContent(/not a probability of damage/i);
    expect(info).toHaveTextContent('Forecast data status');
    expect(info).toHaveTextContent('Track issued: 2020-01-01 00:00 UTC');
    expect(info).toHaveTextContent('How to read this forecast');
    expect(screen.getByTestId('wind-scale-key')).toBeInTheDocument();
    open();
    expect(screen.queryByTestId('forecast-info')).toBeNull();
  });

  it('always shows the short planning-signal line and how old the advisory is', () => {
    render(<ForecastExposureSummary exposure={exposure} event={event} />);
    expect(screen.getByTestId('forecast-signal-short')).toHaveTextContent(
      'Planning signal -exposure, not a damage estimate'
    );
    expect(screen.getByTestId('advisory-age')).toHaveTextContent(
      'Advisory issued 2020-01-01 00:00 UTC'
    );
    expect(screen.getByTestId('advisory-age')).toHaveTextContent(
      /newer advisory may be available/i
    );
  });
});
