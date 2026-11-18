import {
  MAP_DANGER_NAMES,
  WIND_DANGER_ORDER,
  windDangerColor,
  windDangerRank,
} from '../forecastExposure';
import { forecastCsvRows } from '../forecastBriefing';
import { buildAdvisoryStatus, buildForecastInsight } from '../forecastInsight';
import { countNewerAdvisories } from '../forecastRuns';
import { strongestBandLabel, strongestWind } from '../forecastTimeline';
import { areaMetrics, defaultThresholds, prioritise } from '../responsePriority';
import { exposureFixture } from '../testing/forecastFixtures';
import { windBandShortLabel, windKindForSpeed } from '../windScale';

const CORE = 'Radius of Maximum Winds';

/** TC Xavier, 18 Nov 12:00: Nassau in the core at 120 km/h, Pukapuka only possibly under storm winds */
const xavier = () =>
  exposureFixture({
    regions: [
      { name: 'Pukapuka', winds: 'Possible Storm Winds', people: 463, maxWindKmph: 89, schools: 1 },
      { name: 'Nassau', winds: CORE, people: 70, maxWindKmph: 120, schools: 1 },
    ],
  });

describe('one severity ordering, with the core at the top', () => {
  it('ranks every band REF can name, so no band reads as "not exposed"', () => {
    for (const name of MAP_DANGER_NAMES) {
      expect(windDangerRank(name)).toBeGreaterThanOrEqual(0);
      // and every one has its own colour, not the fallback grey
      expect(windDangerColor(name)).not.toBe('#94a3b8');
    }
    expect(WIND_DANGER_ORDER[WIND_DANGER_ORDER.length - 1]).toBe(CORE);
    expect(windDangerRank('not a band')).toBe(-1);
    expect(windDangerRank(null)).toBe(-1);
  });

  it('keeps the position of every older band, so saved rules still mean the same', () => {
    expect(WIND_DANGER_ORDER.slice(0, 8)).toEqual([
      'Not exposed',
      'Track Uncertainty',
      'Possible Gale Winds',
      'Gale Winds',
      'Possible Storm Winds',
      'Storm Winds',
      'Possible Hurricane Winds',
      'Hurricane Winds',
    ]);
  });

  it('ranks the core by the storm’s own wind, and at the top when that is unknown', () => {
    const rank = (name: string) => windDangerRank(name);
    expect(windDangerRank(CORE, 130)).toBe(rank('Hurricane Winds'));
    expect(windDangerRank(CORE, 120)).toBe(rank('Hurricane Winds'));
    expect(windDangerRank(CORE, 100)).toBe(rank('Storm Winds'));
    expect(windDangerRank(CORE, 70)).toBe(rank('Gale Winds'));
    expect(windDangerRank(CORE, 40)).toBe(rank('Track Uncertainty'));
    expect(windDangerRank(CORE)).toBe(rank(CORE));
    expect(windDangerRank(CORE, null)).toBe(rank(CORE));
    expect(windKindForSpeed(117)).toBe('storm');
    expect(windKindForSpeed(118)).toBe('hurricane');
    expect(windKindForSpeed(62)).toBeNull();
  });

  it('labels the core in full in a legend', () => {
    expect(windBandShortLabel(CORE)).toBe('Core (radius of max. winds)');
    expect(windBandShortLabel('Possible Gale Winds')).toBe('Possible Gale');
  });
});

const rate = (exposure: ReturnType<typeof xavier>) =>
  prioritise(
    exposure.regions.map(area => ({ name: area.name, area })),
    defaultThresholds(),
    3
  );

describe('operational priority for an island in the core', () => {
  it('is not left GREEN: Nassau at 120 km/h meets "gale or stronger, people ≥ 1"', () => {
    const exposure = xavier();
    const nassau = exposure.regions.find(r => r.name === 'Nassau')!;
    expect(areaMetrics(nassau).windBand).toBe(windDangerRank('Hurricane Winds'));
    const results = rate(exposure);
    const level = (name: string) => results.find(r => r.name === name)!.level;
    expect(level('Nassau')).not.toBe('green');
    expect(level('Pukapuka')).not.toBe('green');
  });

  it('is not Red for 70 people: the Red rule still asks for 1,000', () => {
    expect(rate(xavier()).find(r => r.name === 'Nassau')!.underlyingLevel).toBe('amber');
  });

  it('treats a core with no speed as the strongest, never as "no wind"', () => {
    const exposure = exposureFixture({
      regions: [{ name: 'Nassau', winds: CORE, people: 70 }],
    });
    expect(areaMetrics(exposure.regions[0]).windBand).toBe(windDangerRank(CORE));
    expect(rate(exposure)[0].underlyingLevel).not.toBe('green');
  });

  it('does not rate a weak storm’s core (70 km/h) as hurricane-force', () => {
    const exposure = exposureFixture({
      regions: [{ name: 'Nassau', winds: CORE, people: 5000, maxWindKmph: 70 }],
    });
    expect(areaMetrics(exposure.regions[0]).windBand).toBe(windDangerRank('Gale Winds'));
    expect(rate(exposure)[0].underlyingLevel).toBe('amber');
  });
});

