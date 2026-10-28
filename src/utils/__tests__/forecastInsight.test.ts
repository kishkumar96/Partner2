import {
  approximate,
  buildAdvisoryStatus,
  buildForecastInsight,
  utcStamp,
} from '../forecastInsight';
import { WATI_17_OCT, WATI_19_OCT, exposureFixture } from '../testing/forecastFixtures';
import type { TimelinePoint } from '../forecastTimeline';

const NOW = Date.parse('2026-10-19T13:00:00Z');
const point = (id: string, issuedAt: string, people: number): TimelinePoint => ({
  id,
  issuedAt,
  people,
  buildings: people * 2,
  strongest: people > 0 ? 'gale' : null,
});

describe('approximate', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [19, '19'],
    [37, 'about 35'],
    [460, '460'],
    [463, 'about 460'],
    [2622, 'about 2,600'],
    [1608, 'about 1,600'],
    [14118, 'about 14,000'],
    [10894, 'about 11,000'],
    [15279, 'about 15,000'],
  ])('%s -> %s', (value, text) => {
    expect(approximate(value)).toBe(text);
  });
});

describe('buildForecastInsight, nothing exposed (the storm has moved away)', () => {
  const insight = buildForecastInsight({
    exposure: WATI_19_OCT(),
    countryName: 'Cook Islands',
    issuedAt: '2026-10-19T12:00:00Z',
    latestIssuedAt: '2026-10-19T12:00:00Z',
    now: NOW,
  });

  it('says plainly that no area sees gale-force winds', () => {
    expect(insight.level).toBe('none');
    expect(insight.headline).toBe('No area of Cook Islands is forecast to see gale-force winds.');
    expect(insight.detail).toBe('Nothing is under winds of 63 km/h or more on the forecast track.');
    expect(insight.areas).toEqual([]);
    expect(insight.people.text).toBe('0');
  });

  it('mentions people inside the track uncertainty when there are some', () => {
    const exposure = exposureFixture({
      regions: [{ name: 'Rarotonga', winds: '', people: 0 }],
      trackUncertaintyPeople: 3200,
    });
    const withUncertainty = buildForecastInsight({
      exposure,
      countryName: 'Cook Islands',
      now: NOW,
    });
    expect(withUncertainty.level).toBe('none');
    expect(withUncertainty.detail).toContain(
      '3,200 people are within the forecast track’s uncertainty'
    );
    const inexact = exposureFixture({
      regions: [{ name: 'Rarotonga', winds: '', people: 0 }],
      trackUncertaintyPeople: 3217,
    });
    expect(
      buildForecastInsight({ exposure: inexact, countryName: 'Cook Islands', now: NOW }).detail
    ).toContain('About 3,200 people are within the forecast track’s uncertainty');
  });
});

describe('buildForecastInsight, winds forecast and possible', () => {
  const insight = buildForecastInsight({
    exposure: WATI_17_OCT(),
    countryName: 'Cook Islands',
    issuedAt: '2026-10-17T12:00:00Z',
    latestIssuedAt: '2026-10-17T12:00:00Z',
    now: Date.parse('2026-10-17T14:00:00Z'),
  });

  it('separates where winds are forecast from where they are only possible', () => {
    expect(insight.level).toBe('forecast');
    expect(insight.strongest).toBe('gale');
    expect(insight.headline).toBe(
      'Gale-force winds are forecast in Mauke and Mitiaro. Gale-force winds are possible in Aitutaki and Atiu.'
    );
  });

  it('rounds the people and says how many are in areas where the winds are only possible', () => {
    expect(insight.people.exposed).toBe(2622);
    expect(insight.people.text).toBe('about 2,600');
    expect(insight.people.percentText).toBe('17%');
    expect(insight.people.possible).toBe(2069);
    expect(insight.people.confirmed).toBe(553);
    expect(insight.detail).toBe(
      'About 2,600 people (17%) live in areas under these winds. Most of them (about 2,100) are where the winds are only possible.'
    );
  });

  it('lists the exposed areas most people first, and leaves out the unexposed ones', () => {
    expect(insight.areas.map(a => a.name)).toEqual(['Aitutaki', 'Atiu', 'Mauke', 'Mitiaro']);
    expect(insight.areas[0]).toMatchObject({ people: 1608, kind: 'gale', possible: true });
  });

  it('adds up the facilities', () => {
    expect(insight.facilities).toEqual({ health: 3, schools: 8, evacuationCentres: 17, total: 28 });
  });
});

