import { hazardIdForEventType } from '../hazardIds';
import { normalizePartnerEventRow } from '../partnerEvents';
import { resolveHazard } from '@/data/vanuatuHazards';

describe('hazardIdForEventType', () => {
  it.each([
    ['Tropical Cyclone', 'tropical-cyclone'],
    ['Flood', 'flood'],
    ['Earthquake', 'earthquake'],
    ['Volcanic Activity', 'volcanic'],
    ['Storm Surge', 'storm-surge'],
  ])('%s -> %s', (name, id) => {
    expect(hazardIdForEventType(name)).toBe(id);
  });

  it('treats an event with no type as a cyclone (the behaviour before types were read)', () => {
    expect(hazardIdForEventType(undefined)).toBe('tropical-cyclone');
    expect(hazardIdForEventType('')).toBe('tropical-cyclone');
  });

  it('keeps an unlisted type as its own hazard rather than dropping it', () => {
    expect(hazardIdForEventType('Heat Wave')).toBe('heat-wave');
  });
});

describe('events of other types', () => {
  it('takes the hazard from event_type_name and needs no cyclone track', () => {
    const e = normalizePartnerEventRow('TO', {
      id: 21,
      title: 'Quake',
      event_type_name: 'Earthquake',
      cyclone_track: null,
    });
    expect(e?.hazardId).toBe('earthquake');
    expect(e?.eventType).toBe('Earthquake');
    expect(e?.backendCycloneTrackId).toBeUndefined();
  });

  it('keeps cyclone events as cyclones', () => {
    expect(
      normalizePartnerEventRow('VU', { id: 2, title: 'Lola', event_type_name: 'Tropical Cyclone' })
        ?.hazardId
    ).toBe('tropical-cyclone');
  });
});

describe('resolveHazard', () => {
  it('returns the catalogue entry when there is one', () => {
    expect(resolveHazard('earthquake').name).toBe('Earthquake');
  });

  it('builds a generic entry for an unlisted hazard', () => {
    expect(resolveHazard('heat-wave').name).toBe('Heat Wave');
  });
});
