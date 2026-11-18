import {
  buildAdvisoryReleases,
  formatUtcStamp,
  releaseSteps,
  selectAdvisoryReleases,
} from '../advisoryReleases';
import type { EventRecord } from '@/data/eventRecords';

const rec = (id: string, extra: Partial<EventRecord>): EventRecord =>
  ({
    id,
    countryCode: 'CK',
    name: id,
    date: '',
    hazardId: 'tropical-cyclone',
    location: { lat: 0, lng: 0 },
    bbox: [0, 0, 0, 0],
    source: 'partner_api',
    isForecast: true,
    ...extra,
  }) as EventRecord;

const trackRow = (id: number, lon: number, lat: number) => ({
  id,
  geometry: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {} },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon + 1, lat - 1] },
        properties: {},
      },
    ],
  },
});

const records = [
  rec('a', {
    cycloneName: '2026111800_Xavier',
    trackIssuedTime: '2026-11-18T00:00:00Z',
    backendCycloneTrackId: '1',
  }),
  rec('b', {
    cycloneName: '2026111810_Xavier',
    trackIssuedTime: '2026-11-18T10:00:00Z',
    backendCycloneTrackId: '2',
  }),
  rec('c', {
    cycloneName: '2026111812_Xavier',
    trackIssuedTime: '2026-11-18T12:00:00Z',
    backendCycloneTrackId: '3',
  }),
  rec('other', {
    cycloneName: '2026111800_Meena',
    trackIssuedTime: '2026-11-18T00:00:00Z',
    backendCycloneTrackId: '9',
  }),
  rec('notrack', { cycloneName: '2026111806_Xavier', trackIssuedTime: '2026-11-18T06:00:00Z' }),
];
const rows = [
  trackRow(1, -178, -10),
  trackRow(2, 179, -11),
  trackRow(3, -177, -12),
  trackRow(9, -160, -20),
];

describe('buildAdvisoryReleases', () => {
  it('takes the first position and the whole track of each advisory, and skips runs with none', () => {
    const releases = buildAdvisoryReleases(rows, records, 'CK');
    const ids = releases?.origins.features.map(f => f.properties.runId).sort();
    expect(ids).toEqual(['a', 'b', 'c', 'other']);
    const b = releases?.origins.features.find(f => f.properties.runId === 'b');
    expect(b?.geometry.coordinates).toEqual([179, -11]);
    expect(b?.properties.label).toBe('18 Nov 10Z');
    const track = releases?.tracks.features.find(f => f.properties.runId === 'b');
    expect(track?.geometry.coordinates).toEqual([
      [179, -11],
      [180, -12],
    ]);
  });

  it('flags only the newest advisory of each storm as latest', () => {
    const releases = buildAdvisoryReleases(rows, records, 'CK');
    const latest = releases?.origins.features
      .filter(f => f.properties.isLatest)
      .map(f => f.properties.runId);
    expect(latest?.sort()).toEqual(['c', 'other']);
  });

  it('is null when nothing has a track', () => {
    expect(buildAdvisoryReleases([], records, 'CK')).toBeNull();
  });
});

describe('selectAdvisoryReleases', () => {
  const releases = buildAdvisoryReleases(rows, records, 'CK');

  it('keeps only the active storm, marks the advisory on screen and ages the other tracks', () => {
    const selected = selectAdvisoryReleases(releases, 'b');
    expect(selected?.origins.features.map(f => f.properties.runId).sort()).toEqual(['a', 'b', 'c']);
    expect(
      selected?.origins.features.filter(f => f.properties.selected).map(f => f.properties.runId)
    ).toEqual(['b']);
    // The track on screen is drawn by the forecast's own layer, so it is not repeated here
    const ages = Object.fromEntries(
      (selected?.tracks.features ?? []).map(f => [f.properties.runId, f.properties.age])
    );
    expect(ages).toEqual({ a: 2, c: 0 });
  });

  it('shows nothing for a storm with a single advisory, or no active run', () => {
    expect(selectAdvisoryReleases(releases, 'other')).toBeNull();
    expect(selectAdvisoryReleases(releases, null)).toBeNull();
    expect(selectAdvisoryReleases(null, 'a')).toBeNull();
  });
});

describe('releaseSteps', () => {
  it('lists the storm’s advisories oldest first and says which is on screen', () => {
    const steps = releaseSteps(
      selectAdvisoryReleases(buildAdvisoryReleases(rows, records, 'CK'), 'b')
    );
    expect(steps.map(step => step.runId)).toEqual(['a', 'b', 'c']);
    expect(steps.map(step => step.selected)).toEqual([false, true, false]);
    expect(steps[2].isLatest).toBe(true);
    expect(releaseSteps(null)).toEqual([]);
  });
});

describe('formatUtcStamp', () => {
  it('formats in UTC and passes through what is not a date', () => {
    expect(formatUtcStamp('2026-11-19T06:30:00Z')).toBe('19 Nov 06Z');
    expect(formatUtcStamp('soon')).toBe('soon');
    expect(formatUtcStamp(null)).toBe('');
  });
});
