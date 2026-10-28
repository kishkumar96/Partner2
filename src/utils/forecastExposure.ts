/**
 * Rapid Exposure Forecast (REF) results.
 *
 * REF runs on an official forecast track before landfall and reports what is
 * exposed to forecast winds (people, buildings, roads, facilities), not
 * modelled damage or loss. Its tables carry `Exposed_*` columns and no
 * `Total_Loss`, so the dashboard shows them as exposure instead of as a
 * damage assessment with every loss at zero.
 *
 * REF tables:
 *   total-exposed-by-country.csv  one national row
 *   regional-summary.csv          one row per province (plus a blank-region row
 *                                 for assets outside every province)
 *   total-by-windspeed.csv        one row per wind danger band
 *   total-by-track-distance.csv   one row per distance band from the track
 *   exposure-by-cluster.geojson   health facilities, schools and evacuation
 *                                 centres, each with its forecast wind
 *   wind-swaths.geojson           forecast wind band areas (map overlay)
 *   track-distance.geojson        distance rings around the track (overlay)
 *   floodplain-exposure.geojson   floodplains under forecast winds, with what's
 *                                 in each (overlay; large, loaded on demand)
 */

type Row = Record<string, unknown>;

export interface ExposureTotals {
  population: number;
  buildings: number;
  residentialBuildings: number;
  nonresidentialBuildings: number;
  buildingValue: number;
  roadKm: number;
  roadValue: number;
  cropValue: number;
  infrastructureValue: number;
  evacuationCentres: number;
  healthFacilities: number;
  schools: number;
}

export interface ExposureArea {
  name: string;
  overallWinds: string | null;
  minWindKmph: number | null;
  maxWindKmph: number | null;
  /** Under gale-force winds or stronger */
  exposed: ExposureTotals;
  /** Of what's exposed, the part in floodplains */
  inFloodplains: ExposureTotals;
  /** Not exposed on the forecast track but within its uncertainty */
  inTrackUncertainty: ExposureTotals;
  /** Everything in the area, exposed or not */
  total: ExposureTotals;
  totalPopulation: number;
  totalBuildings: number;
  populationInFloodplains: number;
  populationInTrackUncertainty: number;
}

export interface ExposedFacility {
  id: string;
  name: string;
  /** Health Facility, School or Evacuation Centre */
  asset: string;
  /** e.g. Hospital, Dispensary, Host household */
  useType: string;
  area: string;
  danger: string | null;
  windKmph: number | null;
  trackDistance: string;
  inFloodplain: boolean;
}

export interface ExposureBand {
  label: string;
  /** Wind speed in knots for danger bands, distance in km for track bands */
  value: number | null;
  totals: ExposureTotals;
}

export interface ForecastExposure {
  national: ExposureArea | null;
  regions: ExposureArea[];
  byWindDanger: ExposureBand[];
  byTrackDistance: ExposureBand[];
  facilities: ExposedFacility[];
  /** Map overlays */
  layers: {
    facilities: GeoJSON.FeatureCollection | null;
    windSwaths: GeoJSON.FeatureCollection | null;
    trackDistance: GeoJSON.FeatureCollection | null;
    /** The forecast track as a line: REF's own input track when the run kept it,
     * otherwise the track linked to the event. */
    cycloneTrack: GeoJSON.FeatureCollection | null;
    /** Where `cycloneTrack` came from */
    cycloneTrackSource: 'run' | 'event' | null;
    /** risk_information row to fetch floodplain-exposure from when shown */
    floodplainRowId: string | null;
  };
}

/** Danger bands from the least to the most severe, as REF names them */
export const WIND_DANGER_ORDER = [
  'Not exposed',
  'Track Uncertainty',
  'Possible Gale Winds',
  'Gale Winds',
  'Possible Storm Winds',
  'Storm Winds',
  'Possible Hurricane Winds',
  'Hurricane Winds',
] as const;

/** Every area name the map colours: the wind bands plus the radius of maximum winds ring */
export const MAP_DANGER_NAMES = [...WIND_DANGER_ORDER, 'Radius of Maximum Winds'] as const;

