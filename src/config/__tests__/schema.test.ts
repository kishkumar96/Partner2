import fs from 'fs';
import path from 'path';
import { validateConfig } from '../../../config/schema.mjs';

const root = path.resolve(__dirname, '../../..');
const readJson = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

const country = (over: Record<string, unknown> = {}) => ({
  code: 'FJ',
  slug: 'fiji',
  name: 'Fiji',
  fullName: 'Republic of Fiji',
  viewport: { center: [178.0, -17.7], zoom: 7 },
  partnerApi: { aliases: ['fiji'] },
  terminology: {
    focusAreaSingular: 'District',
    focusAreaPlural: 'Districts',
    broaderAreaSingular: 'Province',
    broaderAreaPlural: 'Provinces',
    nationalLabel: 'National',
  },
  ...over,
});
const release = (over: Record<string, unknown> = {}) => ({
  configVersion: '1.0.0',
  schemaVersion: 1,
  defaultCountry: 'FJ',
  countries: ['fiji'],
  ...over,
});
const files = (...list: Array<Record<string, unknown>>) =>
  list.map(value => ({ file: `${value.slug}.json`, value }));
const errorsOf = (r: ReturnType<typeof validateConfig>) => (r.ok ? [] : r.errors);

describe('the real configuration', () => {
  it('is valid, and lists the four countries in the established order', () => {
    const countriesDir = path.join(root, 'config/countries');
    const result = validateConfig({
      release: readJson('config/release.json'),
      countries: fs
        .readdirSync(countriesDir)
        .map(file => ({ file, value: readJson(`config/countries/${file}`) })),
    });
    expect(errorsOf(result)).toEqual([]);
    expect(result.ok && result.countries.map(c => c.code)).toEqual(['VU', 'WS', 'TO', 'CK']);
  });
});

describe('validateConfig', () => {
  it('accepts a well-formed country', () => {
    expect(errorsOf(validateConfig({ release: release(), countries: files(country()) }))).toEqual(
      []
    );
  });

  it('rejects a field it does not know, which is how a pasted secret or a typo is caught', () => {
    const result = validateConfig({
      release: release(),
      countries: files(country({ apiPassword: 'hunter2' })),
    });
    expect(errorsOf(result).join('\n')).toMatch(/unknown field\(s\): apiPassword/);
  });

  it.each([
    ['a lower-case code', { code: 'fj' }, /code/],
    ['a three-letter code', { code: 'FJI' }, /code/],
    ['an upper-case slug', { slug: 'Fiji' }, /slug/],
    ['a slug with spaces', { slug: 'cook islands' }, /slug/],
    ['an empty name', { name: '  ' }, /name/],
    ['a latitude past the pole', { viewport: { center: [178, -95], zoom: 7 } }, /viewport/],
    ['a longitude off the globe', { viewport: { center: [190, -17], zoom: 7 } }, /viewport/],
    ['a zoom out of range', { viewport: { center: [178, -17], zoom: 30 } }, /zoom/],
    ['a centre with one number', { viewport: { center: [178], zoom: 7 } }, /viewport/],
    ['no Partner API aliases', { partnerApi: { aliases: [] } }, /aliases/],
    ['an upper-case alias', { partnerApi: { aliases: ['Fiji'] } }, /aliases/],
  ])('rejects %s', (_label, over, pattern) => {
    const result = validateConfig({
      release: release(),
      countries: files(country(over as Record<string, unknown>)),
    });
    expect(result.ok).toBe(false);
    expect(errorsOf(result).join('\n')).toMatch(pattern);
  });

  it('rejects two countries with the same code, slug or Partner API alias', () => {
    const a = country();
    const dupCode = country({ slug: 'fiji-2', partnerApi: { aliases: ['other'] } });
    const dupSlugErrors = errorsOf(
      validateConfig({
        release: release({ countries: ['fiji', 'fiji-2'] }),
        countries: files(a, dupCode),
      })
    ).join('\n');
    expect(dupSlugErrors).toMatch(/duplicate country code "FJ"/);

    const shared = errorsOf(
      validateConfig({
        release: release({ countries: ['fiji', 'tonga'] }),
        countries: files(
          a,
          country({ code: 'TO', slug: 'tonga', name: 'Tonga', partnerApi: { aliases: ['fiji'] } })
        ),
      })
    ).join('\n');
    expect(shared).toMatch(/alias "fiji" is claimed by both FJ and TO/);
  });

  it('rejects a file whose name does not match its slug', () => {
    const result = validateConfig({
      release: release(),
      countries: [{ file: 'wrong-name.json', value: country() }],
    });
    expect(errorsOf(result).join('\n')).toMatch(/file name must be "fiji.json"/);
  });

  it('rejects a release that lists a missing country, omits a present one, or lists one twice', () => {
    expect(
      errorsOf(
        validateConfig({
          release: release({ countries: ['fiji', 'tonga'] }),
          countries: files(country()),
        })
      ).join('\n')
    ).toMatch(/lists "tonga" but config\/countries\/tonga.json is missing/);
    expect(
      errorsOf(
        validateConfig({
          release: release({ countries: ['fiji'] }),
          countries: files(
            country(),
            country({
              code: 'TO',
              slug: 'tonga',
              name: 'Tonga',
              partnerApi: { aliases: ['tonga'] },
            })
          ),
        })
      ).join('\n')
    ).toMatch(/tonga.json: not listed in release.json/);
    expect(
      errorsOf(
        validateConfig({
          release: release({ countries: ['fiji', 'fiji'] }),
          countries: files(country()),
        })
      ).join('\n')
    ).toMatch(/"fiji" is listed twice/);
  });

  it('rejects a default country that is not configured, and a malformed release', () => {
    expect(
      errorsOf(
        validateConfig({ release: release({ defaultCountry: 'XX' }), countries: files(country()) })
      ).join('\n')
    ).toMatch(/defaultCountry "XX" is not a configured country/);
    const bad = validateConfig({
      release: release({ configVersion: 'one', schemaVersion: 2 }),
      countries: files(country()),
    });
    expect(errorsOf(bad).join('\n')).toMatch(/configVersion/);
    expect(errorsOf(bad).join('\n')).toMatch(/schemaVersion/);
  });

  it('reports every problem at once, not just the first', () => {
    const result = validateConfig({
      release: release({ defaultCountry: 'XX' }),
      countries: files(country({ code: 'fj', name: '' })),
    });
    expect(errorsOf(result).length).toBeGreaterThanOrEqual(2);
  });
});

