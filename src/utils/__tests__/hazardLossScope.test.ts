import {
  getHazardLossScope,
  MULTI_HAZARD_ID,
  scopeEconomicRecords,
  scopeRiskFeatures,
  scopeRiskRow,
  scopeRiskRows,
} from '../hazardLossScope';
import { filterEconomicDamageData } from '../filterUtils';
import type { EconomicDamageData, FilterState } from '@/types';

// Vanuatu national summary for TC Lola (real values, rounded)
const vuNational = {
  Total_Loss: 231736853,
  Total_Wind_Loss: 223794252,
  Total_Coastal_Loss: 7942601,
  Total_Fluvial_Loss: 0,
  Population_Exposed_To_Any_Hazard: 89139,
  Population_Exposed_To_Wind: 89000,
  Population_Exposed_To_Coastal_Flooding: 3100,
  Population_Exposed_To_Fluvial_Flooding: 0,
  Building_Loss: 150000000,
  Crop_Loss: 2000000,
};

describe('getHazardLossScope', () => {
  it('maps hazard selections to wind, flood or all', () => {
    expect(getHazardLossScope([])).toBe('all');
    expect(getHazardLossScope(['tropical-cyclone'])).toBe('wind');
    expect(getHazardLossScope(['wind'])).toBe('wind');
    expect(getHazardLossScope(['flood'])).toBe('flood');
    expect(getHazardLossScope(['inundation'])).toBe('flood');
    expect(getHazardLossScope(['tropical-cyclone', 'flood'])).toBe('all');
  });
});

describe('scopeRiskRow', () => {
  it('leaves rows untouched for all hazards', () => {
    expect(scopeRiskRow(vuNational, 'all').row).toBe(vuNational);
  });

  it('reads wind loss and wind exposure for the wind scope', () => {
    const { row, split } = scopeRiskRow(vuNational, 'wind');
    expect(split).toBe(true);
    expect(row.Total_Loss).toBe(223794252);
    expect(row.Population_Exposed_To_Any_Hazard).toBe(89000);
  });

  it('adds coastal and river flooding for the flood scope', () => {
    const { row } = scopeRiskRow(vuNational, 'flood');
    expect(row.Total_Loss).toBe(7942601);
    expect(row.Population_Exposed_To_Any_Hazard).toBe(3100);
  });

  it('clears loss columns that have no per-hazard split', () => {
    const { row } = scopeRiskRow(vuNational, 'wind');
    expect(row.Building_Loss).toBeNull();
    expect(row.Crop_Loss).toBeNull();
  });

  it('scopes per-sector loss columns', () => {
    const { row } = scopeRiskRow(
      {
        Total_Loss: 10,
        Total_Wind_Loss: 6,
        Total_Coastal_Loss: 3,
        Total_Fluvial_Loss: 1,
        'Sector.Residential.Loss': 5,
        'Sector.Residential.Wind_Loss': 2,
        'Sector.Residential.Coastal_Loss': 2,
        'Sector.Residential.Fluvial_Loss': 1,
      },
      'flood'
    );
    expect(row.Total_Loss).toBe(4);
    expect(row['Sector.Residential.Loss']).toBe(3);
  });

  it('keeps a row unchanged when it has no per-hazard columns', () => {
    const plain = { Total_Loss: 100, Building_Loss: 60 };
    const result = scopeRiskRow(plain, 'wind');
    expect(result.split).toBe(false);
    expect(result.row).toBe(plain);
  });

  it('flags flood exposure that may count people twice', () => {
    const both = { ...vuNational, Population_Exposed_To_Fluvial_Flooding: 50 };
    expect(scopeRiskRow(both, 'flood').mayDoubleCount).toBe(true);
    expect(scopeRiskRow(vuNational, 'flood').mayDoubleCount).toBe(false);
  });
});

describe('scopeRiskRows / scopeRiskFeatures', () => {
  it('reports when some rows could not be split', () => {
    const result = scopeRiskRows([vuNational, { Total_Loss: 5 }], 'wind');
    expect(result.complete).toBe(false);
    expect(result.rows[0].Total_Loss).toBe(223794252);
    expect(result.rows[1].Total_Loss).toBe(5);
  });

  it('scopes feature properties', () => {
    const { collection, complete } = scopeRiskFeatures(
      {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: null as never, properties: vuNational }],
      },
      'flood'
    );
    expect(complete).toBe(true);
    expect(collection!.features[0].properties!.Total_Loss).toBe(7942601);
  });
});

describe('scopeEconomicRecords', () => {
  it('uses wind (direct) or flooding (indirect) loss as the total', () => {
    const records = [{ totalLoss: 10, directLoss: 7, indirectLoss: 3 }];
    expect(scopeEconomicRecords(records, 'wind')[0]).toMatchObject({
      totalLoss: 7,
      indirectLoss: 0,
    });
    expect(scopeEconomicRecords(records, 'flood')[0]).toMatchObject({
      totalLoss: 3,
      directLoss: 0,
    });
  });
});

describe('hazard filter on multi-hazard risk records', () => {
  it('keeps them for any hazard selection', () => {
    const record = {
      hazardId: MULTI_HAZARD_ID,
      sectorId: 'Residential',
      eventId: 'e1',
      year: 2023,
    } as unknown as EconomicDamageData;
    const filters: FilterState = {
      selectedHazards: ['flood'],
      selectedSectors: [],
      selectedEvents: [],
      dateRange: { start: '', end: '' },
      aggregationLevel: 'province',
    };
    expect(filterEconomicDamageData([record], filters)).toHaveLength(1);
  });
});
