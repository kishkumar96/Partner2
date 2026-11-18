import {
  buildWindRadiiAt,
  windRadiiStepLabel,
  windRadiiSteps,
  type WindRadiiPoint,
} from '@/utils/windRadiiOverlay';

const point = (hour: number, extra: Partial<WindRadiiPoint> = {}): WindRadiiPoint => ({
  time: new Date(Date.UTC(2026, 10, 19, hour)),
  latitude: -15,
  longitude: 168,
  ...extra,
});

const lopsided = {
  galeRadiusNE: 120,
  galeRadiusSE: 60,
  galeRadiusSW: 30,
  galeRadiusNW: 60,
};

/** Great-circle distance in km, so the test does not lean on the code under test */
function km(a: [number, number], b: [number, number]): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b[1] - a[1]) / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

describe('windRadiiSteps', () => {
  it('keeps only points with radii of their own, in time order', () => {
    const steps = windRadiiSteps([
      point(12, lopsided),
      point(0, lopsided),
      point(6, { ...lopsided, radiiReported: false }),
      point(18),
    ]);
    expect(steps.map(s => s.time.getUTCHours())).toEqual([0, 12]);
  });

  it('is empty without points', () => {
    expect(windRadiiSteps(null)).toEqual([]);
  });
});

describe('buildWindRadiiAt', () => {
  it('draws nothing for a point without reported radii: no invented circles', () => {
    expect(buildWindRadiiAt(null)).toBeNull();
    expect(buildWindRadiiAt(point(0))).toBeNull();
    expect(buildWindRadiiAt(point(0, { ...lopsided, radiiReported: false }))).toBeNull();
  });

  it('draws each quadrant as an arc at its own radius, never reaching further than issued', () => {
    const [gale] = buildWindRadiiAt(
      point(0, { ...lopsided, radiiReported: true }),
      'sector'
    )!.features;
    const ring = gale.geometry.coordinates[0] as [number, number][];
    const centre: [number, number] = [168, -15];
    const distances = ring.map(p => km(centre, p));
    // 120 nm = 222 km in the north-east arc, and nothing is further than that
    expect(Math.max(...distances)).toBeCloseTo(120 * 1.852, 0);
    // The south-west arc is only 30 nm
    expect(Math.min(...distances.filter(d => d > 1))).toBeCloseTo(30 * 1.852, 0);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('can round the quadrants together, which reaches past the smaller side of a boundary', () => {
    const issued = buildWindRadiiAt(point(0, lopsided), 'sector')!.features[0];
    const smooth = buildWindRadiiAt(point(0, lopsided), 'smooth')!.features[0];
    expect(smooth.geometry.coordinates[0]).not.toEqual(issued.geometry.coordinates[0]);
  });

  it('is a circle when the four quadrants are equal', () => {
    const equal = { galeRadiusNE: 60, galeRadiusSE: 60, galeRadiusSW: 60, galeRadiusNW: 60 };
    const ring = buildWindRadiiAt(point(0, equal), 'sector')!.features[0].geometry
      .coordinates[0] as [number, number][];
    ring.forEach(p => expect(km([168, -15], p)).toBeCloseTo(60 * 1.852, 0));
  });

  it('lists gale before hurricane so the smaller ring draws on top, and carries the radii', () => {
    const result = buildWindRadiiAt(
      point(0, {
        ...lopsided,
        hurricaneRadiusNE: 20,
        hurricaneRadiusSE: 20,
        hurricaneRadiusSW: 20,
        hurricaneRadiusNW: 20,
      })
    )!;
    expect(result.features.map(f => f.properties.kind)).toEqual(['gale', 'hurricane']);
    expect(result.features[0].properties).toMatchObject({
      threshold: '34 kt',
      ne: 120,
      sw: 30,
      at: '2026-11-19T00:00:00.000Z',
    });
  });

  it('leaves a quadrant with no wind at the centre, not a gap', () => {
    const ring = buildWindRadiiAt(point(0, { galeRadiusNE: 50 }), 'sector')!.features[0].geometry
      .coordinates[0] as [number, number][];
    expect(ring.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))).toBe(true);
    expect(ring.some(p => p[0] === 168 && p[1] === -15)).toBe(true);
  });
});

describe('windRadiiStepLabel', () => {
  const when = new Date(Date.UTC(2026, 10, 19, 18));
  it('names the time in UTC or in the chosen zone', () => {
    expect(windRadiiStepLabel(when, null, 'UTC')).toBe('19 Nov 18:00 UTC');
    expect(windRadiiStepLabel(when, 'Pacific/Tongatapu', 'UTC+13')).toBe('20 Nov 07:00 UTC+13');
  });
});
