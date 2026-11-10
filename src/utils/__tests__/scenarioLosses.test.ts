/** @jest-environment node */
import { gzipSync } from 'zlib';
import type { HazardScenarioSelection } from '@/data/realThreddsLayers';
import {
  clearScenarioLossesCache,
  loadBreakdownRows,
  loadScenarioRows,
  scenarioLossesBase,
  selectScenarioRows,
} from '../scenarioLosses';
import {
  fetchHazardScenarioBreakdown,
  fetchHazardScenarioCurve,
  fetchHazardScenarioRiskSummary,
} from '../realDataLoader';

const STORE = 'https://s3.example.com/spc-zarr-file/hazard_catalog.zarr';
const BASE = 'https://s3.example.com/spc-zarr-file/scenario_losses/v1';

const scenario = (over: Partial<HazardScenarioSelection> = {}): HazardScenarioSelection =>
  ({
    product: 'tc',
    slrScenarioM: 0.5,
    returnPeriodYears: 100,
    eventLabel: null,
    ...over,
  }) as HazardScenarioSelection;

const row = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  risk_information: 155,
  risk_information_title: 'CK tc national impact',
  country: 4,
  slr_scenario_m: 0.5,
  return_period_years: 100,
  event_label: null,
  is_annual_average_loss: false,
  total_loss: id * 10,
  exposed_population: 285,
  ...over,
});

const SCENARIOS = [
  row(1, { return_period_years: 50 }),
  row(2),
  row(3, { slr_scenario_m: 1 }),
  row(4, { return_period_years: null, is_annual_average_loss: true }),
  row(5, { risk_information: 156, risk_information_title: 'CK swell national impact' }),
  row(6, { return_period_years: 200 }),
];
const BREAKDOWN = {
  '2': [
    { id: 90, risk_scenario: 2, dimension: 'sector', name: 'Build-Residential', total_loss: 15 },
    { id: 91, risk_scenario: 2, dimension: 'sector', name: 'Build-Commercial', total_loss: 5 },
    {
      id: 92,
      risk_scenario: 2,
      dimension: 'asset_type',
      name: 'Houses',
      sector: 'Housing',
      total_loss: 20,
      exposed_count: 12,
      exposed_value: 3000,
      average_inundation_depth: 0.4,
    },
  ],
};

type Handler = (url: string) => { status: number; body?: unknown; gzipped?: unknown } | undefined;

/** A server with no risk_scenario endpoint and the files in a bucket. */
function installFetch(handler: Handler = () => undefined) {
  const calls: string[] = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const answer = handler(url);
    if (answer && 'gzipped' in answer)
      return new Response(gzipSync(JSON.stringify(answer.gzipped)), { status: 200 });
    if (answer) return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status });
    if (url.includes('/country/'))
      return json([{ id: 4, code: 'CK', short_name: 'CK', long_name: 'Cook Islands' }]);
    if (url.includes('/hazard_information/'))
      return json([
        { id: 10, protocol: 'wms', url: 'https://thredds.example.com/wms' },
        { id: 11, protocol: 'zarr', url: `${STORE}/` },
      ]);
    if (url.includes('/risk_scenario')) return new Response('{}', { status: 404 });
    if (url === `${BASE}/CK/scenarios.json`) return json(SCENARIOS);
    if (url === `${BASE}/CK/breakdown/155.json`) return json(BREAKDOWN);
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  return calls;
}
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  clearScenarioLossesCache();
  process.env.NEXT_PUBLIC_ENABLE_PARTNER_API = 'true';
  delete process.env.NEXT_PUBLIC_HAZARD_ZARR_DIRECT;
});

describe('scenarioLossesBase', () => {
  it('is the folder beside the store, whatever the trailing slash', () => {
    expect(scenarioLossesBase([STORE])).toBe(BASE);
    expect(scenarioLossesBase([`${STORE}///`])).toBe(BASE);
  });

  it('works for a store in a folder of a bucket', () => {
    expect(scenarioLossesBase(['https://s3.example.com/bucket/a/b/store.zarr'])).toBe(
      'https://s3.example.com/bucket/a/b/scenario_losses/v1'
    );
  });

  it('skips addresses it cannot use and takes the first that works', () => {
    expect(scenarioLossesBase(['not a url', 'https://example.com', STORE])).toBe(BASE);
    expect(scenarioLossesBase([])).toBeNull();
    expect(scenarioLossesBase(['https://example.com/store.zarr'])).toBe(
      'https://example.com/scenario_losses/v1'
    );
  });
});

describe('selectScenarioRows', () => {
  it('keeps the rows of the selected sea-level rise and return period, never an annual average', () => {
    const picked = selectScenarioRows(SCENARIOS, scenario({ returnPeriodYears: 100 }));
    // row 5 is another product at the same scenario; picking the product is the caller's job
    expect(picked.map(r => r.id)).toEqual([2, 5]);
  });

  it('does not filter on the return period when the selection has none, like the API', () => {
    const picked = selectScenarioRows(SCENARIOS, scenario({ returnPeriodYears: null }));
    expect(picked.map(r => r.id)).toEqual([1, 2, 5, 6]);
  });

  it('filters on the event label when the selection names one', () => {
    const rows = [
      row(7, { return_period_years: null, event_label: '2018-03-01' }),
      row(8, { return_period_years: null, event_label: '2020-01-01' }),
    ];
    const picked = selectScenarioRows(
      rows,
      scenario({ returnPeriodYears: null, eventLabel: '2020-01-01' })
    );
    expect(picked.map(r => r.id)).toEqual([8]);
  });

  it('puts the rows in id order', () => {
    const picked = selectScenarioRows([row(9), row(3), row(5)], scenario());
    expect(picked.map(r => r.id)).toEqual([3, 5, 9]);
  });
});

