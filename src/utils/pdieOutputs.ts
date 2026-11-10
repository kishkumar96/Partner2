/**
 * The PDIE model's 2026 outputs (event-loss-*.csv/gpkg, Ryan's naming scheme) read as the
 * older outputs (national-summary, regional-impacts, impact-by-sector, damaged-*), so events
 * imported in either format show the same way. Old-format data passes through unchanged.
 *
 * National columns are the area columns with a `Total_` prefix: `Total_Loss_All_Sectors`
 * beside an area's `Loss_All_Sectors`.
 */

type Row = Record<string, unknown>;

/** Old column <- new column, as named in an area row */
const AREA_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['Total_Loss', 'Loss_All_Sectors'],
  ['Total_Wind_Loss', 'Wind_Loss'],
  ['Total_Coastal_Loss', 'Coastal_Flooding_Loss'],
  ['Total_Fluvial_Loss', 'Fluvial_Flooding_Loss'],
  ['Total_Exposed_Value', 'Exposed_Value_All_Sectors'],
  ['Total_Exposed_Value_To_Any_Hazard', 'Exposed_Value_All_Sectors'],
  ['Total_Exposed_Value_To_Wind', 'Exposed_Value_Wind'],
  ['Total_Exposed_Value_To_Coastal_Flooding', 'Exposed_Value_Coastal_Flooding'],
  ['Total_Exposed_Value_To_Fluvial_Flooding', 'Exposed_Value_Fluvial_Flooding'],
  ['Population_Exposed_To_Any_Hazard', 'Exposed_Count_Population'],
  ['Population_Exposed_To_Wind', 'Exposed_Count_Population_Wind'],
  ['Population_Exposed_To_Coastal_Flooding', 'Exposed_Count_Population_Coastal_Flooding'],
  ['Population_Exposed_To_Fluvial_Flooding', 'Exposed_Count_Population_Fluvial_Flooding'],
  ['Buildings_Exposed_To_Any_Hazard', 'Exposed_Building_Count_All_Sectors'],
  ['Buildings_Exposed_To_Wind', 'Exposed_Building_Count_Wind'],
  ['Buildings_Exposed_To_Coastal_Flooding', 'Exposed_Building_Count_Coastal_Flooding'],
  ['Buildings_Exposed_To_Fluvial_Flooding', 'Exposed_Building_Count_Fluvial_Flooding'],
  ['Damaged_Buildings', 'Damaged_Building_Count_All_Sectors'],
  ['Damaged_Road_km', 'Damaged_Road_km'],
  ['Road_km_Exposed_To_Flooding', 'Exposed_Road_km_Flooding'],
  ['Residential_Building_Loss', 'Loss_Residential_Sector'],
  ['Infrastructure_Loss', 'Loss_Infrastructure_Sector'],
  ['Exposed_Schools', 'Exposed_Building_Count_Education_Sector'],
  ['Exposed_Health_Facilties', 'Exposed_Building_Count_Health_Sector'],
];

// Despite the ">=" each column is one band: ">=_83" holds 83-125 km/h, the next threshold up
// starts the next band (checked against all four 2026 example runs, whose bands sum to the total)
const WIND_BAND =
  /^(?:Total_)?Windspeed_>=_(\d+(?:\.\d+)?)_kmph_(Exposed_Count_Buildings|Exposed_Count_Population|Wind_Loss)$/;
const WIND_BAND_MEASURE: Record<string, string> = {
  Exposed_Count_Buildings: 'Buildings',
  Exposed_Count_Population: 'Population',
  Wind_Loss: 'Total_Loss',
};
const SECTOR_LOSS = /^(?:Total_)?Loss_(.+)_Sector$/;

const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function isEventLossRow(row: unknown): row is Row {
  return (
    !!row &&
    typeof row === 'object' &&
    ('Loss_All_Sectors' in row || 'Total_Loss_All_Sectors' in row)
  );
}