const DANGER_COLORS: Record<string, string> = {
  'Not exposed': '#cbd5e1',
  'Track Uncertainty': '#a5b4fc',
  'Possible Gale Winds': '#fde68a',
  'Gale Winds': '#facc15',
  'Possible Storm Winds': '#fdba74',
  'Storm Winds': '#f97316',
  'Possible Hurricane Winds': '#f87171',
  'Hurricane Winds': '#b91c1c',
  'Radius of Maximum Winds': '#c026d3',
};

export function windDangerColor(danger: string | null | undefined): string {
  return (danger && DANGER_COLORS[danger]) || '#94a3b8';
}

/** Whether a band counts towards "exposed" totals (REF's own definition) */
export function isExposedDanger(danger: string): boolean {
  return danger !== 'Not exposed' && danger !== 'Track Uncertainty';
}

function num(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function optionalNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = num(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** REF spells "Facilities" as "Facilties"; accept both */
function field(row: Row, ...names: string[]): unknown {
  for (const name of names) {
    if (row[name] !== undefined) return row[name];
  }
  return undefined;
}

/** REF's column stem for each measure; Health "Facilties" is REF's spelling */
const MEASURE_STEMS: Record<keyof ExposureTotals, string[]> = {
  population: ['Population'],
  buildings: ['Buildings'],
  residentialBuildings: ['Residential_Buildings'],
  nonresidentialBuildings: ['Nonresidential_Buildings'],
  buildingValue: ['Building_Value'],
  roadKm: ['Road_km'],
  roadValue: ['Road_Value'],
  cropValue: ['Crop_Value'],
  infrastructureValue: ['Infrastructure_Value'],
  evacuationCentres: ['Evacuation_Centres'],
  healthFacilities: ['Health_Facilities', 'Health_Facilties'],
  schools: ['Schools'],
};

/** Totals from columns named by a pattern, e.g. `Exposed_{stem}` */
function totalsFrom(row: Row, ...patterns: Array<(stem: string) => string>): ExposureTotals {
  const totals = {} as ExposureTotals;
  for (const [measure, stems] of Object.entries(MEASURE_STEMS) as Array<
    [keyof ExposureTotals, string[]]
  >) {
    const names = stems.flatMap(stem => patterns.map(pattern => pattern(stem)));
    totals[measure] = num(field(row, ...names));
  }
  return totals;
}

function exposedTotals(row: Row): ExposureTotals {
  return totalsFrom(row, stem => `Exposed_${stem}`);
}

function bandTotals(row: Row): ExposureTotals {
  return totalsFrom(row, stem => stem);
}

/** One REF exposure row (a province, or an area council from the run's features) as an area */
export function toArea(row: Row, name: string): ExposureArea {
  return {
    name,
    overallWinds: text(row.Overall_Winds) || null,
    minWindKmph: optionalNum(row.Min_WindSpeed_kmph),
    maxWindKmph: optionalNum(row.Max_WindSpeed_kmph),
    exposed: exposedTotals(row),
    inFloodplains: totalsFrom(row, stem => `${stem}_in_Floodplains`),
    // "Buildings_In_Track_Uncertainty" is capitalised in REF's output
    inTrackUncertainty: totalsFrom(
      row,
      stem => `${stem}_in_Track_Uncertainty`,
      stem => `${stem}_In_Track_Uncertainty`
    ),
    total: totalsFrom(row, stem => `Total_${stem}`),
    totalPopulation: num(row.Total_Population),
    totalBuildings: num(row.Total_Buildings),
    populationInFloodplains: num(row.Population_in_Floodplains),
    populationInTrackUncertainty: num(row.Population_in_Track_Uncertainty),
  };
}

/** A REF exposure table: exposure columns and no loss columns */
export function isForecastExposureRow(row: Row | undefined | null): boolean {
  if (!row || typeof row !== 'object') return false;
  return (
    row.Exposed_Population !== undefined &&
    row.Total_Loss === undefined &&
    row.Population_Exposed_To_Any_Hazard === undefined
  );
}

/** REF labels the band beyond its furthest ring "Within km of track" in
 * some outputs and "200+ km away from track" in others */
export function normaliseTrackDistance(label: string): string {
  return /^within\s+km\b/i.test(label.trim()) ? 'Beyond 200 km of track' : label.trim();
}

/**
 * REF puts each asset in one ring, so a row is the band between the previous
 * ring and its own, not everyone within that distance. "Within 100km" read on
 * its own sounds cumulative, so name the range: "75–100 km from track".
 */
function trackDistanceBandLabel(
  band: { label: string; value?: number | null },
  previous?: { value?: number | null }
): string {
  if (band.value == null || previous?.value == null) return band.label;
  return `${previous.value}–${band.value} km from track`;
}

function toFacilities(collection: GeoJSON.FeatureCollection | null | undefined): ExposedFacility[] {
  const dangerRank = (danger: string | null) =>
    danger ? (WIND_DANGER_ORDER as readonly string[]).indexOf(danger) : -1;
  return (collection?.features ?? [])
    .map((feature, index): ExposedFacility | null => {
      const props = (feature.properties ?? {}) as Row;
      const asset = text(props['exposure.Asset']) || text(props.ClusterType) || text(props.Asset);
      if (!asset) return null;
      return {
        id: String(index),
        name: text(props['exposure.Details']) || text(props.Details) || asset,
        asset,
        useType: text(props['exposure.UseType']) || text(props.UseType),
        area: text(props.Region),
        danger: text(props.Danger) || null,
        windKmph: optionalNum(props.WindSpeed_kmph),
        trackDistance: normaliseTrackDistance(text(props.Track_distance)),
        inFloodplain: props.In_Floodplain === true || text(props.In_Floodplain) === 'true',
      };
    })
    .filter((facility): facility is ExposedFacility => facility !== null)
    .sort((a, b) => dangerRank(b.danger) - dangerRank(a.danger) || a.name.localeCompare(b.name));
}

export function buildForecastExposure(tables: {
  national: Row[];
  regional: Row[];
  byWindSpeed: Row[];
  byTrackDistance: Row[];
  facilities?: GeoJSON.FeatureCollection | null;
  windSwaths?: GeoJSON.FeatureCollection | null;
  trackDistance?: GeoJSON.FeatureCollection | null;
  cycloneTrack?: GeoJSON.FeatureCollection | null;
  /** The track linked to the event, used when the run kept no track of its own */
  eventTrack?: GeoJSON.FeatureCollection | null;
  floodplainRowId?: string | null;
}): ForecastExposure | null {
  const regionalRows = tables.regional.filter(isForecastExposureRow);
  const nationalRow = tables.national.find(isForecastExposureRow);
  if (!nationalRow && regionalRows.length === 0) return null;

  const regions = regionalRows
    // The blank-region row holds assets outside every province
    .filter(row => text(row.Region) !== '')
    .map(row => toArea(row, text(row.Region)))
    .sort((a, b) => b.exposed.population - a.exposed.population);

  const dangerRank = (label: string) => {
    const index = (WIND_DANGER_ORDER as readonly string[]).indexOf(label);
    return index === -1 ? -1 : index;
  };
  const byWindDanger = tables.byWindSpeed
    .filter(row => text(row.Danger))
    .map(row => ({
      label: text(row.Danger),
      value: optionalNum(row.WindSpeed),
      totals: bandTotals(row),
    }))
    .sort((a, b) => dangerRank(b.label) - dangerRank(a.label));

  const byTrackDistance = tables.byTrackDistance
    .filter(row => text(row.Track_distance))
    .map(row => ({
      label: normaliseTrackDistance(text(row.Track_distance)),
      value: optionalNum(row.km),
      totals: bandTotals(row),
    }))
    // Nearest first; the open-ended "200+ km" band has no km and goes last
    .sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity))
    .map((band, index, bands) => ({
      ...band,
      label: trackDistanceBandLabel(band, bands[index - 1]),
    }));

  return {
    national: nationalRow
      ? toArea(nationalRow, text(nationalRow.Region) || text(nationalRow.Country) || 'National')
      : null,
    regions,
    byWindDanger,
    byTrackDistance,
    facilities: toFacilities(tables.facilities),
    layers: {
      facilities: tables.facilities ?? null,
      windSwaths: tables.windSwaths ?? null,
      trackDistance: tables.trackDistance ?? null,
      cycloneTrack: tables.cycloneTrack ?? trackPointsToLine(tables.eventTrack),
      cycloneTrackSource: tables.cycloneTrack
        ? 'run'
        : trackPointsToLine(tables.eventTrack)
          ? 'event'
          : null,
      floodplainRowId: tables.floodplainRowId ?? null,
    },
  };
}

