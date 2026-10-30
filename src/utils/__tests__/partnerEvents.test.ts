import { listForecastRuns } from '../forecastRuns';
import {
  expandEventModelRuns,
  inferEventTrackId,
  linkEventRisksFromModelRuns,
  normalizePartnerEventRecords,
  normalizePartnerEventRow,
  scopeRiskRowsToEvent,
} from '../partnerEvents';

const rows = [49, 50, 51, 60, 70].map(id => ({ id, country: 1 }));
const ids = (list: Array<Record<string, unknown>>) => list.map(r => r.id);

describe('normalizePartnerEventRow', () => {
  it('reads Event.risks into backendRiskIds as strings', () => {
    const e = normalizePartnerEventRow('VU', {
      id: 11,
      title: 'TC Example',
      risks: [49, '50', 51],
    });
    expect(e?.id).toBe('11');
    expect(e?.backendRiskIds).toEqual(['49', '50', '51']);
  });

  it('flags forecasts by data_source, not by a stray "ref" in the title', () => {
    expect(
      normalizePartnerEventRow('VU', { id: 1, title: 'TC', data_source: 'rapid_exposure_forecast' })
        ?.isForecast
    ).toBe(true);
    expect(normalizePartnerEventRow('VU', { id: 2, title: 'Ref Island Flood' })?.isForecast).toBe(
      false
    );
    expect(
      normalizePartnerEventRow('VU', { id: 3, title: 'Rapid Exposure Forecast X' })?.isForecast
    ).toBe(true);
  });
});

describe('normalizePartnerEventRecords', () => {
  const event = {
    id: 12,
    title: 'Tropical Cyclone Wati',
    data_source: 'rapid_exposure_forecast',
    cyclone_track: 131,
    risks: [90, 91],
    forecast_runs: [
      {
        id: 22,
        cyclone_track: 131,
        issued_time: '2026-10-17T18:00:00Z',
        status: 'complete',
        risks: [90, 91],
        is_current: true,
      },
      {
        id: 21,
        cyclone_track: 132,
        issued_time: '2026-10-17T12:00:00Z',
        status: 'complete',
        risks: [80, 81],
        is_current: false,
      },
      {
        id: 23,
        cyclone_track: 133,
        issued_time: '2026-10-18T00:00:00Z',
        status: 'failed',
        error: 'model dropped the track',
        risks: [],
        is_current: false,
      },
    ],
  };

  it('makes one record per advisory run, each with its own outputs and track', () => {
    const records = normalizePartnerEventRecords('CK', event);
    expect(records).toHaveLength(3);
    const byTime = Object.fromEntries(records.map(r => [r.trackIssuedTime, r]));
    expect(byTime['2026-10-17T12:00:00Z'].backendRiskIds).toEqual(['80', '81']);
    expect(byTime['2026-10-17T12:00:00Z'].backendCycloneTrackId).toBe('132');
    expect(byTime['2026-10-17T18:00:00Z'].backendRiskIds).toEqual(['90', '91']);
  });

  it("names each advisory by its own track, not the Event's current one", () => {
    const named = {
      ...event,
      cyclone_name: '2026101818_Wati',
      forecast_runs: [
        { ...event.forecast_runs[0], cyclone_name: '2026101818_Wati' },
        { ...event.forecast_runs[1], cyclone_name: '2026101812_Wati' },
      ],
    };
    const byTime = Object.fromEntries(
      normalizePartnerEventRecords('CK', named).map(r => [r.trackIssuedTime, r])
    );
    expect(byTime['2026-10-17T18:00:00Z'].cycloneName).toBe('2026101818_Wati');
    expect(byTime['2026-10-17T12:00:00Z'].cycloneName).toBe('2026101812_Wati');
  });

  it("falls back to the Event's name for a run that doesn't carry one (an older backend)", () => {
    const records = normalizePartnerEventRecords('CK', {
      ...event,
      cyclone_name: '2026101818_Wati',
    });
    expect(records.every(r => r.cycloneName === '2026101818_Wati')).toBe(true);
  });

  it('keeps the Event id on the run the Event shows, so existing links still work', () => {
    const records = normalizePartnerEventRecords('CK', event);
    const current = records.find(r => r.forecastRunId === '22');
    const older = records.find(r => r.forecastRunId === '21');
    expect(current?.id).toBe('12');
    expect(older?.id).toBe('12-run-21');
    expect(new Set(records.map(r => r.id)).size).toBe(3);
  });

  it("never gives a run without its own track the Event's track, which is the shown run's", () => {
    const records = normalizePartnerEventRecords('CK', {
      ...event,
      forecast_runs: [event.forecast_runs[0], { ...event.forecast_runs[1], cyclone_track: null }],
    });
    const byTime = Object.fromEntries(records.map(r => [r.trackIssuedTime, r]));
    expect(byTime['2026-10-17T12:00:00Z'].backendCycloneTrackId).toBeUndefined();
    expect(byTime['2026-10-17T18:00:00Z'].backendCycloneTrackId).toBe('131');
  });

  it('carries a failed run as a run with no outputs and its reason', () => {
    const failed = normalizePartnerEventRecords('CK', event).find(r => r.forecastRunId === '23');
    expect(failed?.modelRunStatus).toBe('failed');
    expect(failed?.modelRunError).toBe('model dropped the track');
    expect(failed?.backendRiskIds).toEqual([]);
    expect(failed?.isForecast).toBe(true);
  });

  it('leaves an Event with no runs, or a non-forecast Event, as a single record', () => {
    expect(normalizePartnerEventRecords('CK', { ...event, forecast_runs: [] })).toHaveLength(1);
    expect(
      normalizePartnerEventRecords('CK', {
        id: 5,
        title: 'Harold',
        forecast_runs: event.forecast_runs,
      })
    ).toHaveLength(1);
  });
});

