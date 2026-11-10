import {
  getConfigDiagnostic,
  getConfigRelease,
  getCountryByCode,
  getCountryBySlug,
  getCountryPresentation,
  getDefaultCountry,
  isCountryCode,
  listCountries,
  listCountryCodes,
} from '../registry';

describe('registry', () => {
  it('lists the configured countries in release order', () => {
    expect(listCountryCodes()).toEqual(['VU', 'WS', 'TO', 'CK']);
    expect(listCountries().map(c => c.slug)).toEqual(['vanuatu', 'samoa', 'tonga', 'cook-islands']);
  });

  it('looks a country up by code or slug, ignoring case and spaces', () => {
    expect(getCountryByCode(' ck ')?.slug).toBe('cook-islands');
    expect(getCountryBySlug(' Cook-Islands ')?.code).toBe('CK');
    expect(getCountryByCode('XX')).toBeNull();
    expect(getCountryBySlug('atlantis')).toBeNull();
    expect(getCountryByCode('')).toBeNull();
    expect(getCountryByCode(null)).toBeNull();
    expect(getCountryBySlug(undefined)).toBeNull();
  });

  it('does not treat object-prototype names as countries', () => {
    expect(getCountryBySlug('__proto__')).toBeNull();
    expect(getCountryBySlug('constructor')).toBeNull();
    expect(getCountryByCode('toString')).toBeNull();
  });

  it('recognises exact codes only in the type guard', () => {
    expect(isCountryCode('VU')).toBe(true);
    expect(isCountryCode('vu')).toBe(false);
    expect(isCountryCode(undefined)).toBe(false);
  });

  it('has a default country that exists', () => {
    expect(getDefaultCountry().code).toBe('VU');
  });

  it('presents a country with its map view, terminology and app name', () => {
    const ck = getCountryPresentation('CK');
    expect(ck.center).toEqual([-159.7777, -21.2367]);
    expect(ck.zoom).toBe(11);
    expect(ck.appName).toBe('Cook Islands Tropical Cyclone Rapid Impact Assessment Tool');
    expect(getCountryPresentation('VU').terminology.broaderAreaPlural).toBe('Provinces');
  });

  it('reports the release it was built from, with a content hash', () => {
    const release = getConfigRelease();
    expect(release.configVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(release.schemaVersion).toBe(1);
    expect(release.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports a diagnostic of the release and the country codes, and nothing else', () => {
    const diagnostic = getConfigDiagnostic();
    expect(Object.keys(diagnostic).sort()).toEqual([
      'configVersion',
      'contentSha256',
      'countries',
      'schemaVersion',
    ]);
    expect(diagnostic.countries).toEqual(['VU', 'WS', 'TO', 'CK']);
    expect(diagnostic.contentSha256).toBe(getConfigRelease().contentSha256);
  });
});
