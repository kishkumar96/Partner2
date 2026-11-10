import {
  assessmentGap,
  defaultForecastRecord,
  groupForecastRuns,
  isModeEventId,
  listForecastRuns,
  newestUsableRun,
  stormNameOf,
} from '../forecastRuns';
import type { EventRecord } from '@/data/eventRecords';

const rec = (id: string, extra: Partial<EventRecord>): EventRecord =>
  ({
    id,
    countryCode: 'CK',
    name: id,
    date: '',
    hazardId: 'tropical-cyclone',
    location: { lat: 0, lng: 0 },
    bbox: [0, 0, 0, 0],
    source: 'partner_api',
    ...extra,
  }) as EventRecord;

describe('listForecastRuns', () => {
  it('orders forecast runs newest issue time first and flags the latest', () => {
    const runs = listForecastRuns(
      [
        rec('a', {
          isForecast: true,
          cycloneName: '2026101712_Wati',
          trackIssuedTime: '2026-10-17T12:00:00Z',
        }),
        rec('b', {
          isForecast: true,
          cycloneName: '2026101718_Wati',
          trackIssuedTime: '2026-10-17T18:00:00Z',
        }),
      ],
      'CK'
    );
    expect(runs.map(r => r.id)).toEqual(['b', 'a']);
    expect(runs.map(r => r.isLatest)).toEqual([true, false]);
  });

  it('ignores assessments and other countries', () => {
    const runs = listForecastRuns(
      [rec('x', {}), rec('y', { isForecast: true, countryCode: 'VU' })],
      'CK'
    );
    expect(runs).toEqual([]);
  });
});

describe('defaultForecastRecord', () => {
  const run = (id: string, issued: string, status?: string) =>
    rec(id, { isForecast: true, trackIssuedTime: issued, modelRunStatus: status });

  it('opens the newest run that completed, not a newer failed or pending one', () => {
    const records = [
      run('old', '2026-10-17T12:00:00Z', 'complete'),
      run('good', '2026-10-17T18:00:00Z', 'complete'),
      run('bad', '2026-10-18T00:00:00Z', 'failed'),
      run('wait', '2026-10-18T06:00:00Z', 'queued'),
    ];
    expect(defaultForecastRecord(records)?.id).toBe('good');
  });

  it('treats a run with no recorded status as usable (hand-loaded events)', () => {
    const records = [run('a', '2026-10-17T12:00:00Z'), run('b', '2026-10-18T12:00:00Z', 'failed')];
    expect(defaultForecastRecord(records)?.id).toBe('a');
  });

  it('falls back to the newest run when none completed, and to nothing when empty', () => {
    expect(
      defaultForecastRecord([
        run('x', '2026-10-17T12:00:00Z', 'failed'),
        run('y', '2026-10-18T12:00:00Z', 'queued'),
      ])?.id
    ).toBe('y');
    expect(defaultForecastRecord([])).toBeUndefined();
  });
});

describe('isModeEventId', () => {
  const runs = [{ id: '12' }, { id: '12-run-21' }];

  it('counts any forecast advisory, so a link to an older run opens it, not a filter', () => {
    expect(isModeEventId('12-run-21', runs, '7')).toBe(true);
    expect(isModeEventId('12', runs, '7')).toBe(true);
  });

  it('counts the assessment event, and nothing else', () => {
    expect(isModeEventId('7', runs, '7')).toBe(true);
    expect(isModeEventId('99', runs, '7')).toBe(false);
    expect(isModeEventId('99', [], undefined)).toBe(false);
  });
});

