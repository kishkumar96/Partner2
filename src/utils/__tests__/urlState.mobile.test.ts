import { deserializeMapState, serializeMapState, type MapURLState } from '@/utils/urlState';

const roundTrip = (state: MapURLState) =>
  deserializeMapState(new URLSearchParams(serializeMapState(state).toString()));

describe('mobile panel in the URL', () => {
  it('writes nothing for the plain map, so existing links are unchanged', () => {
    const legacy: MapURLState = {
      center: { lat: -17.7, lng: 168.3 },
      zoom: 10,
      hazards: ['cyclone'],
      layers: ['buildings'],
      showSummary: true,
      viewMode: 'event',
    };
    expect(serializeMapState(legacy).toString()).toBe(
      'lat=-17.7000&lng=168.3000&zoom=10.0&hazards=cyclone&layers=buildings&summary=true&mode=event'
    );
  });

  it.each(['context', 'layers', 'impacts', 'more', 'place'] as const)('round-trips %s', panel => {
    expect(roundTrip({ mobilePanel: panel }).mobilePanel).toBe(panel);
  });

  it('ignores a panel it does not know, rather than opening something odd', () => {
    ['none', 'filters', '', 'IMPACTS', 'impacts%20'].forEach(value =>
      expect(deserializeMapState(new URLSearchParams({ panel: value })).mobilePanel).toBeUndefined()
    );
  });

  it('still reads the older panel flags next to a new one, for the phone logic to rank', () => {
    const state = deserializeMapState(new URLSearchParams('panel=more&summary=true&map=true'));
    expect(state).toMatchObject({ mobilePanel: 'more', showSummary: true, showMapControls: true });
  });

  it('does not put the sheet height or a panel on a link by itself', () => {
    expect(serializeMapState({ zoom: 8 }).toString()).toBe('zoom=8.0');
  });
});

describe('Pacific EEZ visibility in the URL', () => {
  it('is on when the link says nothing', () => {
    expect(deserializeMapState(new URLSearchParams('')).eezVisible).toBeUndefined();
    expect(serializeMapState({ eezVisible: true }).has('eez')).toBe(false);
    expect(serializeMapState({}).has('eez')).toBe(false);
  });

  it('survives sharing when explicitly off', () => {
    expect(serializeMapState({ eezVisible: false }).get('eez')).toBe('off');
    expect(roundTrip({ eezVisible: false }).eezVisible).toBe(false);
  });

  it('reads the other spellings of off, and treats anything else as the default', () => {
    ['off', '0', 'false'].forEach(v =>
      expect(deserializeMapState(new URLSearchParams({ eez: v })).eezVisible).toBe(false)
    );
    ['on', '1', 'true', 'maybe', ''].forEach(v =>
      expect(deserializeMapState(new URLSearchParams({ eez: v })).eezVisible).toBeUndefined()
    );
  });
});