describe('buildForecastInsight, wording for other situations', () => {
  const insightFor = (
    regions: Parameters<typeof exposureFixture>[0]['regions'],
    totalPopulation = 15279
  ) =>
    buildForecastInsight({
      exposure: exposureFixture({ regions, totalPopulation }),
      countryName: 'Cook Islands',
      now: NOW,
    });

  it('says "possible" when winds only lie within the track uncertainty', () => {
    const insight = insightFor([
      { name: 'Atiu', winds: 'Possible Gale Winds', people: 461 },
      { name: 'Mitiaro', winds: 'Possible Gale Winds', people: 181 },
    ]);
    expect(insight.level).toBe('possible');
    expect(insight.headline).toBe('Gale-force winds are possible in Atiu and Mitiaro.');
    expect(insight.detail).toContain('All of them are where the winds are only possible.');
  });

  it('leads with the most severe winds', () => {
    const insight = insightFor([
      { name: 'Mauke', winds: 'Gale Winds', people: 372 },
      { name: 'Aitutaki', winds: 'Storm Winds', people: 1608 },
      { name: 'Atiu', winds: 'Possible Storm Winds', people: 461 },
    ]);
    expect(insight.strongest).toBe('storm');
    expect(insight.headline).toBe(
      'Storm-force winds are forecast in Aitutaki. Storm-force winds are possible in Atiu.'
    );
  });

  it('shortens a long list of areas', () => {
    const insight = insightFor(
      ['A', 'B', 'C', 'D', 'E'].map((name, i) => ({
        name: `Area ${name}`,
        winds: 'Gale Winds',
        people: 500 - i * 10,
      }))
    );
    expect(insight.headline).toBe(
      'Gale-force winds are forecast in Area A, Area B, Area C and 2 other areas.'
    );
  });

  it('says "less than 1%" instead of 0%, and "1 person" for one', () => {
    const tiny = insightFor([{ name: 'Mauke', winds: 'Gale Winds', people: 12 }], 150000);
    expect(tiny.people.percentText).toBe('less than 1%');
    expect(tiny.detail).toContain('12 people (less than 1%)');
    const one = insightFor([{ name: 'Mauke', winds: 'Gale Winds', people: 1 }]);
    expect(one.detail).toContain('1 person');
  });
});

describe('buildForecastInsight, how current the advisory is', () => {
  const exposure = WATI_17_OCT();
  const timeline = [
    point('a', '2026-10-17T12:00:00Z', 2622),
    point('b', '2026-10-18T06:00:00Z', 9000),
    point('c', '2026-10-18T18:00:00Z', 14118),
  ];

  it('flags an older advisory and says how many are newer', () => {
    const insight = buildForecastInsight({
      exposure,
      countryName: 'Cook Islands',
      issuedAt: '2026-10-17T12:00:00Z',
      latestIssuedAt: '2026-10-18T18:00:00Z',
      timeline,
      now: NOW,
    });
    expect(insight.status.kind).toBe('older');
    expect(insight.status.newer).toEqual({ issuedAt: '2026-10-18T18:00:00Z', count: 2 });
  });

  it('is "latest" when nothing newer exists and the advisory is recent', () => {
    const insight = buildForecastInsight({
      exposure,
      countryName: 'Cook Islands',
      issuedAt: '2026-10-19T08:00:00Z',
      latestIssuedAt: '2026-10-19T08:00:00Z',
      now: NOW,
    });
    expect(insight.status.kind).toBe('latest');
    expect(insight.status.newer).toBeNull();
  });

  it('warns when the newest advisory is itself getting old', () => {
    const insight = buildForecastInsight({
      exposure,
      countryName: 'Cook Islands',
      issuedAt: '2026-10-18T12:00:00Z',
      latestIssuedAt: '2026-10-18T12:00:00Z',
      now: NOW,
    });
    expect(insight.status.kind).toBe('latest-aging');
  });

  it('copes when the times are missing', () => {
    const insight = buildForecastInsight({ exposure, countryName: 'Cook Islands' });
    expect(insight.status.kind).toBe('latest');
    expect(insight.status.age).toBeNull();
  });
});

