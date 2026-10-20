import {
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
