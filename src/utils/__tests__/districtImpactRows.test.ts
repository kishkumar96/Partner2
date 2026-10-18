import { districtImpactRows } from '../districtImpactRows';

const feature = (props: Record<string, unknown>): GeoJSON.Feature => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'Point', coordinates: [0, 0] },
});

describe('districtImpactRows', () => {
  it('builds one row per area, biggest loss first', () => {
    const rows = districtImpactRows({
      type: 'FeatureCollection',
      features: [
        feature({ 'Region.ID': 'VU06023', 'Region.Region': 'South West Tanna', Total_Loss: 19 }),
        feature({
          'Region.ID': 'VU03017',
          'Region.Region': 'North Pentecost',
          Total_Loss: 35753243,
          Population_Exposed_To_Any_Hazard: 6679,
        }),
      ],
    });
    expect(rows.map(r => r.name)).toEqual(['North Pentecost', 'South West Tanna']);
    expect(rows[0]).toMatchObject({
      id: 'VU03017',
      totalAffectedPopulation: 6679,
      totalEconomicDamage: 35753243,
    });
  });

  it('skips features with no name and tolerates a missing collection', () => {
    expect(districtImpactRows(null)).toEqual([]);
    expect(
      districtImpactRows({ type: 'FeatureCollection', features: [feature({ Total_Loss: 5 })] })
    ).toEqual([]);
  });
});