describe('buildForecastInsight, the trend across advisories', () => {
  const exposure = WATI_17_OCT();
  const run = (issuedAt: string, timeline: TimelinePoint[]) =>
    buildForecastInsight({ exposure, countryName: 'Cook Islands', issuedAt, timeline, now: NOW });

  it('reports the peak and that exposure has been falling', () => {
    const timeline = [
      point('1', '2026-10-17T12:00:00Z', 2622),
      point('2', '2026-10-18T18:00:00Z', 14118),
      point('3', '2026-10-19T06:00:00Z', 10894),
      point('4', '2026-10-19T12:00:00Z', 0),
    ];
    const trend = run('2026-10-19T12:00:00Z', timeline).trend;
    expect(trend?.peak.id).toBe('2');
    expect(trend?.current?.id).toBe('4');
    expect(trend?.summary).toBe(
      'Exposure peaked at about 14,000 people (18 Oct 18:00 UTC); this advisory: no one. It has been falling.'
    );
  });

  it('names the latest advisory when the one on screen is older, and does not claim a direction', () => {
    const timeline = [
      point('1', '2026-10-17T12:00:00Z', 2622),
      point('2', '2026-10-18T18:00:00Z', 14118),
      point('3', '2026-10-19T12:00:00Z', 0),
    ];
    expect(run('2026-10-17T12:00:00Z', timeline).trend?.summary).toBe(
      'Exposure peaked at about 14,000 people (18 Oct 18:00 UTC); this advisory: about 2,600 people; the latest advisory: no one in forecast winds.'
    );
  });

  it('says it has been rising when the newest advisory is higher than the one before', () => {
    const timeline = [
      point('1', '2026-10-17T12:00:00Z', 1000),
      point('2', '2026-10-17T18:00:00Z', 3000),
      point('3', '2026-10-18T00:00:00Z', 4000),
    ];
    expect(run('2026-10-18T00:00:00Z', timeline).trend?.summary).toBe(
      'This advisory has the highest exposure so far: 4,000 people.'
    );
    const falling = [
      point('1', '2026-10-17T12:00:00Z', 9000),
      point('2', '2026-10-17T18:00:00Z', 5000),
      point('3', '2026-10-18T00:00:00Z', 6500),
    ];
    expect(run('2026-10-18T00:00:00Z', falling).trend?.summary).toBe(
      'Exposure peaked at 9,000 people (17 Oct 12:00 UTC); this advisory: 6,500 people. It has been rising.'
    );
  });

  it('says so when the advisory on screen is the peak', () => {
    const timeline = [
      point('1', '2026-10-17T12:00:00Z', 2622),
      point('2', '2026-10-18T18:00:00Z', 14118),
    ];
    expect(run('2026-10-18T18:00:00Z', timeline).trend?.summary).toBe(
      'This advisory has the highest exposure so far: about 14,000 people.'
    );
  });

  it('says "about the same" when this advisory rounds to the peak, and what the latest shows', () => {
    const timeline = [
      point('1', '2026-10-18T12:00:00Z', 14118),
      point('2', '2026-10-19T00:00:00Z', 14116),
      point('3', '2026-10-19T12:00:00Z', 0),
    ];
    expect(run('2026-10-19T00:00:00Z', timeline).trend?.summary).toBe(
      'Exposure peaked at about 14,000 people (18 Oct 12:00 UTC); this advisory is about the same; the latest advisory: no one in forecast winds.'
    );
  });

  it('has no trend with one advisory, or when nobody was ever exposed', () => {
    expect(run('2026-10-17T12:00:00Z', [point('1', '2026-10-17T12:00:00Z', 100)]).trend).toBeNull();
    expect(
      run('2026-10-17T12:00:00Z', [
        point('1', '2026-10-17T12:00:00Z', 0),
        point('2', '2026-10-17T18:00:00Z', 0),
      ]).trend
    ).toBeNull();
  });

  it('puts the points in time order whatever order they arrive in', () => {
    const trend = run('2026-10-18T18:00:00Z', [
      point('2', '2026-10-18T18:00:00Z', 14118),
      point('1', '2026-10-17T12:00:00Z', 2622),
    ]).trend;
    expect(trend?.points.map(p => p.id)).toEqual(['1', '2']);
  });
});

