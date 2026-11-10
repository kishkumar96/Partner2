import { buildForecastBrief, formatUtc, type ForecastBriefInput } from '../forecastBrief';
import { defaultThresholds, prioritise } from '../responsePriority';
import type { ExposureArea, ExposureTotals, ForecastExposure } from '../forecastExposure';

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
  name: string,
  winds: string,
  exposed: Partial<ExposureTotals>,
  fp = 0
): ExposureArea =>
  ({
    name,
    overallWinds: winds,
    minWindKmph: null,
    maxWindKmph: null,
    exposed: totals(exposed),
    inFloodplains: totals(),
    inTrackUncertainty: totals(),
    total: totals(),
    totalPopulation: 0,
    totalBuildings: 0,
    populationInFloodplains: fp,
    populationInTrackUncertainty: 0,
  }) as ExposureArea;

const regions = [
  area(
    'Sanma',
    'Hurricane Winds',
    { population: 62016, buildings: 42801, healthFacilities: 25 },
    18996
  ),
  area(
    'Shefa',
    'Possible Gale Winds',
    { population: 108833, buildings: 43355, healthFacilities: 21 },
    41080
  ),
];

const exposure: ForecastExposure = {
  national: area('Vanuatu', 'Hurricane Winds', {
    population: 260935,
    buildings: 148660,
    buildingValue: 7_569_220_132,
    healthFacilities: 117,
    schools: 362,
    evacuationCentres: 563,
  }),
  regions,
  byWindDanger: [
    { label: 'Hurricane Winds', value: null, totals: totals({ population: 79950, buildings: 5 }) },
    { label: 'Track Uncertainty', value: null, totals: totals({ population: 43510 }) },
    { label: 'Gale Winds', value: null, totals: totals({ population: 16600 }) },
  ],
  byTrackDistance: [],
  facilities: [],
  layers: {
    facilities: null,
    windSwaths: null,
    trackDistance: null,
    cycloneTrack: null,
    cycloneTrackSource: 'event',
    floodplainRowId: null,
  },
};

const GENERATED = new Date('2026-04-08T12:15:00Z');

const input = (over: Partial<ForecastBriefInput> = {}): ForecastBriefInput => {
  const results = prioritise(
    regions.map(a => ({ name: a.name, area: a })),
    defaultThresholds(),
    3
  );
  return {
    exposure,
    countryName: 'Vanuatu',
    eventName: 'Tropical Cyclone Lola',
    issuedAt: '2026-04-08T12:00:00Z',
    layerSummary: 'Wind swaths · Facilities',
    priority: {
      results,
      counts: { red: 1, amber: 0, green: 1, grey: 0 },
      isCustom: false,
      staleAfterHours: 24,
      ageHours: 0.25,
    },
    areaLabel: 'districts',
    regionLabel: 'provinces',
    generatedAt: GENERATED,
    ...over,
  };
};

describe('formatUtc', () => {
  it('formats a UTC time, or just the date when no time is known', () => {
    expect(formatUtc('2026-04-08T12:00:00Z')).toBe('08 Apr 2026 12:00 UTC');
    expect(formatUtc('2023-10-23')).toBe('23 Oct 2023');
    expect(formatUtc(undefined)).toBeNull();
    expect(formatUtc('nonsense')).toBeNull();
  });
});

