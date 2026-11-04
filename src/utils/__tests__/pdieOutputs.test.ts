import {
  legacyAssetFeatures,
  legacyImpactFeatures,
  legacyImpactRow,
  sectorRowsFromAreas,
  sectorRowsFromNational,
  withLegacyImpactNames,
} from '@/utils/pdieOutputs';

// Trimmed from the Tonga example run (RiskScape 20915, TC Lola), values as the CSV gives them
const national: Record<string, unknown> = {
  'Event.id': '',
  Total_Loss_All_Sectors: '4.3258082E7',
  Total_Loss_Residential_Sector: '1.7897053E7',
  'Total_Loss_Emergency management_Sector': '998572.0',
  Total_Wind_Loss: '1.7530371E7',
  Total_Coastal_Flooding_Loss: '2.5727759E7',
  Total_Fluvial_Flooding_Loss: '0.0',
  Total_Exposed_Value_All_Sectors: '2.828298158E9',
  Total_Exposed_Value_Residential_Sector: '1.02631762E9',
  'Total_Exposed_Value_Emergency management_Sector': '5.221627E7',
  Total_Exposed_Count_Population: '78601.0',
  Total_Exposed_Count_Population_Wind: '75186.0',
  Total_Damaged_Building_Count_All_Sectors: '8429.0',
  Total_Damaged_Building_Count_Residential_Sector: '6000.0',
  Total_Damaged_Road_km: '142.0',
  'Total_Windspeed_>=_83_kmph_Exposed_Count_Population': '58376.0',
  'Total_Windspeed_>=_83_kmph_Wind_Loss': '100.0',
  'Total_Windspeed_>=_125_kmph_Exposed_Count_Population': '15711.0',
  'Total_Windspeed_>=_280_kmph_Exposed_Count_Population': '0.0',
};

const area: Record<string, unknown> = {
  Area: 'Tongatapu',
  ID: '1.0',
  'Event.id': '',
  Loss_All_Sectors: '4.2181182E7',
  Loss_Residential_Sector: '1.7E7',
  Loss_Health_Sector: '57321.0',
  Wind_Loss: '1.6E7',
  Coastal_Flooding_Loss: '2.6E7',
  Fluvial_Flooding_Loss: '0.0',
  Exposed_Value_All_Sectors: '2.0E9',
  Exposed_Count_Population: '60000.0',
  Damaged_Building_Count_All_Sectors: '7000.0',
  Damaged_Building_Count_Health_Sector: '3.0',
  'Windspeed_>=_83_kmph_Exposed_Count_Buildings': '17000.0',
  'Windspeed_>=_125_kmph_Exposed_Count_Buildings': '4000.0',
};

const square = [
  [
    [-175.3, -21.2],
    [-175.1, -21.2],
    [-175.1, -21.0],
    [-175.3, -21.2],
  ],
];

const collection = (
  properties: object[],
  geometry: GeoJSON.Geometry
): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: properties.map(props => ({ type: 'Feature', properties: { ...props }, geometry })),
});

describe('legacyImpactRow', () => {
  it('reads the national event-loss row as a national-summary row', () => {
    const row = legacyImpactRow(national);
    expect(row).toMatchObject({
      Region: 'National',
      Total_Loss: 43258082,
      Total_Wind_Loss: 17530371,
      Total_Coastal_Loss: 25727759,
      Total_Fluvial_Loss: 0,
      Total_Exposed_Value_To_Any_Hazard: 2828298158,
      Population_Exposed_To_Any_Hazard: 78601,
      Population_Exposed_To_Wind: 75186,
      Damaged_Buildings: 8429,
      Damaged_Road_km: 142,
      Residential_Building_Loss: 17897053,
    });
    // The new columns stay, for anything that reads them directly
    expect(row.Total_Loss_All_Sectors).toBe('4.3258082E7');
  });

  it('reads each windspeed column as one band, up to the next threshold', () => {
    const row = legacyImpactRow(national);
    expect(row['Wind_Gusts_kmph.range_83_125.Population']).toBe(58376);
    expect(row['Wind_Gusts_kmph.range_83_125.Total_Loss']).toBe(100);
    expect(row['Wind_Gusts_kmph.range_125_280.Population']).toBe(15711);
    expect(row['Wind_Gusts_kmph.range_280_+.Population']).toBe(0);
    // The model reports no band below its lowest threshold
    expect(row['Wind_Gusts_kmph.range_<_83.Population']).toBeUndefined();
  });

  it('reads an area row as a regional-summary row', () => {
    const row = legacyImpactRow(area);
    expect(row).toMatchObject({
      Region: 'Tongatapu',
      Region_ID: '1.0',
      Total_Loss: 42181182,
      Damaged_Buildings: 7000,
      'Wind_Gusts_kmph.range_83_125.Buildings': 17000,
      'Wind_Gusts_kmph.range_125_+.Buildings': 4000,
    });
  });

  it('leaves old-format rows alone', () => {
    const old = { Region: "A'ana", Total_Loss: '2430282', Max_Wind_Gusts: '175' };
    expect(legacyImpactRow(old)).toBe(old);
  });
});