describe('the headline and the strongest wind', () => {
  it('names the core island first, with its wind, then the other threat', () => {
    const insight = buildForecastInsight({ exposure: xavier(), countryName: 'Cook Islands' });
    expect(insight.headline).toBe(
      'Nassau is inside the cyclone’s core, with winds near 120 km/h. Storm-force winds are possible in Pukapuka.'
    );
    expect(insight.level).toBe('forecast');
    expect(insight.strongest).toBe('hurricane');
  });

  it('says "are" for several core islands, and leaves the speed out when unknown', () => {
    const exposure = exposureFixture({
      regions: [
        { name: 'Nassau', winds: CORE, people: 70 },
        { name: 'Pukapuka', winds: CORE, people: 400 },
      ],
    });
    const { headline } = buildForecastInsight({ exposure, countryName: 'Cook Islands' });
    expect(headline).toBe('Pukapuka and Nassau are inside the cyclone’s core.');
  });

  it('counts the people in the core as forecast with certainty, not "only possible"', () => {
    const insight = buildForecastInsight({ exposure: xavier(), countryName: 'Cook Islands' });
    expect(insight.people.confirmed).toBe(70);
    expect(insight.people.possible).toBe(463);
  });

  it('puts the core first in the strongest band and in the wind table', () => {
    const exposure = xavier();
    expect(strongestBandLabel(exposure)).toBe(CORE);
    expect(strongestWind(exposure)).toBe('hurricane');
    expect(exposure.byWindDanger[0].label).toBe(CORE);
  });

  it('does not mistake a core in a gale for a hurricane', () => {
    const exposure = exposureFixture({
      regions: [{ name: 'Nassau', winds: CORE, people: 70, maxWindKmph: 70 }],
    });
    expect(strongestWind(exposure)).toBe('gale');
  });

  it('exports the core as the strongest forecast wind', () => {
    const rows = forecastCsvRows(xavier());
    const header = rows.findIndex(row => row[0] === 'area');
    const national = rows[header + 1];
    expect(national[2]).toBe(CORE);
  });
});

describe('how many newer advisories there are', () => {
  const runs = Array.from({ length: 18 }, (_, i) => ({
    storm: 'Xavier',
    status: 'complete',
    issuedAt: new Date(Date.UTC(2026, 10, 14, 0) + i * 6 * 3_600_000).toISOString(),
  }));

  it('counts from the run list: 13th of 18 has 5 newer', () => {
    expect(countNewerAdvisories(runs, 'Xavier', runs[12].issuedAt)).toBe(5);
    expect(countNewerAdvisories(runs, 'xavier', runs[11].issuedAt)).toBe(6);
    expect(countNewerAdvisories(runs, 'Xavier', runs[17].issuedAt)).toBe(0);
  });

  it('ignores other storms, and advisories that failed or are still running', () => {
    const mixed = [
      ...runs,
      { storm: 'Wati', status: 'complete', issuedAt: '2026-11-20T00:00:00Z' },
      { storm: 'Xavier', status: 'failed', issuedAt: '2026-11-21T00:00:00Z' },
      { storm: 'Xavier', status: 'pending', issuedAt: '2026-11-22T00:00:00Z' },
    ];
    expect(countNewerAdvisories(mixed, 'Xavier', runs[16].issuedAt)).toBe(1);
  });

  it('is 0 for an unknown time or storm', () => {
    expect(countNewerAdvisories(runs, 'Xavier', null)).toBe(0);
    expect(countNewerAdvisories(runs, '', runs[0].issuedAt)).toBe(0);
  });

  it('reaches the badge: 5 newer even when only the shown and latest advisories have loaded', () => {
    const loaded = [runs[12], runs[17]].map((run, i) => ({
      id: String(i),
      issuedAt: run.issuedAt,
      people: 0,
      buildings: 0,
      strongest: null,
    }));
    const status = buildAdvisoryStatus({
      issuedAt: runs[12].issuedAt,
      latestIssuedAt: runs[17].issuedAt,
      timeline: loaded,
      newerCount: countNewerAdvisories(runs, 'Xavier', runs[12].issuedAt),
      now: Date.parse(runs[17].issuedAt),
    });
    expect(status.kind).toBe('older');
    expect(status.newer?.count).toBe(5);
    // Without the run list the old behaviour undercounts, which is what the fix replaces
    expect(
      buildAdvisoryStatus({
        issuedAt: runs[12].issuedAt,
        latestIssuedAt: runs[17].issuedAt,
        timeline: loaded,
        now: Date.parse(runs[17].issuedAt),
      }).newer?.count
    ).toBe(1);
  });
});