describe('assessmentGap', () => {
  const forecast = rec('f', {
    isForecast: true,
    name: 'TC Wati - Rapid exposure forecast',
    cycloneName: '2026101718_Wati',
    date: '2026-10-17',
  });
  const meena = rec('m', { name: 'Tropical Cyclone Meena', date: '2005-02-01' });

  it('reads the storm name out of an SPC track name', () => {
    expect(stormNameOf({ name: 'x', cycloneName: '2026101718_Wati' })).toBe('Wati');
    expect(stormNameOf({ name: 'Harold', cycloneName: undefined })).toBe('Harold');
  });

  it('flags an assessment for an older storm beside a live forecast', () => {
    expect(assessmentGap(forecast, meena)).toEqual({
      forecastStorm: 'Wati',
      assessmentName: 'Tropical Cyclone Meena',
    });
  });

  it('stays quiet when the assessment is for the same storm, or a recent one', () => {
    expect(
      assessmentGap(forecast, rec('w', { name: 'Tropical Cyclone Wati', date: '2026-10-25' }))
    ).toBeNull();
    expect(
      assessmentGap(forecast, rec('r', { name: 'Tropical Cyclone Zed', date: '2026-10-01' }))
    ).toBeNull();
  });

  it('stays quiet without both records, or when the "assessment" is a forecast', () => {
    expect(assessmentGap(null, meena)).toBeNull();
    expect(assessmentGap(forecast, undefined)).toBeNull();
    expect(assessmentGap(forecast, { ...meena, isForecast: true })).toBeNull();
  });
});

describe('storms and their advisories', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  const advisory = (storm: string, issued: string, extra: Partial<EventRecord> = {}) =>
    rec(`${storm}-${issued}`, {
      isForecast: true,
      cycloneName: `${issued.replace(/\D/g, '').slice(0, 10)}_${storm}`,
      name: `TC ${storm}`,
      trackIssuedTime: issued,
      modelRunStatus: 'complete',
      ...extra,
    });
  const records = [
    advisory('Wati', '2026-10-18T06:00:00Z'),
    advisory('Wati', '2026-10-17T18:00:00Z'),
    advisory('Xavier', '2026-10-18T00:00:00Z'),
    advisory('Xavier', '2026-10-17T12:00:00Z'),
    advisory('Harold', '2026-10-10T06:00:00Z'),
  ];

  it('marks the newest advisory of each storm as latest, not just one overall', () => {
    const runs = listForecastRuns(records, 'CK');
    const latest = runs.filter(r => r.isLatest).map(r => r.storm);
    expect(latest.sort()).toEqual(['Harold', 'Wati', 'Xavier']);
  });

  it('groups by storm: active storms first (newest advisory first), then past storms', () => {
    const groups = groupForecastRuns(listForecastRuns(records, 'CK'), now);
    expect(groups.map(g => [g.storm, g.active, g.runs.length])).toEqual([
      ['Wati', true, 2],
      ['Xavier', true, 2],
      ['Harold', false, 1],
    ]);
    expect(groups[0].runs.map(r => r.issuedAt)).toEqual([
      '2026-10-18T06:00:00Z',
      '2026-10-17T18:00:00Z',
    ]);
  });

  it('keeps one storm with many advisories as one list', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      advisory('Wati', new Date(Date.UTC(2026, 9, 13, 18) + i * 6 * 3600e3).toISOString())
    );
    const groups = groupForecastRuns(listForecastRuns(many, 'CK'), now);
    expect(groups).toHaveLength(1);
    expect(groups[0].runs).toHaveLength(20);
  });

  it('opens a chosen storm on its newest advisory that has results', () => {
    const withFailure = [
      advisory('Wati', '2026-10-18T06:00:00Z', { modelRunStatus: 'failed' }),
      advisory('Wati', '2026-10-17T18:00:00Z'),
    ];
    const [group] = groupForecastRuns(listForecastRuns(withFailure, 'CK'), now);
    expect(newestUsableRun(group).issuedAt).toBe('2026-10-17T18:00:00Z');
  });

  it('treats a storm with no recent advisory as past', () => {
    const [group] = groupForecastRuns(listForecastRuns([records[4]], 'CK'), now);
    expect(group.active).toBe(false);
  });
});