describe('scopeRiskRowsToEvent', () => {
  const forecast = { id: '11', backendRiskIds: ['49', '50', '51'] };
  const historic = { id: '12', backendRiskIds: ['60'] };
  const unlinked = { id: '13', backendRiskIds: [] as string[] };
  const all = [forecast, historic, unlinked];

  it('keeps only the rows listed in Event.risks', () => {
    expect(ids(scopeRiskRowsToEvent(rows, forecast, all))).toEqual([49, 50, 51]);
  });

  it('gives a forecast event with no risks yet nothing, not unrelated rows', () => {
    const pending = { id: '14', backendRiskIds: [] as string[], isForecast: true };
    expect(scopeRiskRowsToEvent(rows, pending, [...all, pending])).toEqual([]);
  });

  it('gives an event with no risks only unlinked rows, never other events’ rows', () => {
    expect(ids(scopeRiskRowsToEvent(rows, unlinked, all))).toEqual([70]);
  });
});

describe('event identity and storm name', () => {
  it('keeps the backend event id and the track’s cyclone name', () => {
    const e = normalizePartnerEventRow('VU', {
      id: 11,
      title: 'Tropical Cyclone Lola',
      cyclone_name: 'LOLA',
    });
    expect(e?.backendEventId).toBe('11');
    expect(e?.cycloneName).toBe('LOLA');
  });
});

describe('model-run linked events', () => {
  const wati = normalizePartnerEventRow('CK', {
    id: 7,
    title: 'Tropical Cyclone Wati',
    event_datetime: '2026-10-19T12:00:00Z',
    model_runs: [4],
  });
  const runRows = [
    { id: 50, model_run: 4, country: null, title: 'TC Wati 2026101912 - regional impacts' },
    { id: 51, model_run: 4, country: null, title: 'TC Wati 2026101912 - regional summary' },
    { id: 41, model_run: null, country: 3, title: 'Regional Impacts' },
  ];

  it('treats an event with model runs as a forecast and keeps the run ids', () => {
    expect(wati?.isForecast).toBe(true);
    expect(wati?.backendModelRunIds).toEqual(['4']);
  });

  it('links the run’s risk rows, which scopeRiskRowsToEvent then returns', () => {
    const [linked] = linkEventRisksFromModelRuns([wati!], runRows);
    expect(linked.backendRiskIds).toEqual(['50', '51']);
    expect(ids(scopeRiskRowsToEvent(runRows, linked, [linked]))).toEqual([50, 51]);
  });

  it('picks the track with the advisory time from the risk titles', () => {
    const tracks = [
      { id: 220, cyclone_name: '2026101812_Wati', issued_time: '2026-10-20T12:00:00Z' },
      { id: 215, cyclone_name: '2026101912_Wati', issued_time: '2026-10-19T12:00:00Z' },
      { id: 9, cyclone_name: '2026101912_Other', issued_time: '2026-10-21T12:00:00Z' },
    ];
    expect(inferEventTrackId(wati!, tracks, runRows)).toBe('215');
    expect(inferEventTrackId(wati!, tracks, [])).toBe('220');
  });
});

describe('an observed storm that has its own model run', () => {
  const harold = normalizePartnerEventRow('TO', {
    id: 4,
    title: 'Tropical Cyclone Harold',
    event_datetime: '2020-04-06T12:00:00Z',
    is_forecast: false,
    model_runs: [20],
  });
  const rows = [
    { id: 90, model_run: 20, country: 4, title: 'Harold Damaged buildings' },
    { id: 91, model_run: null, country: 4, title: 'Other storm file' },
  ];

  it('is not a forecast when the API says so, though it lists a run', () => {
    expect(harold?.isForecast).toBe(false);
    expect(harold?.backendModelRunIds).toEqual(['20']);
  });

  it('gets only its run’s rows, not the country’s unlinked ones', () => {
    const [linked] = linkEventRisksFromModelRuns([harold!], rows);
    expect(ids(scopeRiskRowsToEvent(rows, linked, [linked]))).toEqual([90]);
  });
});

