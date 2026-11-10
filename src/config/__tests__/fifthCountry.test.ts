/**
 * Adding a country is configuration, not code: with a fifth country in the registry, the
 * code that used to list the four by hand picks it up. Nothing here names it outside this file.
 */
jest.mock('@/generated/config-registry', () => {
  const real = jest.requireActual('@/generated/config-registry');
  const fiji = {
    code: 'FJ',
    slug: 'fiji',
    name: 'Fiji',
    fullName: 'Republic of Fiji',
    viewport: { center: [178.0, -17.7], zoom: 7 },
    partnerApi: { aliases: ['fiji', 'republic of fiji'] },
    terminology: {
      focusAreaSingular: 'District',
      focusAreaPlural: 'Districts',
      broaderAreaSingular: 'Province',
      broaderAreaPlural: 'Provinces',
      nationalLabel: 'National',
    },
  };
  return { ...real, COUNTRY_DEFINITIONS: [...real.COUNTRY_DEFINITIONS, fiji] };
});

import {
  listCountries,
  listCountryCodes,
  getCountryBySlug,
  getCountryPresentation,
} from '@/config/registry';
import { COUNTRIES } from '@/types/thredds';
import {
  CODE_TO_SLUG,
  SLUG_TO_CODE,
  getCountryCodeFromSlug,
  getCountrySlugFromCode,
} from '@/utils/countrySlug';
import { isPartnerApiCountryEnabled } from '@/services/partnerApiService';
import { getTenantCountryCodeFromEnv, getTenantCountrySlugFromEnv } from '@/utils/tenantCountry';
import { resolveCountryCode } from '@/lib/countryAuth';
import { COUNTRY_CONFIGS, getAggregationLabel } from '@/data/countryConfigs';
import { getDefaultEventRecord, getLocalEventRecords } from '@/data/eventRecords';
import { getLayersForCountry } from '@/data/realThreddsLayers';
import { getStaticEvents, getStaticLayerCatalog } from '@/config/registry';

describe('a fifth configured country', () => {
  it('appears in the registry after the four, in order', () => {
    expect(listCountryCodes()).toEqual(['VU', 'WS', 'TO', 'CK', 'FJ']);
    expect(listCountries()).toHaveLength(5);
    expect(getCountryBySlug('fiji')?.code).toBe('FJ');
    expect(getCountryPresentation('FJ' as never).appName).toBe(
      'Fiji Tropical Cyclone Rapid Impact Assessment Tool'
    );
  });

  it('gets a map view, a route slug and slug lookups', () => {
    expect((COUNTRIES as Record<string, { center: number[]; zoom: number }>).FJ).toMatchObject({
      center: [178.0, -17.7],
      zoom: 7,
    });
    expect(SLUG_TO_CODE.fiji).toBe('FJ');
    expect((CODE_TO_SLUG as Record<string, string>).FJ).toBe('fiji');
    expect(getCountryCodeFromSlug('fiji')).toBe('FJ');
    expect(getCountrySlugFromCode('FJ')).toBe('fiji');
  });

  it('is accepted by the Partner API allow-list and the country authentication lookup', () => {
    expect(isPartnerApiCountryEnabled('FJ' as never)).toBe(true);
    expect(resolveCountryCode('fiji')).toBe('FJ');
    expect(resolveCountryCode('FJ')).toBe('FJ');
    expect(resolveCountryCode('atlantis')).toBeNull();
  });

  it('can be the tenant a deployment is locked to', () => {
    const previous = process.env.TENANT_COUNTRY;
    process.env.TENANT_COUNTRY = 'fiji';
    try {
      expect(getTenantCountryCodeFromEnv()).toBe('FJ');
      expect(getTenantCountrySlugFromEnv()).toBe('fiji');
    } finally {
      if (previous === undefined) delete process.env.TENANT_COUNTRY;
      else process.env.TENANT_COUNTRY = previous;
    }
  });

  it('gets the standard empty configuration and is flagged as having no data yet', () => {
    const fiji = (COUNTRY_CONFIGS as Record<string, (typeof COUNTRY_CONFIGS)['VU']>).FJ;
    expect(fiji.dataAvailable).toBe(false);
    expect(fiji.districts).toEqual([]);
    expect(fiji.ui.appName).toBe('Fiji Tropical Cyclone Rapid Impact Assessment Tool');
    expect(getAggregationLabel('FJ' as never, 'province')).toBe('Provinces');
  });

  it('leaves the four existing countries untouched', () => {
    expect(COUNTRY_CONFIGS.VU.dataAvailable).toBe(true);
    expect(COUNTRY_CONFIGS.CK.dataAvailable).toBe(true);
  });

  it('with no events or layers in config, has none and falls back to a generic default event', () => {
    expect(getStaticEvents('FJ')).toEqual([]);
    expect(getStaticLayerCatalog('FJ')).toBeNull();
    expect(getLocalEventRecords('FJ' as never)).toEqual([]);
    expect(getLayersForCountry('FJ' as never)).toEqual([]);
    expect(getDefaultEventRecord('FJ' as never).id).toBe('fj-default-event');
  });
});
