/**
 * A fifth country that has fallback events and static layers in config/, with nothing about it in code:
 * the event and layer code serves it, honours `enabled: false`, and builds its map URLs from its
 * own datasetBasePath.
 */
jest.mock('@/generated/config-registry', () => {
  const real = jest.requireActual('@/generated/config-registry');
  const fiji = {
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
  };
  const event = (id: string, extra: object = {}) => ({
    id,
    name: `TC ${id}`,
    date: '2026-10-17',
    hazardId: 'tropical-cyclone',
    location: { lat: -17.7, lng: 178 },
    bbox: [176, -19, 180, -16],
    trackFile: 'cyclone-track.geojson',
    isDefault: false,
    aliases: [],
    enabled: true,
    ...extra,
  });
  const layer = (id: string, extra: object = {}) => ({
    id,
    eventId: 'tc-wati',
    name: id,
    ncFile: `${id}.nc`,
    layerName: 'Depth',
    description: id,
    hazardType: 'wind',
    bbox: [176, -19, 180, -16],
    enabled: true,
    ...extra,
  });
  return {
    ...real,
    COUNTRY_DEFINITIONS: [...real.COUNTRY_DEFINITIONS, fiji],
    EVENT_DEFINITIONS: {
      ...real.EVENT_DEFINITIONS,
      FJ: [event('tc-wati', { isDefault: true }), event('tc-retired', { enabled: false })],
    },
    LAYER_DEFINITIONS: {
      ...real.LAYER_DEFINITIONS,
      FJ: {
        datasetBasePath: '/POP/Partner2/fiji/Wati',
        layers: [layer('fj-wati-wind'), layer('fj-wati-retired', { enabled: false })],
      },
    },
  };
});

import { getStaticEvents, getStaticLayerCatalog } from '@/config/registry';
import { getDefaultEventRecord, getLocalEventRecords } from '@/data/eventRecords';
import { buildWMSTileUrl, getLayersForCountry } from '@/data/realThreddsLayers';

const fj = 'FJ' as never;

describe('a fifth country with events and layers in config', () => {
  it('serves its fallback events, leaving out a disabled one', () => {
    expect(getStaticEvents('FJ').map(event => event.id)).toEqual(['tc-wati']);
    const records = getLocalEventRecords(fj);
    expect(records.map(record => record.id)).toEqual(['tc-wati']);
    expect(records[0]).toMatchObject({ countryCode: 'FJ', source: 'local', isDefault: true });
    expect(getDefaultEventRecord(fj).id).toBe('tc-wati');
  });

  it('finds an event’s layers through the layers’ own eventId, and not a disabled layer', () => {
    expect(getLocalEventRecords(fj)[0].hazardLayerIds).toEqual(['fj-wati-wind']);
    expect(getLayersForCountry(fj).map(layer => layer.id)).toEqual(['fj-wati-wind']);
  });

  it('builds the layer’s map URL from the country’s own dataset base path', () => {
    const [layer] = getLayersForCountry(fj);
    expect(layer.countryCode).toBe('FJ');
    expect(buildWMSTileUrl(layer)).toContain('/POP/Partner2/fiji/Wati/fj-wati-wind.nc');
  });

  it('hands out copies, so a caller cannot alter what the registry holds', () => {
    const catalog = getStaticLayerCatalog('FJ');
    catalog?.layers.push({ id: 'injected' } as never);
    getStaticEvents('FJ')[0].name = 'tampered';
    expect(getStaticLayerCatalog('FJ')?.layers).toHaveLength(1);
    expect(getStaticEvents('FJ')[0].name).toBe('TC tc-wati');
  });

  it('leaves the existing countries exactly as they were', () => {
    expect(getStaticEvents('CK').map(event => event.id)).toEqual(['tc-ck-event']);
    expect(getLayersForCountry('CK' as never)).toHaveLength(3);
  });
});