describe('expandEventModelRuns (the shared API: runs listed as ids, no forecast_runs)', () => {
  const wati = () =>
    normalizePartnerEventRecords('CK', {
      id: 7,
      title: 'Tropical Cyclone Wati',
      country: 3,
      model_runs: [11, 4, 9],
    })[0];
  const risk = (id: number, run: number, stamp: string, title = 'wind swaths') => ({
    id,
    model_run: run,
    title: `TC Wati ${stamp} - ${title}`,
  });
  const riskRows = [
    risk(101, 11, '2026101906'),
    risk(102, 11, '2026101906', 'track distance'),
    risk(41, 4, '2026101912'),
    risk(91, 9, '2026101812'),
  ];
  const tracks = [
    { id: 214, cyclone_name: '2026101906_Wati', issued_time: '2026-10-19T06:00:00Z' },
    { id: 215, cyclone_name: '2026101912_Wati', issued_time: '2026-10-19T12:00:00Z' },
    { id: 210, cyclone_name: '2026101812_Wati', issued_time: '2026-10-18T12:00:00Z' },
    { id: 220, cyclone_name: '2026101812_Wati', issued_time: '2026-10-20T12:00:00Z' },
  ];

  it('makes one record per run, newest advisory first, each with only its own risks', () => {
    const records = expandEventModelRuns([wati()], riskRows, tracks);
    expect(records.map(r => r.forecastRunId)).toEqual(['4', '11', '9']);
    expect(records.map(r => r.trackIssuedTime)).toEqual([
      '2026-10-19T12:00:00Z',
      '2026-10-19T06:00:00Z',
      '2026-10-18T12:00:00Z',
    ]);
    expect(records.map(r => r.backendRiskIds)).toEqual([['41'], ['101', '102'], ['91']]);
    expect(records.every(r => r.modelRunStatus === 'complete')).toBe(true);
  });

  it('keeps the Event id on the newest advisory and ids the others by run', () => {
    const records = expandEventModelRuns([wati()], riskRows, tracks);
    expect(records.map(r => r.id)).toEqual(['7', '7-run-11', '7-run-9']);
  });

  it('names each advisory like a track, so the run picker can group and label it', () => {
    const records = expandEventModelRuns([wati()], riskRows, tracks);
    expect(records.map(r => r.cycloneName)).toEqual([
      '2026101912_Wati',
      '2026101906_Wati',
      '2026101812_Wati',
    ]);
  });

  it('gives each advisory the track that carries its own stamp', () => {
    const records = expandEventModelRuns([wati()], riskRows, tracks);
    expect(records[0].backendCycloneTrackId).toBe('215');
    expect(records[1].backendCycloneTrackId).toBe('214');
    // two tracks share 2026101812_Wati; the one issued at that time is the advisory
    expect(records[2].backendCycloneTrackId).toBe('210');
  });

  it('feeds the run picker as forecast runs', () => {
    const records = expandEventModelRuns([wati()], riskRows, tracks);
    const runs = listForecastRuns(records, 'CK');
    expect(runs.map(r => r.storm)).toEqual(['Wati', 'Wati', 'Wati']);
    expect(runs.map(r => r.isLatest)).toEqual([true, false, false]);
  });

  it('leaves out a run with no risk rows or no advisory time in its titles', () => {
    const rows = [...riskRows, { id: 5, model_run: 12, title: 'no stamp here' }];
    const event = { ...wati(), backendModelRunIds: ['11', '4', '9', '12', '99'] };
    expect(expandEventModelRuns([event], rows, tracks).map(r => r.forecastRunId)).toEqual([
      '4',
      '11',
      '9',
    ]);
  });

  it('returns the Event unchanged with fewer than two placeable runs', () => {
    const one = { ...wati(), backendModelRunIds: ['11'] };
    expect(expandEventModelRuns([one], riskRows, tracks)).toEqual([one]);
    const unplaceable = [{ id: 1, model_run: 11, title: 'no stamp' }, riskRows[2]];
    expect(expandEventModelRuns([wati()], unplaceable, tracks)).toEqual([wati()]);
  });

  it('does not touch events that are not forecasts or already come split', () => {
    const observed = { ...wati(), isForecast: false };
    expect(expandEventModelRuns([observed], riskRows, tracks)).toEqual([observed]);
    const split = { ...wati(), forecastRunId: '11' };
    expect(expandEventModelRuns([split], riskRows, tracks)).toEqual([split]);
  });
});