describe('events and layers', () => {
  const event = (over: Record<string, unknown> = {}) => ({
    id: 'tc-wati-2026',
    name: 'Tropical Cyclone Wati',
    date: '2026-10-17',
    hazardId: 'tropical-cyclone',
    location: { lat: -17.7, lng: 178.0 },
    bbox: [176, -19, 180, -16],
    trackFile: 'cyclone-track.geojson',
    isDefault: true,
    aliases: ['wati'],
    ...over,
  });
  const layer = (over: Record<string, unknown> = {}) => ({
    id: 'fj-tc-wati-wind',
    eventId: 'tc-wati-2026',
    name: 'TC Wati wind',
    ncFile: 'wind.nc',
    layerName: 'Depth',
    description: 'Wind hazard',
    hazardType: 'wind',
    bbox: [176, -19, 180, -16],
    styleConfig: {
      styles: 'default-scalar/x-Sst',
      colorScaleRange: '0.1,65.74',
      time: '2026-10-17T00:00:00.000Z',
    },
    ...over,
  });
  const eventsFile = (events: unknown[] = [event()], over: Record<string, unknown> = {}) => ({
    file: 'fiji.json',
    value: { country: 'FJ', events, ...over },
  });
  const layersFile = (layers: unknown[] = [layer()], over: Record<string, unknown> = {}) => ({
    file: 'fiji.json',
    value: { country: 'FJ', datasetBasePath: '/POP/Partner2/fiji', layers, ...over },
  });
  const run = (extra: { events?: unknown[]; layers?: unknown[] }) =>
    validateConfig({ release: release(), countries: files(country()), ...extra } as never);
  const messages = (extra: { events?: unknown[]; layers?: unknown[] }) =>
    errorsOf(run(extra)).join('\n');

  it('accepts well-formed events and layers, and a country with neither', () => {
    const ok = run({ events: [eventsFile()], layers: [layersFile()] });
    expect(errorsOf(ok)).toEqual([]);
    expect(ok.ok && ok.events[0].events[0].enabled).toBe(true); // defaults are filled in
    expect(errorsOf(run({}))).toEqual([]);
  });

  it.each([
    ['a layer file path that climbs out with ..', { ncFile: '../secret.nc' }, /ncFile/],
    ['an absolute layer file path', { ncFile: '/etc/passwd' }, /ncFile/],
    ['a layer file that is a URL', { ncFile: 'https://evil.example/x.nc' }, /ncFile/],
    ['a query string in a path', { ncFile: 'x.nc?token=1' }, /ncFile/],
    ['an unknown hazard type', { hazardType: 'tsunami' }, /hazardType/],
    ['an inverted bounding box', { bbox: [180, -16, 176, -19] }, /bbox/],
    ['a bounding box off the globe', { bbox: [176, -19, 200, -16] }, /bbox/],
    [
      'a colour range that is not "min,max"',
      { styleConfig: { colorScaleRange: '0-4' } },
      /colorScaleRange/,
    ],
    ['a style time that is not a date-time', { styleConfig: { time: 'yesterday' } }, /time/],
    ['an unknown style field', { styleConfig: { apiKey: 'abc' } }, /unknown field/],
    [
      'a dataset path override that is a URL',
      { datasetPath: 'https://x.example/a' },
      /datasetPath/,
    ],
    ['a layer id with capitals', { id: 'FJ-Wind' }, /id/],
  ])('rejects %s', (_label, over, pattern) => {
    expect(messages({ layers: [layersFile([layer(over as Record<string, unknown>)])] })).toMatch(
      pattern
    );
  });

  it('rejects a data server path that is a URL or climbs out', () => {
    expect(
      messages({ layers: [layersFile([layer()], { datasetBasePath: 'https://x.example/POP' })] })
    ).toMatch(/datasetBasePath/);
    expect(
      messages({ layers: [layersFile([layer()], { datasetBasePath: '/POP/../etc' })] })
    ).toMatch(/datasetBasePath/);
  });

  it.each([
    ['an event date that is not real', { date: '2026-02-30' }, /date/],
    ['a track file that climbs out', { trackFile: '../track.geojson' }, /trackFile/],
    ['an event location off the globe', { location: { lat: -95, lng: 10 } }, /location/],
    ['an event with an unknown field', { apiToken: 'x' }, /unknown field/],
  ])('rejects %s', (_label, over, pattern) => {
    expect(messages({ events: [eventsFile([event(over as Record<string, unknown>)])] })).toMatch(
      pattern
    );
  });

  it('needs exactly one enabled default event per country', () => {
    expect(messages({ events: [eventsFile([event({ isDefault: false })])] })).toMatch(
      /exactly one enabled default event.*found 0/
    );
    expect(
      messages({ events: [eventsFile([event(), event({ id: 'tc-two', isDefault: true })])] })
    ).toMatch(/found 2/);
    expect(messages({ events: [eventsFile([event({ enabled: false })])] })).toMatch(/found 0/); // a disabled default is no default
  });

  it('rejects a layer that names an event its country does not have', () => {
    expect(
      messages({
        events: [eventsFile()],
        layers: [layersFile([layer({ eventId: 'tc-not-there' })])],
      })
    ).toMatch(/belongs to event "tc-not-there", which is not in events\/fiji.json/);
    // and with no events file at all
    expect(messages({ layers: [layersFile()] })).toMatch(/which is not in events\/fiji.json/);
  });

  it('rejects duplicate event or layer ids', () => {
    expect(messages({ events: [eventsFile([event(), event({ isDefault: false })])] })).toMatch(
      /event id "tc-wati-2026" is also used/
    );
    expect(messages({ events: [eventsFile()], layers: [layersFile([layer(), layer()])] })).toMatch(
      /layer id "fj-tc-wati-wind" is also used/
    );
  });

  it('rejects files for a country that is not configured, or named wrongly, or repeated', () => {
    expect(
      messages({ events: [{ file: 'fiji.json', value: { country: 'XX', events: [event()] } }] })
    ).toMatch(/country "XX" is not a configured country/);
    expect(messages({ events: [{ ...eventsFile(), file: 'other.json' }] })).toMatch(
      /file name must be "fiji.json"/
    );
    expect(
      messages({
        layers: [layersFile(), { ...layersFile(), file: 'fiji.json' }],
        events: [eventsFile()],
      })
    ).toMatch(/more than one file for country "FJ"/);
  });

  it('rejects an empty events or layers file, which is better removed', () => {
    expect(messages({ events: [eventsFile([])] })).toMatch(/at least one event/);
    expect(messages({ layers: [layersFile([])] })).toMatch(/at least one layer/);
  });
});