describe('sector tables', () => {
  it('builds impact-by-sector rows from the national row, new sectors included', () => {
    expect(sectorRowsFromNational(national)).toEqual([
      {
        Sector: 'Residential',
        Total_Loss: 17897053,
        Total_Exposed_Value: 1026317620,
        Number_Exposed_Buildings: 0,
        Number_Damaged_Buildings: 6000,
      },
      {
        Sector: 'Emergency management',
        Total_Loss: 998572,
        Total_Exposed_Value: 52216270,
        Number_Exposed_Buildings: 0,
        Number_Damaged_Buildings: 0,
      },
    ]);
  });

  it('builds regional-summary-by-sector rows from the area rows', () => {
    const rows = sectorRowsFromAreas([area]);
    expect(rows.map(r => [r.Region, r.Sector, r.Total_Loss])).toEqual([
      ['Tongatapu', 'Residential', 17000000],
      ['Tongatapu', 'Health', 57321],
    ]);
  });
});

describe('legacyImpactFeatures', () => {
  it('adds the regional-impacts properties the map reads', () => {
    const out = legacyImpactFeatures(collection([area], { type: 'Polygon', coordinates: square }));
    expect(out.features[0].properties).toMatchObject({
      'Region.Region': 'Tongatapu',
      'Region.ID': '1.0',
      Region: 'Tongatapu',
      Total_Loss: 42181182,
    });
  });
});

describe('legacyAssetFeatures', () => {
  it('names a building map the way the damaged-buildings layer reads it', () => {
    const buildings = collection(
      [
        {
          Input_Layer: 'Building',
          UseType: 'Residential',
          Windspeed_kmph: 131.5,
          Loss: 5000,
          Wind_Loss: 1000,
          Coastal_Flooding_Loss: 4000,
          Fluvial_Flooding_Loss: 0,
        },
      ],
      { type: 'Polygon', coordinates: square }
    );
    const props = legacyAssetFeatures(buildings)!.features[0].properties!;
    expect(props).toMatchObject({
      Asset: 'Building',
      WindGust_kmph: 131.5,
      Coastal_Flood_Loss: 4000,
      Fluvial_Flood_Loss: 0,
    });
    expect(props.Road_km).toBeUndefined();
  });

  it("measures a road's length, which the new road map no longer gives", () => {
    // 0.1 degrees of longitude at 21S is about 10.38 km
    const roads = collection([{ Input_Layer: 'Road', Loss: 10 }], {
      type: 'LineString',
      coordinates: [
        [-175.2, -21.1],
        [-175.1, -21.1],
      ],
    });
    expect(legacyAssetFeatures(roads)!.features[0].properties!.Road_km).toBeCloseTo(10.38, 1);
  });

  it('leaves old damaged-buildings features alone', () => {
    const old = collection([{ Asset: 'Building', WindGust_kmph: 120 }], {
      type: 'Point',
      coordinates: [0, 0],
    });
    expect(legacyAssetFeatures(old)).toBe(old);
  });
});

describe('withLegacyImpactNames', () => {
  type Rows = Array<Record<string, unknown>>;
  const empty = {
    regionalImpacts: null as GeoJSON.FeatureCollection | null,
    regionalImpactsBySector: null as GeoJSON.FeatureCollection | null,
    nationalSummary: [] as Rows,
    impactBySector: [] as Rows,
    regionalSummary: [] as Rows,
    regionalSummaryBySector: [] as Rows,
    damagedBuildings: null as GeoJSON.FeatureCollection | null,
    damagedRoads: null as GeoJSON.FeatureCollection | null,
  };

  it('fills the tables the new model no longer writes', () => {
    const out = withLegacyImpactNames({
      ...empty,
      nationalSummary: [national],
      regionalSummary: [area],
      regionalImpacts: collection([area], { type: 'Polygon', coordinates: square }),
    });
    expect(out.nationalSummary[0].Total_Loss).toBe(43258082);
    expect(out.impactBySector.map(r => r.Sector)).toEqual(['Residential', 'Emergency management']);
    expect(out.regionalSummaryBySector).toHaveLength(2);
    expect(out.regionalImpactsBySector!.features[0].properties).toMatchObject({
      Region: 'Tongatapu',
      'Sector.Health.Loss': 57321,
    });
  });

  it('returns an old-format bundle as it was', () => {
    const bundle = {
      ...empty,
      nationalSummary: [{ Region: 'National', Total_Loss: '9356636' }],
      impactBySector: [{ Sector: 'Education', Total_Loss: '7059' }],
    };
    const out = withLegacyImpactNames(bundle);
    expect(out.nationalSummary).toEqual(bundle.nationalSummary);
    expect(out.impactBySector).toBe(bundle.impactBySector);
  });
});
