import { normalizeHazardIds } from './hazardIds';

/**
 * Risk rows (national / regional / sector / asset summaries) cover every
 * hazard at once and carry each hazard's share as separate columns:
 * Total_Loss = Total_Wind_Loss + Total_Coastal_Loss + Total_Fluvial_Loss,
 * plus per-hazard exposure (Population_Exposed_To_Wind, ..._To_Coastal_Flooding,
 * ...). So the Hazards filter doesn't drop risk rows; it picks which of those
 * columns the dashboard reads. scopeRiskRows rewrites the "all hazards"
 * columns of each row to the selected hazard's values, so every consumer
 * (summary, tables, charts, map, exports) follows without its own logic.
 */

/** hazardId for risk records that cover all hazards (never filtered out by hazard) */
export const MULTI_HAZARD_ID = 'multi-hazard';

export type HazardLossScope = 'all' | 'wind' | 'flood';

const WIND_HAZARD_IDS = new Set(['tropical-cyclone', 'wind', 'cyclone_track']);
const FLOOD_HAZARD_IDS = new Set([
  'flood',
  'inundation',
  'storm-surge',
  'coastal',
  'coastal-flood',
  'fluvial-depth',
]);

export const HAZARD_LOSS_SCOPE_LABEL: Record<HazardLossScope, string> = {
  all: 'all hazards',
  wind: 'wind',
  flood: 'flooding',
};

/** Wind-only, flood-only, or all hazards (nothing or both selected). */
export function getHazardLossScope(selectedHazards: string[]): HazardLossScope {
  const ids = normalizeHazardIds(selectedHazards);
  const wind = ids.some(id => WIND_HAZARD_IDS.has(id));
  const flood = ids.some(id => FLOOD_HAZARD_IDS.has(id));
  if (wind && !flood) return 'wind';
  if (flood && !wind) return 'flood';
  return 'all';
}

type Row = Record<string, unknown>;

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Sum of the given columns, or null if any is missing (so we never guess). */
function sumColumns(row: Row, columns: string[]): number | null {
  let total = 0;
  for (const column of columns) {
    const value = num(row[column]);
    if (value === null) return null;
    total += value;
  }
  return total;
}

// "All hazards" column -> the columns that make it up, per scope
const SCOPED_COLUMNS: Record<string, Record<Exclude<HazardLossScope, 'all'>, string[]>> = {
  Total_Loss: {
    wind: ['Total_Wind_Loss'],
    flood: ['Total_Coastal_Loss', 'Total_Fluvial_Loss'],
  },
  Population_Exposed_To_Any_Hazard: {
    wind: ['Population_Exposed_To_Wind'],
    flood: ['Population_Exposed_To_Coastal_Flooding', 'Population_Exposed_To_Fluvial_Flooding'],
  },
  Buildings_Exposed_To_Any_Hazard: {
    wind: ['Buildings_Exposed_To_Wind'],
    flood: ['Buildings_Exposed_To_Coastal_Flooding', 'Buildings_Exposed_To_Fluvial_Flooding'],
  },
  Total_Exposed_Value_To_Any_Hazard: {
    wind: ['Total_Exposed_Value_To_Wind'],
    flood: ['Total_Exposed_Value_To_Coastal_Flooding', 'Total_Exposed_Value_To_Fluvial_Flooding'],
  },
};

// Loss by asset class has no per-hazard split; with one hazard selected these
// would contradict the scoped total, so they're cleared rather than kept.
const UNSPLIT_LOSS_COLUMNS = [
  'Building_Loss',
  'Road_Loss',
  'Crop_Loss',
  'Infrastructure_Loss',
  'Residential_Building_Loss',
];

// regional-impacts-by-sector style columns: "Sector.Residential.Loss" etc.
const SECTOR_LOSS_COLUMN = /^(Sector\.[^.]+\.)Loss$/;

