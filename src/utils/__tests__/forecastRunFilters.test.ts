import { groupForecastRuns, type ForecastRun } from '../forecastRuns';
import {
  NO_STORM_FILTER,
  filterStormGroups,
  isFiltering,
  type StormFilter,
} from '../forecastRunFilters';

const NOW = Date.UTC(2026, 9, 20, 12);

function run(id: string, storm: string, issuedAt: string, status?: string): ForecastRun {
  return { id, storm, cycloneName: `2026${id}_${storm}`, issuedAt, status, isLatest: false };
}

const RUNS: ForecastRun[] = [
  run('w3', 'Wati', '2026-10-19T12:00:00Z'),
  run('w2', 'Wati', '2026-10-19T06:00:00Z', 'failed'),
  run('w1', 'Wati', '2026-10-18T18:00:00Z'),
  run('h1', 'Harold', '2026-04-02T00:00:00Z'),
  run('h0', 'Harold', '2026-04-01T18:00:00Z'),
  run('l1', 'Lola', '2025-10-24T12:00:00Z'),
  run('p1', 'Pam', '2025-03-12T06:00:00Z', 'pending'),
];

const groups = groupForecastRuns(RUNS, NOW);
const names = (found: ReturnType<typeof filterStormGroups>) => found.map(g => g.storm);
const filter = (changes: Partial<StormFilter>): StormFilter => ({ ...NO_STORM_FILTER, ...changes });

describe('filterStormGroups', () => {
  it('returns every storm, unchanged, when nothing is filtered', () => {
    expect(filterStormGroups(groups, NO_STORM_FILTER)).toEqual(groups);
    expect(isFiltering(NO_STORM_FILTER)).toBe(false);
  });

  it('filters by active and past storms', () => {
    expect(names(filterStormGroups(groups, filter({ status: 'active' })))).toEqual(['Wati']);
    expect(names(filterStormGroups(groups, filter({ status: 'past' })))).toEqual([
      'Harold',
      'Lola',
      'Pam',
    ]);
  });

  it('searches the storm name in any case, and the track names of its advisories', () => {
    expect(names(filterStormGroups(groups, filter({ query: '  hAR ' })))).toEqual(['Harold']);
    expect(names(filterStormGroups(groups, filter({ query: '2026l1' })))).toEqual(['Lola']);
    expect(filterStormGroups(groups, filter({ query: 'nothing' }))).toEqual([]);
  });

  it('keeps storms with an advisory inside the date range, whole days in UTC', () => {
    expect(
      names(filterStormGroups(groups, filter({ from: '2026-04-02', to: '2026-04-02' })))
    ).toEqual(['Harold']);
    expect(names(filterStormGroups(groups, filter({ from: '2026-01-01' })))).toEqual([
      'Wati',
      'Harold',
    ]);
    expect(names(filterStormGroups(groups, filter({ to: '2025-12-31' })))).toEqual(['Lola', 'Pam']);
  });

  it('ignores a date that is not a date', () => {
    expect(filterStormGroups(groups, filter({ from: 'soon', to: '31/12/2025' }))).toEqual(groups);
  });

  it('hides advisories without results, and storms left with none', () => {
    const found = filterStormGroups(groups, filter({ resultsOnly: true }));
    expect(names(found)).toEqual(['Wati', 'Harold', 'Lola']);
    expect(found[0].runs.map(r => r.id)).toEqual(['w3', 'w1']);
    expect(found[0].newestIssuedAt).toBe('2026-10-19T12:00:00Z');
  });

  it('combines the filters', () => {
    const found = filterStormGroups(
      groups,
      filter({ status: 'past', query: 'o', from: '2026-01-01' })
    );
    expect(names(found)).toEqual(['Harold']);
  });

  it('always keeps the storm and advisory on screen, whatever the filter says', () => {
    const found = filterStormGroups(groups, filter({ status: 'past', resultsOnly: true }), {
      storm: 'wati',
      runId: 'w2',
    });
    expect(names(found)).toEqual(['Wati', 'Harold', 'Lola']);
    expect(found[0].runs.map(r => r.id)).toEqual(['w3', 'w2', 'w1']);
  });

  it('reports whether anything is being filtered', () => {
    for (const changes of [
      { status: 'past' as const },
      { query: 'x' },
      { from: '2026-01-01' },
      { to: '2026-01-01' },
      { resultsOnly: true },
    ]) {
      expect(isFiltering(filter(changes))).toBe(true);
    }
    expect(isFiltering(filter({ query: '   ' }))).toBe(false);
  });
});
