import { buildTrackTimeLabels, timeZoneName } from '../trackTimeLabels';

const at = (iso: string, longitude: number, latitude: number) => ({
  time: new Date(iso),
  longitude,
  latitude,
});

// A track at 6-hourly steps that crosses UTC midnight between 18Z on the 18th and 00Z on the 19th
const track = [
  at('2026-11-18T12:00:00Z', -160, -10),
  at('2026-11-18T18:00:00Z', -161, -11),
  at('2026-11-19T00:00:00Z', -162, -12),
  at('2026-11-19T06:00:00Z', -163, -13),
];

describe('buildTrackTimeLabels', () => {
  it('marks midnight UTC with the new date and labels the other hours', () => {
    const out = buildTrackTimeLabels(track, { mode: 'utc', countryCode: 'CK' });
    const byKind = (kind: string) =>
      out?.features.filter(f => f.properties.kind === kind).map(f => f.properties.label);
    expect(byKind('day')).toEqual(['19 Nov']);
    expect(byKind('time')).toEqual(['12Z', '18Z', '06Z']);
  });

  it('places a midnight that falls between two points along the track', () => {
    const out = buildTrackTimeLabels(
      [at('2026-11-18T21:00:00Z', -160, -10), at('2026-11-19T03:00:00Z', -166, -16)],
      { mode: 'utc', countryCode: 'CK' }
    );
    const day = out?.features.find(f => f.properties.kind === 'day');
    expect(day?.geometry.coordinates[0]).toBeCloseTo(-163, 5);
    expect(day?.geometry.coordinates[1]).toBeCloseTo(-13, 5);
    expect(day?.properties.at).toBe('2026-11-19T00:00:00.000Z');
  });

  it('puts the day change at local midnight in local mode (Samoa is UTC+13)', () => {
    // 11:00Z on the 18th is midnight at the start of the 19th in Apia
    const out = buildTrackTimeLabels(
      [at('2026-11-18T08:00:00Z', -170, -14), at('2026-11-18T14:00:00Z', -171, -15)],
      { mode: 'local', countryCode: 'WS' }
    );
    const day = out?.features.find(f => f.properties.kind === 'day');
    expect(day?.properties.at).toBe('2026-11-18T11:00:00.000Z');
    expect(day?.properties.label).toBe('19 Nov');
  });

  it('interpolates across the dateline the short way round', () => {
    const out = buildTrackTimeLabels(
      [at('2026-11-18T21:00:00Z', 179, -15), at('2026-11-19T03:00:00Z', -179, -15)],
      { mode: 'utc', countryCode: 'TO' }
    );
    const lon = out?.features.find(f => f.properties.kind === 'day')?.geometry
      .coordinates[0] as number;
    expect(Math.abs(Math.abs(lon) - 180)).toBeLessThan(0.01);
  });

  it('formats local hours without a Z', () => {
    const out = buildTrackTimeLabels(track, { mode: 'local', countryCode: 'CK' });
    expect(out?.features.some(f => /^\d\d:00$/.test(f.properties.label))).toBe(true);
    expect(out?.features.some(f => f.properties.label.endsWith('Z'))).toBe(false);
  });

  it('gives nothing for fewer than two timed points', () => {
    expect(buildTrackTimeLabels(null, { mode: 'utc', countryCode: 'CK' })).toBeNull();
    expect(buildTrackTimeLabels([track[0]], { mode: 'utc', countryCode: 'CK' })).toBeNull();
    expect(
      buildTrackTimeLabels([track[0], { ...track[1], time: new Date('nope') }], {
        mode: 'utc',
        countryCode: 'CK',
      })
    ).toBeNull();
  });
});

describe('timeZoneName', () => {
  it('names the zone for the switch and legend', () => {
    expect(timeZoneName('utc', 'WS')).toBe('UTC');
    expect(timeZoneName('local', 'WS', new Date('2026-11-18T00:00:00Z'))).toBe('UTC+13');
    expect(timeZoneName('local', 'CK', new Date('2026-11-18T00:00:00Z'))).toBe('UTC-10');
  });
});
