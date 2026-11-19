import { forecastPeriod } from '../forecastPeriod';

const pt = (iso: string) => ({ time: new Date(iso) });

describe('forecastPeriod', () => {
  const points = [
    pt('2026-11-18T18:00:00Z'),
    pt('2026-11-19T00:00:00Z'),
    pt('2026-11-24T00:00:00Z'),
  ];

  it('spans the first to the last track point, in UTC', () => {
    const period = forecastPeriod(points, 'utc', 'CK');
    expect(period?.label).toBe('18 Nov 18:00 – 24 Nov 00:00 UTC');
    expect(period?.start.toISOString()).toBe('2026-11-18T18:00:00.000Z');
    expect(period?.end.toISOString()).toBe('2026-11-24T00:00:00.000Z');
  });

  it('does not depend on the order the points arrive in', () => {
    expect(forecastPeriod([...points].reverse(), 'utc', 'CK')?.label).toBe(
      '18 Nov 18:00 – 24 Nov 00:00 UTC'
    );
  });

  it("uses the country's own zone and says which one", () => {
    // Cook Islands are UTC-10: 18:00Z is 08:00 the same day, and midnight Z is 14:00 the day before
    expect(forecastPeriod(points, 'local', 'CK')?.label).toBe('18 Nov 08:00 – 23 Nov 14:00 UTC-10');
  });

  it('lands on the right calendar day for a country across the dateline from UTC', () => {
    // Samoa is UTC+13: 18:00Z on the 18th is 07:00 on the 19th
    expect(forecastPeriod(points, 'local', 'WS')?.label).toBe('19 Nov 07:00 – 24 Nov 13:00 UTC+13');
  });

  it('gives nothing for a single point, no points, or unusable times', () => {
    expect(forecastPeriod([pt('2026-11-18T18:00:00Z')], 'utc', 'CK')).toBeNull();
    expect(forecastPeriod([], 'utc', 'CK')).toBeNull();
    expect(forecastPeriod(null, 'utc', 'CK')).toBeNull();
    expect(forecastPeriod([pt('nonsense'), pt('2026-11-18T18:00:00Z')], 'utc', 'CK')).toBeNull();
    expect(
      forecastPeriod([pt('2026-11-18T18:00:00Z'), pt('2026-11-18T18:00:00Z')], 'utc', 'CK')
    ).toBeNull();
  });
});