export interface ScopedRow {
  row: Row;
  /** False when the row has a total but not the columns to split it */
  split: boolean;
  /** Flood population adds coastal and river exposure, which can overlap */
  mayDoubleCount: boolean;
}

export function scopeRiskRow(row: Row, scope: HazardLossScope): ScopedRow {
  if (scope === 'all') return { row, split: true, mayDoubleCount: false };

  const scoped: Row = { ...row };
  let split = true;
  for (const [column, parts] of Object.entries(SCOPED_COLUMNS)) {
    if (!(column in row)) continue;
    const value = sumColumns(row, parts[scope]);
    if (value === null) {
      if (column === 'Total_Loss') split = false;
      continue;
    }
    scoped[column] = value;
  }
  for (const key of Object.keys(row)) {
    const match = SECTOR_LOSS_COLUMN.exec(key);
    if (!match) continue;
    const prefix = match[1];
    const parts =
      scope === 'wind'
        ? [`${prefix}Wind_Loss`]
        : [`${prefix}Coastal_Loss`, `${prefix}Fluvial_Loss`];
    const value = sumColumns(row, parts);
    if (value === null) split = false;
    else scoped[key] = value;
  }
  if (split) {
    UNSPLIT_LOSS_COLUMNS.forEach(column => {
      if (column in scoped) scoped[column] = null;
    });
  }

  const coastal = num(row.Population_Exposed_To_Coastal_Flooding) ?? 0;
  const fluvial = num(row.Population_Exposed_To_Fluvial_Flooding) ?? 0;
  return {
    row: split ? scoped : row,
    split,
    mayDoubleCount: scope === 'flood' && coastal > 0 && fluvial > 0,
  };
}

export interface ScopedRows<T> {
  rows: T[];
  /** Every row that had a total could be split for this hazard */
  complete: boolean;
  mayDoubleCount: boolean;
}

export function scopeRiskRows<T extends Row>(
  rows: T[] | undefined | null,
  scope: HazardLossScope
): ScopedRows<T> {
  if (!rows || rows.length === 0 || scope === 'all') {
    return { rows: rows ?? [], complete: true, mayDoubleCount: false };
  }
  let complete = true;
  let mayDoubleCount = false;
  const scoped = rows.map(row => {
    const result = scopeRiskRow(row, scope);
    if (!result.split && 'Total_Loss' in row) complete = false;
    mayDoubleCount ||= result.mayDoubleCount;
    return result.row as T;
  });
  return { rows: scoped, complete, mayDoubleCount };
}

/** Same as scopeRiskRows, for a FeatureCollection's feature properties. */
export function scopeRiskFeatures(
  collection: GeoJSON.FeatureCollection | null | undefined,
  scope: HazardLossScope
): { collection: GeoJSON.FeatureCollection | null | undefined; complete: boolean } {
  if (!collection?.features || scope === 'all') return { collection, complete: true };
  let complete = true;
  const features = collection.features.map(feature => {
    const props = (feature.properties ?? {}) as Row;
    const result = scopeRiskRow(props, scope);
    if (!result.split && 'Total_Loss' in props) complete = false;
    return { ...feature, properties: result.row };
  });
  return { collection: { ...collection, features }, complete };
}

interface EconomicRecord {
  totalLoss?: number;
  directLoss?: number;
  indirectLoss?: number;
}

/**
 * Sector / asset economic records (converted rows) keep wind loss as
 * directLoss and coastal + river loss as indirectLoss.
 */
export function scopeEconomicRecords<T extends EconomicRecord>(
  records: T[],
  scope: HazardLossScope
): T[] {
  if (scope === 'all') return records;
  return records.map(record => {
    const wind = record.directLoss ?? 0;
    const flood = record.indirectLoss ?? 0;
    return scope === 'wind'
      ? { ...record, totalLoss: wind, indirectLoss: 0 }
      : { ...record, totalLoss: flood, directLoss: 0 };
  });
}
