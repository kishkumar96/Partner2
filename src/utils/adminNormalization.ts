type AnyRecord = Record<string, unknown>;

export interface NormalizedAreaMetrics {
  id: string;
  name: string;
  totalEvents: number;
  totalAffectedPopulation: number;
  totalEconomicDamage: number;
}

const AREA_ID_KEYS = [
  'areaId',
  'Region_ID',
  'Region.ID',
  'ID',
  'id',
  'districtId',
  'provinceId',
  'Region',
] as const;

const AREA_NAME_KEYS = ['areaName', 'Region', 'name', 'districtName', 'provinceName'] as const;

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getStringFromKeys(row: AnyRecord, keys: readonly string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

export function getAreaId(row: AnyRecord): string {
  const id = getStringFromKeys(row, AREA_ID_KEYS);
  if (id) return id;

  const fallbackName = getAreaName(row);
  return fallbackName || 'unknown-area';
}

export function getAreaName(row: AnyRecord): string {
  const name = getStringFromKeys(row, AREA_NAME_KEYS);
  if (name) return name;

  const id = getStringFromKeys(row, AREA_ID_KEYS);
  return id || 'Unknown';
}

export function areaMatchesSelection(row: AnyRecord, selection: string | null): boolean {
  if (!selection) return true;

  const normalizedSelection = normalizeToken(selection);
  const rawCandidates = [
    ...AREA_ID_KEYS.map(key => row[key]),
    ...AREA_NAME_KEYS.map(key => row[key]),
  ];

  return rawCandidates
    .map(value => normalizeToken(value))
    .filter(Boolean)
    .includes(normalizedSelection);
}

export function normalizeSummaryAreaRows(rows: AnyRecord[]): NormalizedAreaMetrics[] {
  const grouped = new Map<string, NormalizedAreaMetrics>();

  rows.forEach(row => {
    const id = getAreaId(row);
    const key = normalizeToken(id);
    const name = getAreaName(row);

    const current = grouped.get(key) ?? {
      id,
      name,
      totalEvents: 1,
      totalAffectedPopulation: 0,
      totalEconomicDamage: 0,
    };

    const affectedPopulation =
      row.totalAffectedPopulation ?? row.Population_Exposed_To_Any_Hazard ?? row.populationExposed;
    const economicDamage = row.totalEconomicDamage ?? row.Total_Loss ?? row.totalLoss;

    current.totalAffectedPopulation += toNumber(affectedPopulation);
    current.totalEconomicDamage += toNumber(economicDamage);

    grouped.set(key, current);
  });

  return Array.from(grouped.values()).filter(row => row.name.trim().length > 0);
}

export function normalizeEventAreaRows(rows: AnyRecord[]): NormalizedAreaMetrics[] {
  return rows
    .map(row => ({
      id: getAreaId(row),
      name: getAreaName(row),
      totalEvents: toNumber(row.totalEvents),
      totalAffectedPopulation: toNumber(row.totalAffectedPopulation),
      totalEconomicDamage: toNumber(row.totalEconomicDamage),
    }))
    .filter(row => row.name.trim().length > 0);
}
