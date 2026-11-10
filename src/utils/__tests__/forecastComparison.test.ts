import { compareForecasts, previousAdvisory } from '../forecastComparison';
import type { ExposureArea, ForecastExposure } from '../forecastExposure';
import type { EventRecord } from '@/data/eventRecords';

const area = (
  name: string,
  population: number,
  buildings: number,
  winds: string | null,
  maxWindKmph: number | null = null
): ExposureArea =>
  ({
    name,
    overallWinds: winds,
    maxWindKmph,
    exposed: { population, buildings, buildingValue: buildings * 1000 },
  }) as unknown as ExposureArea;

const forecast = (national: ExposureArea, regions: ExposureArea[]) =>
  ({ national, regions }) as unknown as ForecastExposure;

describe('compareForecasts', () => {
  const before = forecast(area('Cook Islands', 2622, 5201, 'Possible Gale Winds'), [
    area('Aitutaki', 1608, 3564, 'Possible Gale Winds'),
    area('Atiu', 461, 778, 'Possible Gale Winds'),
    area('Mauke', 372, 463, 'Gale Winds'),
    area('Rarotonga', 0, 0, null),
  ]);

  it('reports the change in totals and in which areas are exposed', () => {
    const after = forecast(area('Cook Islands', 3000, 5600, 'Gale Winds'), [
      area('Aitutaki', 1608, 3564, 'Gale Winds'),
      area('Atiu', 0, 0, null),
      area('Mauke', 372, 463, 'Gale Winds'),
      area('Rarotonga', 380, 400, 'Possible Gale Winds'),
    ]);
    const change = compareForecasts(after, before);
    expect(change.people).toBe(378);
    expect(change.buildings).toBe(399);
    expect(change.newlyExposed).toEqual(['Rarotonga']);
    expect(change.noLongerExposed).toEqual(['Atiu']);
    expect(change.windChanges).toEqual([
      { area: 'Aitutaki', from: 'Possible Gale Winds', to: 'Gale Winds', stronger: true },
    ]);
    expect(change.unchanged).toBe(false);
  });

  it('reports a real change in strongest wind inside the same band, but not noise', () => {
    const was = forecast(area('Cook Islands', 100, 10, 'Possible Gale Winds'), [
      area('Aitutaki', 100, 10, 'Possible Gale Winds', 89),
      area('Atiu', 50, 5, 'Possible Gale Winds', 63),
    ]);
    const now = forecast(area('Cook Islands', 100, 10, 'Possible Gale Winds'), [
      area('Aitutaki', 100, 10, 'Possible Gale Winds', 63),
      area('Atiu', 50, 5, 'Possible Gale Winds', 65),
    ]);
    const change = compareForecasts(now, was);
    expect(change.speedChanges).toEqual([{ area: 'Aitutaki', from: 89, to: 63 }]);
    expect(change.unchanged).toBe(false);
  });

  it('says so when nothing moved', () => {
    expect(compareForecasts(before, before).unchanged).toBe(true);
  });
});

describe('previousAdvisory', () => {
  const run = (id: string, issued: string, extra: Partial<EventRecord> = {}) =>
    ({
      id,
      countryCode: 'CK',
      name: 'TC Wati',
      cycloneName: '2026101712_Wati',
      isForecast: true,
      trackIssuedTime: issued,
      modelRunStatus: 'complete',
      ...extra,
    }) as EventRecord;

  it('picks the newest earlier advisory of the same storm that has results', () => {
    const records = [
      run('a', '2026-10-17T06:00:00Z'),
      run('b', '2026-10-17T12:00:00Z'),
      run('failed', '2026-10-17T15:00:00Z', { modelRunStatus: 'failed' }),
      run('c', '2026-10-17T18:00:00Z'),
      run('other', '2026-10-17T16:00:00Z', { cycloneName: '2026101716_Zed', name: 'TC Zed' }),
    ];
    expect(previousAdvisory(records, records[3])?.id).toBe('b');
  });

  it('has none for the first advisory, or when the issue time is unknown', () => {
    const first = run('a', '2026-10-17T06:00:00Z');
    expect(previousAdvisory([first], first)).toBeNull();
    expect(previousAdvisory([first], run('x', ''))).toBeNull();
  });
});
