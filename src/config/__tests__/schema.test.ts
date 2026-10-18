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
