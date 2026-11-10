import { extractPartnerRiskBundle } from '../realDataLoader';

const floodplain = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  title: 'TC Wati 2026101912 - floodplain exposure',
  upload: 'https://api.example/media/risk_information/floodplain-exposure.geojson',
  geometry_computed: true,
  geometry: { type: 'FeatureCollection', features: [] },
  ...extra,
});

describe('extractPartnerRiskBundle, floodplain layer', () => {
  it('offers the floodplain layer when the server computed its geometry', () => {
    expect(extractPartnerRiskBundle([floodplain(123)]).forecastFloodplainRowId).toBe('123');
  });

  it('does not offer a floodplain layer for a row the server could not compute geometry for', () => {
    const stray = floodplain(49, { geometry_computed: false, geometry: null });
    expect(extractPartnerRiskBundle([stray]).forecastFloodplainRowId).toBeNull();
  });

  it('uses a good floodplain row even when a stray one comes first', () => {
    const rows = [floodplain(49, { geometry_computed: false, geometry: null }), floodplain(123)];
    expect(extractPartnerRiskBundle(rows).forecastFloodplainRowId).toBe('123');
  });

  it('keeps working for rows that do not say whether geometry was computed', () => {
    const { geometry_computed: _ignored, ...older } = floodplain(7);
    expect(extractPartnerRiskBundle([older]).forecastFloodplainRowId).toBe('7');
  });

  it('leaves every other kind of row alone', () => {
    const regional = {
      id: 1,
      title: 'regional impacts',
      upload: 'https://api.example/media/risk_information/regional-impacts.geojson',
      geometry_computed: false,
      geometry: null,
    };
    expect(extractPartnerRiskBundle([regional, floodplain(2)]).forecastFloodplainRowId).toBe('2');
  });
});
