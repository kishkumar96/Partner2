import {
  areaMetrics,
  countByLevel,
  defaultThresholds,
  evaluateArea,
  prioritise,
  sanitizeThresholds,
  type PriorityMetrics,
} from '../responsePriority';
import type { ExposureArea, ExposureTotals } from '../forecastExposure';

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

const area = (
  winds: string | null,
  exposed: Partial<ExposureTotals>,
  over: Partial<ExposureArea> = {}
): ExposureArea =>
  ({
    name: 'x',
    overallWinds: winds,
    minWindKmph: null,
    maxWindKmph: null,
    exposed: totals(exposed),
    inFloodplains: totals(),
    inTrackUncertainty: totals(),
    total: totals(),
    totalPopulation: 0,
    totalBuildings: 0,
    populationInFloodplains: 0,
    populationInTrackUncertainty: 0,
    ...over,
  }) as ExposureArea;

const FRESH = 3; // hours

describe('evaluateArea', () => {
  const t = defaultThresholds();

  it('is Red for hurricane winds with many people, and says why with the numbers', () => {
    const r = evaluateArea(
      'North Maewo',
      areaMetrics(area('Hurricane Winds', { population: 2775 })),
      t,
      FRESH
    );
    expect(r.level).toBe('red');
    expect(r.reasons[0]).toContain('Hurricane Winds or stronger (forecast: Hurricane Winds)');
    expect(r.reasons[0]).toContain('people exposed ≥ 1,000 (2,775)');
  });

  it('is Red for hurricane winds with any exposed health facility, even with few people', () => {
    const r = evaluateArea(
      'A',
      areaMetrics(area('Hurricane Winds', { population: 10, healthFacilities: 1 })),
      t,
      FRESH
    );
    expect(r.level).toBe('red');
  });

  it('keeps storm-force exposure Amber, not Red, by default', () => {
    const r = evaluateArea(
      'A',
      areaMetrics(area('Storm Winds', { population: 9000, healthFacilities: 4 })),
      t,
      FRESH
    );
    expect(r.level).toBe('amber');
  });

  it('needs ALL conditions of a rule: hurricane winds alone, with too few people, is not Red', () => {
    const r = evaluateArea('A', areaMetrics(area('Hurricane Winds', { population: 50 })), t, FRESH);
    expect(r.level).toBe('amber'); // falls to the gale-or-stronger rule
  });

  it('is Amber for gale winds, Green when nothing is met', () => {
    expect(
      evaluateArea('A', areaMetrics(area('Gale Winds', { population: 20 })), t, FRESH).level
    ).toBe('amber');
    const green = evaluateArea('B', areaMetrics(area('Not exposed', {})), t, FRESH);
    expect(green.level).toBe('green');
    expect(green.reasons).toEqual(['No Red or Amber rule is met']);
  });

  it('is Amber when track uncertainty reaches many people', () => {
    const r = evaluateArea(
      'A',
      areaMetrics(area('Track Uncertainty', {}, { populationInTrackUncertainty: 900 })),
      t,
      FRESH
    );
    expect(r.level).toBe('amber');
  });

  it("shows grey, with the rules' reading kept, when the advisory is stale or its age unknown", () => {
    const m = areaMetrics(area('Hurricane Winds', { population: 5000 }));
    const stale = evaluateArea('A', m, t, 48);
    expect(stale.level).toBe('grey');
    expect(stale.underlyingLevel).toBe('red');
    expect(evaluateArea('A', m, t, null).level).toBe('grey');
  });

  it('ignores disabled rules', () => {
    const custom = defaultThresholds();
    custom.red.forEach(rule => (rule.enabled = false));
    const r = evaluateArea(
      'A',
      areaMetrics(area('Hurricane Winds', { population: 5000 })),
      custom,
      FRESH
    );
    expect(r.level).toBe('amber');
  });

  it('follows edited thresholds', () => {
    const custom = defaultThresholds();
    custom.red[0].conditions.find(c => c.metric === 'people')!.min = 10_000;
    const metrics = areaMetrics(area('Hurricane Winds', { population: 2775 }));
    expect(evaluateArea('A', metrics, defaultThresholds(), FRESH).level).toBe('red');
    expect(evaluateArea('A', metrics, custom, FRESH).level).toBe('amber');
  });
});

describe('prioritise', () => {
  it('orders worst first, then by people exposed, and counts each level', () => {
    const results = prioritise(
      [
        { name: 'Gale small', area: area('Gale Winds', { population: 10 }) },
        { name: 'Hurricane small', area: area('Hurricane Winds', { population: 1500 }) },
        { name: 'Hurricane big', area: area('Hurricane Winds', { population: 9000 }) },
        { name: 'Quiet', area: area('Not exposed', {}) },
      ],
      defaultThresholds(),
      FRESH
    );
    expect(results.map(r => r.name)).toEqual([
      'Hurricane big',
      'Hurricane small',
      'Gale small',
      'Quiet',
    ]);
    expect(countByLevel(results)).toEqual({ red: 2, amber: 1, green: 1, grey: 0 });
  });
});

describe('sanitizeThresholds', () => {
  it('falls back to defaults for junk', () => {
    expect(sanitizeThresholds(null)).toEqual(defaultThresholds());
    expect(sanitizeThresholds('x')).toEqual(defaultThresholds());
    expect(sanitizeThresholds({ red: 'nope', amber: [], staleAfterHours: -5 })).toEqual(
      defaultThresholds()
    );
  });

  it('keeps valid edits and drops invalid conditions', () => {
    const raw = defaultThresholds() as unknown as Record<string, unknown>;
    (raw.red as Array<{ conditions: unknown[] }>)[0].conditions.push({ metric: 'bogus', min: 1 });
    (raw as { staleAfterHours: number }).staleAfterHours = 6;
    const clean = sanitizeThresholds(raw);
    expect(clean.staleAfterHours).toBe(6);
    expect(clean.red[0].conditions.map(c => c.metric)).not.toContain('bogus' as never);
  });
});

describe('metrics', () => {
  it('reads the wind band as its rank and exposure from the area', () => {
    const m: PriorityMetrics = areaMetrics(area('Storm Winds', { population: 7, schools: 2 }));
    expect(m.windBand).toBe(5);
    expect(m).toMatchObject({ people: 7, schools: 2 });
  });
});
