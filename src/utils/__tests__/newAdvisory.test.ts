import { findNewerAdvisory } from '../newAdvisory';
import type { EventRecord } from '@/data/eventRecords';

const advisory = (id: string, storm: string, issued: string, extra: Partial<EventRecord> = {}) =>
  ({
    id,
    countryCode: 'CK',
    name: `TC ${storm}`,
    cycloneName: `x_${storm}`,
    isForecast: true,
    trackIssuedTime: issued,
    modelRunStatus: 'complete',
    ...extra,
  }) as EventRecord;

describe('findNewerAdvisory', () => {
  const known = [
    advisory('a', 'Wati', '2026-10-17T12:00:00Z'),
    advisory('b', 'Wati', '2026-10-17T18:00:00Z'),
  ];

  it('finds an advisory issued after everything already known', () => {
    const fresh = [...known, advisory('c', 'Wati', '2026-10-18T00:00:00Z')];
    expect(findNewerAdvisory(known, fresh, 'CK')?.id).toBe('c');
  });

  it('picks the newest when several have arrived', () => {
    const fresh = [
      ...known,
      advisory('c', 'Wati', '2026-10-18T00:00:00Z'),
      advisory('d', 'Wati', '2026-10-18T06:00:00Z'),
    ];
    expect(findNewerAdvisory(known, fresh, 'CK')?.id).toBe('d');
  });

  it('says nothing when nothing is newer, so an unchanged page stays quiet', () => {
    expect(findNewerAdvisory(known, [...known], 'CK')).toBeNull();
    expect(findNewerAdvisory(known, [], 'CK')).toBeNull();
  });

  it('notices a second storm appearing, even when its advisory is older than the other storm newest', () => {
    const fresh = [...known, advisory('x', 'Xavier', '2026-10-17T06:00:00Z')];
    expect(findNewerAdvisory(known, fresh, 'CK')?.id).toBe('x');
  });

  it('compares each storm with its own history, not with the newest overall', () => {
    const withXavier = [...known, advisory('x1', 'Xavier', '2026-10-17T06:00:00Z')];
    const fresh = [...withXavier, advisory('x2', 'Xavier', '2026-10-17T12:00:00Z')];
    // x2 is older than Wati's newest advisory but newer than anything known for Xavier
    expect(findNewerAdvisory(withXavier, fresh, 'CK')?.id).toBe('x2');
  });

  it('notices a forecast appearing where there was none', () => {
    expect(findNewerAdvisory([], known, 'CK')?.id).toBe('b');
  });

  it('ignores a newer run that failed or is still running, and other countries', () => {
    const fresh = [
      ...known,
      advisory('f', 'Wati', '2026-10-18T00:00:00Z', { modelRunStatus: 'failed' }),
      advisory('q', 'Wati', '2026-10-18T06:00:00Z', { modelRunStatus: 'running' }),
      advisory('t', 'Zed', '2026-10-18T09:00:00Z', { countryCode: 'TO' }),
    ];
    expect(findNewerAdvisory(known, fresh, 'CK')).toBeNull();
  });

  it('ignores assessments and records with no readable issue time', () => {
    const fresh = [
      ...known,
      advisory('m', 'Meena', '2026-10-19T00:00:00Z', { isForecast: false }),
      advisory('n', 'Wati', '', {}),
    ];
    expect(findNewerAdvisory(known, fresh, 'CK')).toBeNull();
  });
});