function windBandColumns(row: Row, prefix: string): Row {
  const thresholds = new Set<number>();
  for (const key of Object.keys(row)) {
    const match = WIND_BAND.exec(key);
    if (match && key.startsWith(prefix)) thresholds.add(Number(match[1]));
  }
  const sorted = [...thresholds].sort((a, b) => a - b);
  const out: Row = {};
  sorted.forEach((low, i) => {
    const band = i + 1 < sorted.length ? `${low}_${sorted[i + 1]}` : `${low}_+`;
    for (const [measure, legacy] of Object.entries(WIND_BAND_MEASURE)) {
      const key = `${prefix}Windspeed_>=_${low}_kmph_${measure}`;
      if (key in row) out[`Wind_Gusts_kmph.range_${band}.${legacy}`] = num(row[key]);
    }
  });
  return out;
}

/** An event-loss row (national when it has the Total_ columns) with the old column names added */
export function legacyImpactRow(row: Row): Row {
  if (!isEventLossRow(row)) return row;
  const national = 'Total_Loss_All_Sectors' in row;
  const prefix = national ? 'Total_' : '';
  const out: Row = { ...row };
  for (const [legacy, column] of AREA_COLUMNS) {
    const key = prefix + column;
    if (key in row) out[legacy] = num(row[key]);
  }
  Object.assign(out, windBandColumns(row, prefix));
  if (national) {
    out.Region = 'National';
  } else {
    out.Region = row.Area ?? row.Region;
    out.Region_ID = row.ID ?? row.Region_ID;
  }
  return out;
}

function sectorsOf(row: Row): string[] {
  const sectors: string[] = [];
  for (const key of Object.keys(row)) {
    const match = SECTOR_LOSS.exec(key);
    if (match && match[1] !== 'All') sectors.push(match[1]);
  }
  return sectors;
}

function sectorRow(row: Row, sector: string, prefix: string): Row {
  return {
    Sector: sector,
    Total_Loss: num(row[`${prefix}Loss_${sector}_Sector`]),
    Total_Exposed_Value: num(row[`${prefix}Exposed_Value_${sector}_Sector`]),
    Number_Exposed_Buildings: num(row[`${prefix}Exposed_Building_Count_${sector}_Sector`]),
    Number_Damaged_Buildings: num(row[`${prefix}Damaged_Building_Count_${sector}_Sector`]),
  };
}

/** impact-by-sector rows from the national event-loss row */
export function sectorRowsFromNational(row: Row): Row[] {
  return sectorsOf(row).map(sector => sectorRow(row, sector, 'Total_'));
}

/** regional-summary-by-sector rows from the area event-loss rows */
export function sectorRowsFromAreas(rows: Row[]): Row[] {
  return rows.filter(isEventLossRow).flatMap(row =>
    sectorsOf(row).map(sector => ({
      Region: row.Area ?? row.Region,
      ...sectorRow(row, sector, ''),
    }))
  );
}

function mapProperties(
  collection: GeoJSON.FeatureCollection,
  map: (props: Row, feature: GeoJSON.Feature) => Row
): GeoJSON.FeatureCollection {
  return {
    ...collection,
    features: collection.features.map(feature => ({
      ...feature,
      properties: map((feature.properties ?? {}) as Row, feature),
    })),
  };
}

const isEventLossCollection = (collection: GeoJSON.FeatureCollection | null | undefined) =>
  !!collection && isEventLossRow(collection.features[0]?.properties);

/** An event-loss area map with the old regional-impacts properties added */
export function legacyImpactFeatures(
  collection: GeoJSON.FeatureCollection
): GeoJSON.FeatureCollection {
  if (!isEventLossCollection(collection)) return collection;
  return mapProperties(collection, props => {
    const out = legacyImpactRow(props);
    return { ...out, 'Region.Region': out.Region, 'Region.ID': out.Region_ID };
  });
}

/** regional-impacts-by-sector features (Sector.<name>.Loss) from an event-loss area map */
export function sectorFeaturesFromAreas(
  collection: GeoJSON.FeatureCollection
): GeoJSON.FeatureCollection {
  return mapProperties(collection, props => {
    const out: Row = { ID: props.ID, Region: props.Area ?? props.Region };
    for (const sector of sectorsOf(props)) {
      out[`Sector.${sector}.Loss`] = num(props[`Loss_${sector}_Sector`]);
      out[`Sector.${sector}.Exposed_Value`] = num(props[`Exposed_Value_${sector}_Sector`]);
    }
    return out;
  });
}

