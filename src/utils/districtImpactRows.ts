export interface DistrictImpactRow {
  id: string;
  name: string;
  totalEvents: number;
  totalAffectedPopulation: number;
  totalEconomicDamage: number;
}

const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * One row per area in a regional-impacts GeoJSON (the district / area-council
 * level the map is shaded from), biggest loss first. Province-level summary
 * CSVs only carry the coarser level, so the Impact table uses this when the
 * view is aggregated by district.
 */
export function districtImpactRows(
  collection: GeoJSON.FeatureCollection | null | undefined
): DistrictImpactRow[] {
  const rows: DistrictImpactRow[] = [];
  for (const feature of collection?.features ?? []) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const name = text(props['Region.Region']) || text(props.Region);
    const id = text(props['Region.ID']) || text(props.Region_ID) || name;
    if (!name) continue;
    rows.push({
      id,
      name,
      totalEvents: 1,
      totalAffectedPopulation: num(props.Population_Exposed_To_Any_Hazard),
      totalEconomicDamage: num(props.Total_Loss),
    });
  }
  return rows.sort((a, b) => b.totalEconomicDamage - a.totalEconomicDamage);
}
