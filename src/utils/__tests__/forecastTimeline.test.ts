import {
  buildForecastTimeline,
  exposedBuildings,
  exposedPeople,
  strongestBandLabel,
  strongestWind,
} from '../forecastTimeline';
import {
  WATI_17_OCT,
  WATI_19_OCT,
  exposureFixture,
  recordFixture,
} from '../testing/forecastFixtures';

describe('buildForecastTimeline', () => {
  const records = [
    recordFixture({ id: '10', trackIssuedTime: '2026-10-19T12:00:00Z' }),
    recordFixture({ id: '10-run-5', trackIssuedTime: '2026-10-17T12:00:00Z' }),
    recordFixture({
      id: '10-run-6',
      trackIssuedTime: '2026-10-18T12:00:00Z',
      modelRunStatus: 'failed',
    }),
    recordFixture({
      id: '10-run-7',
      trackIssuedTime: '2026-10-18T18:00:00Z',
      modelRunStatus: 'running',
    }),
    recordFixture({
      id: '99',
      trackIssuedTime: '2026-10-17T18:00:00Z',
      cycloneName: '2026101718_OTHER',
      name: 'Tropical Cyclone Other',
    }),
    recordFixture({ id: '98', trackIssuedTime: '2026-10-17T18:00:00Z', countryCode: 'VU' }),
    recordFixture({ id: '97', trackIssuedTime: '2026-10-17T00:00:00Z', isForecast: false }),
    recordFixture({ id: '96', trackIssuedTime: 'not a time' }),
  ];
  const active = records[0];
  const byId: Record<string, ReturnType<typeof WATI_17_OCT>> = {
    '10': WATI_19_OCT(),
    '10-run-5': WATI_17_OCT(),
  };

  it('lists the storm’s advisories that have results, oldest first', () => {
    const timeline = buildForecastTimeline(records, active, r => byId[r.id] ?? null);
    expect(timeline.map(p => p.id)).toEqual(['10-run-5', '10']);
    expect(timeline.map(p => p.people)).toEqual([2622, 0]);
    expect(timeline[0].strongest).toBe('gale');
    expect(timeline[1].strongest).toBeNull();
  });

  it('leaves out failed and unfinished runs, other storms, other countries and non-forecasts', () => {
    const asked: string[] = [];
    buildForecastTimeline(records, active, r => {
      asked.push(r.id);
      return byId[r.id] ?? null;
    });
    expect(asked.sort()).toEqual(['10', '10-run-5']);
  });

  it('skips an advisory whose results cannot be read', () => {
    const timeline = buildForecastTimeline(records, active, r =>
      r.id === '10' ? WATI_19_OCT() : null
    );
    expect(timeline.map(p => p.id)).toEqual(['10']);
  });

  it('has nothing when the storm has no name to match on', () => {
    expect(
      buildForecastTimeline(records, { countryCode: 'CK', cycloneName: '', name: '' }, () =>
        WATI_17_OCT()
      )
    ).toEqual([]);
  });
});

describe('exposure totals', () => {
  it('reads people, buildings and the strongest wind from an exposure', () => {
    const exposure = WATI_17_OCT();
    expect(exposedPeople(exposure)).toBe(2622);
    expect(exposedBuildings(exposure)).toBeGreaterThan(0);
    expect(strongestWind(exposure)).toBe('gale');
  });

  it('finds storm and hurricane when they are present', () => {
    expect(
      strongestWind(
        exposureFixture({
          regions: [
            { name: 'A', winds: 'Storm Winds', people: 10 },
            { name: 'B', winds: 'Gale Winds', people: 5 },
          ],
        })
      )
    ).toBe('storm');
    expect(
      strongestWind(
        exposureFixture({ regions: [{ name: 'A', winds: 'Possible Hurricane Winds', people: 10 }] })
      )
    ).toBe('hurricane');
    expect(strongestWind(WATI_19_OCT())).toBeNull();
  });
});

describe('strongestBandLabel', () => {
  it('finds the strongest band across the areas, not just the national row', () => {
    // In real output the national row says "Possible Gale Winds" while Mauke has confirmed "Gale Winds"
    const exposure = WATI_17_OCT();
    expect(exposure.national?.overallWinds).toBe('Gale Winds'); // the fixture's national row follows its areas…
    const lagging = {
      ...exposure,
      national: { ...exposure.national!, overallWinds: 'Possible Gale Winds' },
    };
    expect(strongestBandLabel(lagging)).toBe('Gale Winds');
    expect(strongestWind(lagging)).toBe('gale');
  });

  it('puts a confirmed band above the same band when only possible, and storm above gale', () => {
    const mixed = exposureFixture({
      regions: [
        { name: 'A', winds: 'Possible Storm Winds', people: 5 },
        { name: 'B', winds: 'Gale Winds', people: 9 },
      ],
    });
    expect(strongestBandLabel(mixed)).toBe('Possible Storm Winds');
  });

  it('is null when nothing is exposed', () => {
    expect(strongestBandLabel(WATI_19_OCT())).toBeNull();
  });
});
