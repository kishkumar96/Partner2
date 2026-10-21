import { resolveActiveEventRecord } from '../eventRecords';

const base = {
  countryCode: 'VU' as const,
  hazardId: 'tropical-cyclone',
  location: { lat: -17, lng: 168 },
  bbox: [167, -18, 169, -16] as [number, number, number, number],
  source: 'partner_api' as const,
};

describe('resolveActiveEventRecord', () => {
  it('prefers a post-event assessment over a same-day rapid forecast', () => {
    const assessment = {
      ...base,
      id: 'assessment',
      name: 'TC Example assessment',
      date: '2026-04-08',
    };
    const forecast = {
      ...base,
      id: 'forecast',
      name: 'TC Example rapid exposure forecast',
      date: '2026-04-08',
      isForecast: true,
    };

    expect(resolveActiveEventRecord('VU', [forecast, assessment]).id).toBe('assessment');
  });

  it('honours an explicit event choice even when it is a forecast', () => {
    const assessment = { ...base, id: 'assessment', name: 'Assessment', date: '2026-04-08' };
    const forecast = {
      ...base,
      id: 'forecast',
      name: 'Forecast',
      date: '2026-04-08',
      isForecast: true,
    };

    expect(resolveActiveEventRecord('VU', [assessment, forecast], ['forecast']).id).toBe(
      'forecast'
    );
  });

  describe('between advisories of one storm', () => {
    const run = (id: string, issued: string, modelRunStatus?: string) => ({
      ...base,
      id,
      name: 'TC Wati',
      date: issued.slice(0, 10),
      isForecast: true,
      trackIssuedTime: issued,
      modelRunStatus,
    });

    it('opens the latest advisory of the day whatever order the API lists them', () => {
      const am = run('am', '2026-10-17T12:00:00Z', 'complete');
      const pm = run('pm', '2026-10-17T18:00:00Z', 'complete');
      expect(resolveActiveEventRecord('VU', [am, pm]).id).toBe('pm');
      expect(resolveActiveEventRecord('VU', [pm, am]).id).toBe('pm');
    });

    it('does not open a newer failed or pending run while a usable one exists', () => {
      const good = run('good', '2026-10-17T18:00:00Z', 'complete');
      const failed = run('failed', '2026-10-18T06:00:00Z', 'failed');
      const queued = run('queued', '2026-10-18T12:00:00Z', 'queued');
      expect(resolveActiveEventRecord('VU', [queued, failed, good]).id).toBe('good');
    });

    it('still opens the failed run when it is chosen explicitly', () => {
      const good = run('good', '2026-10-17T18:00:00Z', 'complete');
      const failed = run('failed', '2026-10-18T06:00:00Z', 'failed');
      expect(resolveActiveEventRecord('VU', [good, failed], ['failed']).id).toBe('failed');
    });

    it('falls back to the newest run when none has results', () => {
      const a = run('a', '2026-10-17T18:00:00Z', 'failed');
      const b = run('b', '2026-10-18T06:00:00Z', 'queued');
      expect(resolveActiveEventRecord('VU', [a, b]).id).toBe('b');
    });
  });
});