/** MapLibre fill colour for areas by their strongest forecast wind band */
export function windDangerColorExpression(): unknown[] {
  return [
    'match',
    ['coalesce', ['get', 'Overall_Winds'], ''],
    ...MAP_DANGER_NAMES.flatMap(danger => [danger, DANGER_COLORS[danger]]),
    windDangerColor(null),
  ];
}

/**
 * The area a map or table selection names: a province row, else an area
 * council from the run's regional-impacts features (matched by id or name).
 */
export function findExposureArea(
  exposure: ForecastExposure,
  features: GeoJSON.FeatureCollection | null | undefined,
  selection: string | null | undefined
): ExposureArea | null {
  if (!selection) return null;
  const wanted = selection.trim().toLowerCase();
  const region = exposure.regions.find(area => area.name.toLowerCase() === wanted);
  if (region) return region;
  for (const feature of features?.features ?? []) {
    const props = (feature.properties ?? {}) as Row;
    const id = String(props['Region.ID'] ?? props.Region_ID ?? '').toLowerCase();
    const name = text(props['Region.Region']) || text(props.Region);
    if (id === wanted || name.toLowerCase() === wanted) {
      return isForecastExposureRow(props) ? toArea(props, name || selection) : null;
    }
  }
  return null;
}

/**
 * A track delivered as points (an event's linked cyclone track) as one line,
 * so it can be drawn like the track REF keeps with a run. Null with fewer
 * than two points. A collection that already has line geometry is returned as is.
 */