describe('buildForecastBrief', () => {
  it('names the event, country and times on page 1', () => {
    const b = buildForecastBrief(input());
    expect(b.kicker).toBe('RAPID EXPOSURE FORECAST · OPERATIONAL BRIEF');
    expect(b.heading).toBe('TC Lola · Vanuatu');
    expect(b.timesLine).toBe(
      'Track issued: 08 Apr 2026 12:00 UTC · Generated: 08 Apr 2026 12:15 UTC'
    );
  });

  it('puts the exposure-not-damage statement in the model, and never uses damage wording for figures', () => {
    const b = buildForecastBrief(input());
    expect(b.disclaimer).toMatch(/not a damage estimate/i);
    expect(b.disclaimer).toMatch(/not a probability of damage or casualty/i);
    expect((b.disclaimer.match(/not a damage estimate/gi) ?? []).length).toBe(1);
    expect(b.headline.map(h => h.label).join(' ')).not.toMatch(/damage|loss|affected/i);
    expect(b.headline[0]).toEqual({ label: 'People exposed', value: '260,935' });
    expect(b.headline[2].value).toBe('US$7.57B');
  });

  it('shows the freshness state unmistakably', () => {
    expect(buildForecastBrief(input()).freshness.kind).toBe('latest-known');
    const old = buildForecastBrief(input({ issuedAt: '2026-04-05T12:00:00Z' }));
    expect(old.freshness.kind).toBe('old');
    expect(old.freshness.text).toMatch(/check before acting/i);
    const sup = buildForecastBrief(input({ modelRunStatus: 'superseded' }));
    expect(sup.freshness.kind).toBe('superseded');
    expect(sup.freshness.text).toMatch(/do not act on this brief/i);
    expect(buildForecastBrief(input({ issuedAt: undefined })).freshness.kind).toBe('unknown');
  });

  it('never claims "current": the freshest state is "latest known"', () => {
    expect(JSON.stringify(buildForecastBrief(input()).freshness)).not.toMatch(/CURRENT/);
  });

  it('prints "not recorded" for what the data does not carry', () => {
    const ctx = buildForecastBrief(input()).context.join('\n');
    expect(ctx).toContain('Model run / version: not recorded');
    expect(ctx).toContain('Exposure dataset date: not recorded');
    expect(ctx).toContain('Run completed: not recorded');
  });

  it('says honestly which track is shown', () => {
    expect(buildForecastBrief(input()).mapCaption).toMatch(/linked to this event/i);
    const own = buildForecastBrief(
      input({
        exposure: { ...exposure, layers: { ...exposure.layers, cycloneTrackSource: 'run' } },
      })
    );
    expect(own.mapCaption).toMatch(/Rapid Exposure Forecast input track/);
  });

  it('lists Red areas first with the numbers, then Amber/Green summaries, labelled preliminary', () => {
    const b = buildForecastBrief(input());
    expect(b.priorities.preliminary).toMatch(/preliminary/i);
    expect(b.priorities.rows[0]).toMatchObject({ level: 'red' });
    expect(b.priorities.rows[0].text).toContain('Sanma');
    expect(b.priorities.rows[0].text).toContain('62,016 people');
    expect(b.priorities.thresholds).toMatch(/starting defaults/i);
  });

  it('flags priorities as unverified when the advisory is too old', () => {
    const b = buildForecastBrief(
      input({
        priority: { ...input().priority!, ageHours: 100 },
      })
    );
    expect(b.priorities.unverified).toMatch(/too old to act on/i);
  });

  it('names custom thresholds for the country', () => {
    const b = buildForecastBrief(input({ priority: { ...input().priority!, isCustom: true } }));
    expect(b.priorities.thresholds).toBe('Thresholds: custom for Vanuatu');
  });

  it('page 2: areas by people exposed, and only wind bands that count as exposed', () => {
    const b = buildForecastBrief(input());
    expect(b.areaTable.title).toBe('EXPOSURE BY PROVINCE');
    expect(b.areaTable.rows.map(r => r[0])).toEqual(['Shefa', 'Sanma']);
    expect(b.areaTable.rows[1]).toEqual(['Sanma', 'Hurricane', '62,016', '42,801', '25', '18,996']);
    expect(b.windTable.rows.map(r => r[0])).toEqual(['Hurricane', 'Gale']);
  });

  it('lists the Red areas that did not fit on page 1, on page 2', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      area(`Area ${i + 1}`, 'Hurricane Winds', { population: 9000 - i * 100 })
    );
    const results = prioritise(
      many.map(a => ({ name: a.name, area: a })),
      defaultThresholds(),
      3
    );
    const b = buildForecastBrief(input({ priority: { ...input().priority!, results } }));
    expect(b.priorities.rows.filter(r => r.level === 'red')).toHaveLength(5);
    expect(b.priorities.overflow).toBe('3 more Red areas listed on page 2');
    expect(b.priorities.otherRed?.heading).toBe('OTHER RED AREAS (3)');
    expect(b.priorities.otherRed?.text).toBe(
      'Area 6 (8,500 people) · Area 7 (8,400 people) · Area 8 (8,300 people)'
    );
  });

  it('has no other-Red section when everything fits on page 1', () => {
    expect(buildForecastBrief(input()).priorities.otherRed).toBeNull();
  });

  it('works without priorities', () => {
    const b = buildForecastBrief(input({ priority: null }));
    expect(b.priorities.show).toBe(false);
  });
});
