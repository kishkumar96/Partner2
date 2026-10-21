/**
 * The four countries behave exactly as they did before their lists moved into config/.
 * parity.fixture.json was captured from the code as it was before the migration.
 */
import fixture from './parity.fixture.json';
import { COUNTRIES } from '@/types/thredds';
import { CODE_TO_SLUG, SLUG_TO_CODE } from '@/utils/countrySlug';
import { COUNTRY_CONFIGS } from '@/data/countryConfigs';
import { vanuatuDistricts, vanuatuProvinces, vanuatuSectors } from '@/data/vanuatuHazards';
import { listCountries } from '../registry';

describe('parity with the pre-migration code', () => {
  it('keeps the same countries in the same order', () => {
    expect(listCountries().map(c => c.code)).toEqual(fixture.order);
    expect(Object.keys(COUNTRIES)).toEqual(fixture.order);
  });

  it.each(fixture.order)(
    'keeps %s identical: names, map view, slug, aliases and terminology',
    code => {
      const before = (fixture.countries as Record<string, any>)[code];
      const country = COUNTRIES[code as keyof typeof COUNTRIES];
      expect(country).toEqual({
        code: before.code,
        name: before.name,
        fullName: before.fullName,
        center: before.center,
        zoom: before.zoom,
      });
      expect(CODE_TO_SLUG[code as keyof typeof CODE_TO_SLUG]).toBe(before.slug);
      expect(listCountries().find(c => c.code === code)?.partnerApi.aliases).toEqual(
        before.partnerApiAliases
      );
      expect(COUNTRY_CONFIGS[code as keyof typeof COUNTRY_CONFIGS].ui).toEqual(before.ui);
    }
  );

  it('keeps the same slug lookups', () => {
    expect({ ...SLUG_TO_CODE }).toEqual(fixture.slugToCode);
  });

  it('keeps what each country had beyond the standard configuration', () => {
    for (const code of fixture.order as Array<keyof typeof COUNTRY_CONFIGS>) {
      const config = COUNTRY_CONFIGS[code];
      expect(config.dataAvailable).toBe(true);
      expect(config.hazards.map(h => h.id)).toEqual(['tropical-cyclone', 'flood']);
      expect(config.defaultMapCenter).toEqual(COUNTRIES[code].center);
      expect(config.defaultZoom).toBe(COUNTRIES[code].zoom);
      expect(config.sectors).toBe(vanuatuSectors);
    }
    expect(COUNTRY_CONFIGS.VU.provinces).toBe(vanuatuProvinces);
    expect(COUNTRY_CONFIGS.VU.districts).toBe(vanuatuDistricts);
    for (const code of ['WS', 'TO', 'CK'] as const) {
      expect(COUNTRY_CONFIGS[code].provinces).toEqual([]);
      expect(COUNTRY_CONFIGS[code].districts).toEqual([]);
    }
  });
});