describe('loading the files', () => {
  it('reads a country’s scenarios and one scenario’s breakdown', async () => {
    installFetch();
    expect(await loadScenarioRows(BASE, 'CK')).toHaveLength(6);
    expect(await loadBreakdownRows(BASE, 'CK', 155, 2)).toHaveLength(3);
    expect(await loadBreakdownRows(BASE, 'CK', 155, 99)).toBeNull();
  });

  it('downloads each file once', async () => {
    const calls = installFetch();
    await loadScenarioRows(BASE, 'CK');
    await loadScenarioRows(BASE, 'CK');
    await Promise.all([
      loadBreakdownRows(BASE, 'CK', 155, 2),
      loadBreakdownRows(BASE, 'CK', 155, 2),
    ]);
    expect(calls.filter(url => url.endsWith('scenarios.json'))).toHaveLength(1);
    expect(calls.filter(url => url.endsWith('155.json'))).toHaveLength(1);
  });

  it('reads a file whose gzip bytes the server did not undo', async () => {
    installFetch(url =>
      url.endsWith('scenarios.json') ? ({ status: 200, gzipped: SCENARIOS } as never) : undefined
    );
    expect(await loadScenarioRows(BASE, 'CK')).toHaveLength(6);
  });

  it('gives null when a file is missing, and tries again next time', async () => {
    let published = false;
    installFetch(url =>
      url.endsWith('scenarios.json') && !published ? { status: 404 } : undefined
    );
    expect(await loadScenarioRows(BASE, 'CK')).toBeNull();
    published = true;
    expect(await loadScenarioRows(BASE, 'CK')).toHaveLength(6);
  });
});

describe('with an API that has no risk_scenario', () => {
  it('finds the summary row of the selected scenario in the published files', async () => {
    installFetch();
    const summary = await fetchHazardScenarioRiskSummary('CK', scenario());
    expect(summary).toMatchObject({ id: 2, total_loss: 20, risk_information: 155 });
  });

  it('finds the row of the right product when several match', async () => {
    installFetch();
    const swell = await fetchHazardScenarioRiskSummary('CK', scenario({ product: 'swell' }));
    expect(swell).toMatchObject({ id: 5 });
  });

  it('gives null for a scenario that is not published', async () => {
    installFetch();
    expect(await fetchHazardScenarioRiskSummary('CK', scenario({ slrScenarioM: 9 }))).toBeNull();
  });

  it('draws the loss curve from the published files', async () => {
    installFetch();
    const curve = await fetchHazardScenarioCurve('CK', 155);
    expect(curve?.points.map(p => [p.slrScenarioM, p.returnPeriodYears, p.totalLoss])).toEqual([
      [0.5, 50, 10],
      [0.5, 100, 20],
      [0.5, 200, 60],
      [1, 100, 30],
    ]);
    expect(curve?.annualAverageLoss).toEqual([{ slrScenarioM: 0.5, totalLoss: 40 }]);
  });

  it('splits a scenario’s loss by sector and asset type, biggest first', async () => {
    installFetch();
    const breakdown = await fetchHazardScenarioBreakdown('CK', 2);
    expect(breakdown?.sectors.map(r => [r.name, r.totalLoss])).toEqual([
      ['Build-Residential', 15],
      ['Build-Commercial', 5],
    ]);
    expect(breakdown?.assetTypes).toEqual([
      {
        name: 'Houses',
        sector: 'Housing',
        totalLoss: 20,
        exposedCount: 12,
        exposedValue: 3000,
        averageInundationDepth: 0.4,
      },
    ]);
  });

  it('gives null when the scenario has no published breakdown', async () => {
    installFetch();
    expect(await fetchHazardScenarioBreakdown('CK', 5)).toBeNull();
  });

  it('asks for the pointer row once, however many figures are drawn', async () => {
    const calls = installFetch();
    await fetchHazardScenarioRiskSummary('CK', scenario());
    await fetchHazardScenarioCurve('CK', 155);
    await fetchHazardScenarioBreakdown('CK', 2);
    expect(calls.filter(url => url.includes('/hazard_information/'))).toHaveLength(1);
  });

  it('does nothing extra when reading from the bucket is switched off', async () => {
    process.env.NEXT_PUBLIC_HAZARD_ZARR_DIRECT = 'false';
    const calls = installFetch();
    expect(await fetchHazardScenarioRiskSummary('CK', scenario())).toBeNull();
    expect(calls.some(url => url.includes('scenario_losses'))).toBe(false);
  });

  it('gives null when the API has no pointer row to follow', async () => {
    installFetch(url =>
      url.includes('/hazard_information/')
        ? { status: 200, body: [{ id: 10, protocol: 'wms', url: 'https://x.example.com' }] }
        : undefined
    );
    expect(await fetchHazardScenarioRiskSummary('CK', scenario())).toBeNull();
  });
});

describe('with an API that has risk_scenario', () => {
  it('uses its answer and never reads the files', async () => {
    const calls = installFetch(url =>
      url.includes('/risk_scenario/')
        ? { status: 200, body: { results: [row(77, { total_loss: 1 })] } }
        : undefined
    );
    const summary = await fetchHazardScenarioRiskSummary('CK', scenario());
    expect(summary).toMatchObject({ id: 77 });
    expect(calls.some(url => url.includes('scenario_losses'))).toBe(false);
  });
});