export function trackPointsToLine(
  collection: GeoJSON.FeatureCollection | null | undefined
): GeoJSON.FeatureCollection | null {
  const features = collection?.features ?? [];
  if (
    features.some(f => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString')
  ) {
    return collection ?? null;
  }
  const coordinates = features
    .filter(f => f.geometry?.type === 'Point')
    .map(f => (f.geometry as GeoJSON.Point).coordinates as [number, number])
    .filter(c => Number.isFinite(c[0]) && Number.isFinite(c[1]));
  if (coordinates.length < 2) return null;
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }],
  };
}

/**
 * What to frame when a forecast opens: the forecast track if there is one,
 * else the wind swaths. The country's default view can sit well away from a
 * storm that is 100 km out, which reads as "no storm on the map".
 */
export function forecastFocusCollection(
  exposure: Pick<ForecastExposure, 'layers'>
): GeoJSON.FeatureCollection | null {
  const { cycloneTrack, windSwaths } = exposure.layers;
  if (cycloneTrack?.features?.length) return cycloneTrack;
  if (windSwaths?.features?.length) return windSwaths;
  return null;
}

/** The map features for one area, matched by id or name (case-insensitive). */
export function featuresForRegion(
  areaFeatures: GeoJSON.FeatureCollection | null | undefined,
  selectedRegion: string | null | undefined
): GeoJSON.FeatureCollection | null {
  const wanted = (selectedRegion ?? '').trim().toLowerCase();
  if (!wanted || !areaFeatures?.features?.length) return null;
  const features = areaFeatures.features.filter(feature => {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    return ['Region.ID', 'Region_ID', 'Region.Region', 'Region', 'region_name'].some(key => {
      const value = props[key];
      return (
        (typeof value === 'string' || typeof value === 'number') &&
        String(value).trim().toLowerCase() === wanted
      );
    });
  });
  return features.length > 0 ? { type: 'FeatureCollection', features } : null;
}