describe('buildAdvisoryStatus', () => {
  const now = Date.UTC(2026, 9, 19, 14);
  const timeline: TimelinePoint[] = [
    { id: 'a', issuedAt: '2026-10-19T00:00:00Z', people: 1, buildings: 1, strongest: 'gale' },
    { id: 'b', issuedAt: '2026-10-19T06:00:00Z', people: 1, buildings: 1, strongest: 'gale' },
    { id: 'c', issuedAt: '2026-10-19T12:00:00Z', people: 1, buildings: 1, strongest: 'gale' },
  ];

  it('is older, with how many newer advisories exist, when a later one has results', () => {
    const status = buildAdvisoryStatus({
      issuedAt: '2026-10-19T00:00:00Z',
      latestIssuedAt: '2026-10-19T12:00:00Z',
      timeline,
      now,
    });
    expect(status.kind).toBe('older');
    expect(status.newer).toEqual({ issuedAt: '2026-10-19T12:00:00Z', count: 2 });
  });

  it('is the latest when nothing newer exists and the advisory is recent', () => {
    const status = buildAdvisoryStatus({
      issuedAt: '2026-10-19T12:00:00Z',
      latestIssuedAt: '2026-10-19T12:00:00Z',
      timeline,
      now,
    });
    expect(status.kind).toBe('latest');
    expect(status.newer).toBeNull();
  });

  it('says so when the newest advisory is itself old', () => {
    const status = buildAdvisoryStatus({
      issuedAt: '2026-10-19T12:00:00Z',
      latestIssuedAt: '2026-10-19T12:00:00Z',
      now: Date.UTC(2026, 9, 22, 12),
    });
    expect(status.kind).toBe('latest-aging');
  });

  it('is the latest, not an error, when the times are missing', () => {
    expect(buildAdvisoryStatus({}).kind).toBe('latest');
  });

  it('is the same status the insight carries', () => {
    const insight = buildForecastInsight({
      exposure: WATI_17_OCT(),
      countryName: 'Cook Islands',
      issuedAt: '2026-10-19T00:00:00Z',
      latestIssuedAt: '2026-10-19T12:00:00Z',
      timeline,
      now,
    });
    expect(insight.status).toEqual(
      buildAdvisoryStatus({
        issuedAt: '2026-10-19T00:00:00Z',
        latestIssuedAt: '2026-10-19T12:00:00Z',
        timeline,
        now,
      })
    );
  });
});

describe('utcStamp', () => {
  it('writes a time people can read, in UTC', () => {
    expect(utcStamp('2026-10-18T18:00:00Z')).toBe('18 Oct 18:00 UTC');
    expect(utcStamp('nonsense')).toBe('an earlier advisory');
    expect(utcStamp(null)).toBe('an earlier advisory');
  });
});
