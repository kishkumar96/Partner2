/**
 * Fallback events and static map layers behave exactly as they did before they moved into config/.
 * parity2.fixture.json was captured from the code as it was before this change.
 * The one difference is deliberate: an event's `hazardLayerIds` (never read anywhere) named layers
 * that do not exist for three of the four events; it is now derived from the layers' real `eventId` link.
 */
import fixture from './parity2.fixture.json';
import { getLocalEventRecords, getDefaultEventRecord } from '@/data/eventRecords';
import { REAL_WMS_LAYERS, buildWMSTileUrl, getLayersForCountry } from '@/data/realThreddsLayers';
import { listCountryCodes } from '../registry';

const codes = listCountryCodes();

describe('parity of events and layers with the pre-migration code', () => {
  it.each(codes)('keeps the %s fallback events identical, apart from hazardLayerIds', code => {
    const before = (fixture.events as Record<string, any[]>)[code].map(
      ({ hazardLayerIds, ...rest }) => rest
    );
    const after = getLocalEventRecords(code).map(({ hazardLayerIds, ...rest }) => rest);
    expect(after).toEqual(before);
  });

  it('derives each event’s layers from the layers that name it, and every id exists', () => {
    const layerIds = new Set(REAL_WMS_LAYERS.map(layer => layer.id));
    for (const code of codes) {
      for (const event of getLocalEventRecords(code)) {
        expect(event.hazardLayerIds?.length).toBeGreaterThan(0);
        for (const id of event.hazardLayerIds ?? []) {
          expect(layerIds.has(id)).toBe(true);
          expect(REAL_WMS_LAYERS.find(layer => layer.id === id)?.eventId).toBe(event.id);
        }
      }
    }
  });

  it('keeps the ten static layers identical, in the same order', () => {
    expect(REAL_WMS_LAYERS).toEqual(fixture.layers);
  });

  it('builds the same map tile URL for every layer, so the dataset paths are unchanged', () => {
    for (const layer of REAL_WMS_LAYERS) {
      expect(buildWMSTileUrl(layer)).toBe((fixture.tileUrls as Record<string, string>)[layer.id]);
    }
  });

  it.each(codes)('keeps the layers offered for %s', code => {
    expect(getLayersForCountry(code).map(layer => layer.id)).toEqual(
      (fixture.forCountry as Record<string, string[]>)[code]
    );
  });

  it('keeps the same default event for each country', () => {
    for (const code of codes) {
      const expected = (fixture.events as Record<string, any[]>)[code].find(
        event => event.isDefault
      );
      expect(getDefaultEventRecord(code).id).toBe(expected.id);
    }
  });
});
