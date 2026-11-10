import { getLayersForCountry, type RealWMSLayer } from '../realThreddsLayers';

const layer = (id: string, extra: Partial<RealWMSLayer> = {}) =>
  ({ id, countryCode: 'VU', hazardType: 'flood', ...extra }) as RealWMSLayer;

const eventFlood = layer('partner-vu-9409-flood');
const scenario5 = layer('partner-vu-slr-0-rp5', {
  hazardScenario: {
    product: 'coastal_flood',
    slrScenarioM: 0,
    returnPeriodYears: 5,
    eventLabel: null,
  },
});
const scenario50 = layer('partner-vu-slr-0-rp50', {
  hazardScenario: {
    product: 'coastal_flood',
    slrScenarioM: 0,
    returnPeriodYears: 50,
    eventLabel: null,
  },
});
const partner = [eventFlood, scenario5, scenario50];
const ids = (layers: RealWMSLayer[]) => layers.map(l => l.id);

describe('getLayersForCountry layer modes', () => {
  it('event mode draws the event layers and never scenario layers', () => {
    expect(ids(getLayersForCountry('VU', partner, [], null, 'event'))).toEqual([
      'partner-vu-9409-flood',
    ]);
  });

  it('planning mode draws only the selected scenario', () => {
    const selection = scenario50.hazardScenario!;
    expect(ids(getLayersForCountry('VU', partner, [], selection, 'planning'))).toEqual([
      'partner-vu-slr-0-rp50',
    ]);
  });

  it('planning mode never falls back to the static event layers', () => {
    // Before the scenario catalog arrives there are no partner layers at all
    expect(getLayersForCountry('VU', [], [], null, 'planning')).toEqual([]);
  });

  it('event mode still falls back to static layers when the API has none', () => {
    expect(getLayersForCountry('VU', [], [], null, 'event').length).toBeGreaterThan(0);
  });

  it('keeps the old combined behaviour by default', () => {
    expect(ids(getLayersForCountry('VU', partner, [], scenario5.hazardScenario!))).toEqual([
      'partner-vu-9409-flood',
      'partner-vu-slr-0-rp5',
    ]);
  });
});