const EARTH_RADIUS_KM = 6371.0088;

function lineKm(line: GeoJSON.Position[]): number {
  let km = 0;
  for (let i = 1; i < line.length; i++) {
    const [lon1, lat1] = line[i - 1].map(v => (v * Math.PI) / 180);
    const [lon2, lat2] = line[i].map(v => (v * Math.PI) / 180);
    const a =
      Math.sin((lat2 - lat1) / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
    km += 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
  }
  return km;
}

function geometryKm(geometry: GeoJSON.Geometry | null | undefined): number | null {
  if (geometry?.type === 'LineString') return lineKm(geometry.coordinates);
  if (geometry?.type === 'MultiLineString') {
    return geometry.coordinates.reduce((sum, line) => sum + lineKm(line), 0);
  }
  return null;
}

/**
 * An event-loss building or road map with the old damaged-buildings/roads properties added.
 * The new maps have no Road_km, so a road's length is measured from its line.
 */
export function legacyAssetFeatures(
  collection: GeoJSON.FeatureCollection | null
): GeoJSON.FeatureCollection | null {
  const sample = collection?.features[0]?.properties as Row | undefined;
  if (!collection || !sample || !('Input_Layer' in sample) || 'Asset' in sample) return collection;
  return mapProperties(collection, (props, feature) => {
    const out: Row = {
      ...props,
      Asset: props.Input_Layer,
      WindGust_kmph: num(props.Windspeed_kmph),
      Coastal_Flood_Loss: num(props.Coastal_Flooding_Loss),
      Fluvial_Flood_Loss: num(props.Fluvial_Flooding_Loss),
    };
    const km = geometryKm(feature.geometry);
    if (km !== null && !('Road_km' in props)) out.Road_km = km;
    return out;
  });
}

interface ImpactBundle {
  regionalImpacts: GeoJSON.FeatureCollection | null;
  regionalImpactsBySector: GeoJSON.FeatureCollection | null;
  nationalSummary: Row[];
  impactBySector: Row[];
  regionalSummary: Row[];
  regionalSummaryBySector: Row[];
  damagedBuildings: GeoJSON.FeatureCollection | null;
  damagedRoads: GeoJSON.FeatureCollection | null;
}

/**
 * A risk bundle whose tables came from event-loss outputs, read as the older outputs. The
 * by-sector tables the new model no longer writes are built from its per-sector columns.
 */
export function withLegacyImpactNames<T extends ImpactBundle>(bundle: T): T {
  const national = bundle.nationalSummary.find(isEventLossRow);
  const areaRows = bundle.regionalSummary.filter(isEventLossRow);
  const areaMap = isEventLossCollection(bundle.regionalImpacts) ? bundle.regionalImpacts : null;
  if (
    !national &&
    areaRows.length === 0 &&
    !areaMap &&
    !bundle.damagedBuildings &&
    !bundle.damagedRoads
  ) {
    return bundle;
  }
  return {
    ...bundle,
    nationalSummary: bundle.nationalSummary.map(legacyImpactRow),
    regionalSummary: bundle.regionalSummary.map(legacyImpactRow),
    regionalImpacts: bundle.regionalImpacts && legacyImpactFeatures(bundle.regionalImpacts),
    impactBySector:
      bundle.impactBySector.length === 0 && national
        ? sectorRowsFromNational(national)
        : bundle.impactBySector,
    regionalSummaryBySector:
      bundle.regionalSummaryBySector.length === 0 && areaRows.length > 0
        ? sectorRowsFromAreas(areaRows)
        : bundle.regionalSummaryBySector,
    regionalImpactsBySector:
      !bundle.regionalImpactsBySector && areaMap
        ? sectorFeaturesFromAreas(areaMap)
        : bundle.regionalImpactsBySector,
    damagedBuildings: legacyAssetFeatures(bundle.damagedBuildings),
    damagedRoads: legacyAssetFeatures(bundle.damagedRoads),
  };
}
