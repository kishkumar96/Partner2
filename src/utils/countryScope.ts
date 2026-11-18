/**
 * Keeping a country's dashboard to that country's own data.
 *
 * A Rapid Exposure Forecast run is a storm's whole footprint, so a Cook Islands run also carries Samoa's
 * districts and Tonga's islands (a track uncertainty cone that reaches them). The tables say so in a
 * `Country` column (the map layers in `Region.Country`). Left in, Samoan villages become "areas to prepare"
 * in a Cook Islands brief, Samoa's 201,000 people sit in the wind table, and the CSV mixes countries. That is
 * wrong for the officer and a diplomatic risk for a regional platform, so the dashboard keeps only its own.
 *
 * Rows with no country column (older runs, country-specific files) are kept: no column is not a neighbour.
 * If scoping would empty a table (the name does not match any row) the table is left whole, so a spelling
 * mismatch shows too much rather than a blank dashboard.
 */

type Row = Record<string, unknown>;

/** The country a table row or map feature belongs to, or '' when it does not say */
export function rowCountry(row: Row | null | undefined): string {
  const value = row?.Country ?? row?.['Region.Country'] ?? row?.country;
  return typeof value === 'string' ? value.trim() : '';
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The rows of one country, and the other countries the table names */
export function scopeRows<T>(
  rows: readonly T[],
  countryName: string,
  countryOf: (row: T) => string
): { rows: T[]; others: string[] } {
  const kept: T[] = [];
  const others = new Set<string>();
  for (const row of rows) {
    const country = countryOf(row);
    if (!country || same(country, countryName)) kept.push(row);
    else others.add(country);
  }
  // Nothing matched the name: keep the table whole rather than blank it
  if (kept.length === 0 && rows.length > 0 && !rows.some(row => !countryOf(row))) {
    return { rows: [...rows], others: [] };
  }
  return { rows: kept, others: [...others].sort() };
}

/**
 * The national table has one row per country, named in `Region` ("Cook Islands", "Samoa", "Tonga"). Keep the
 * dashboard country's row; the others are neighbours.
 */
export function scopeNationalRows<T extends Row>(rows: readonly T[], countryName: string) {
  return scopeRows(rows, countryName, row => {
    const named = rowCountry(row);
    if (named) return named;
    return typeof row.Region === 'string' ? row.Region.trim() : '';
  });
}

/** The features of one country in a map layer, and the other countries it names */
export function scopeFeatures<G extends GeoJSON.Geometry | null>(
  collection: GeoJSON.FeatureCollection<G> | null,
  countryName: string
): { collection: GeoJSON.FeatureCollection<G> | null; others: string[] } {
  if (!collection || !Array.isArray(collection.features)) return { collection, others: [] };
  const { rows, others } = scopeRows(collection.features, countryName, feature =>
    rowCountry((feature.properties ?? {}) as Row)
  );
  if (rows.length === collection.features.length) return { collection, others };
  return { collection: { ...collection, features: rows }, others };
}

/** The parts of a loaded risk bundle that carry other countries' rows */
export interface CountryScopable {
  regionalImpacts: GeoJSON.FeatureCollection | null;
  regionalImpactsBySector: GeoJSON.FeatureCollection | null;
  exposureByCluster: GeoJSON.FeatureCollection | null;
  regionalSummary: Row[];
  regionalSummaryBySector: Row[];
  forecastNational: Row[];
  forecastByWindSpeed: Row[];
  forecastByTrackDistance: Row[];
}

/**
 * The bundle with every table and map layer cut to `countryName`, plus the names of the neighbouring
 * countries the run also covers (for a note saying what is not shown).
 */
export function scopeBundleToCountry<T extends CountryScopable>(
  bundle: T,
  countryName: string | null | undefined
): T & { neighbouringCountries: string[] } {
  if (!countryName) return { ...bundle, neighbouringCountries: [] };
  const others = new Set<string>();
  const rowsOf = (rows: Row[]) => {
    const scoped = scopeRows(rows, countryName, rowCountry);
    scoped.others.forEach(name => others.add(name));
    return scoped.rows;
  };
  const featuresOf = (collection: GeoJSON.FeatureCollection | null) => {
    const scoped = scopeFeatures(collection, countryName);
    scoped.others.forEach(name => others.add(name));
    return scoped.collection;
  };
  const national = scopeNationalRows(bundle.forecastNational, countryName);
  national.others.forEach(name => others.add(name));
  return {
    ...bundle,
    regionalImpacts: featuresOf(bundle.regionalImpacts),
    regionalImpactsBySector: featuresOf(bundle.regionalImpactsBySector),
    exposureByCluster: featuresOf(bundle.exposureByCluster),
    regionalSummary: rowsOf(bundle.regionalSummary),
    regionalSummaryBySector: rowsOf(bundle.regionalSummaryBySector),
    forecastNational: national.rows,
    forecastByWindSpeed: rowsOf(bundle.forecastByWindSpeed),
    forecastByTrackDistance: rowsOf(bundle.forecastByTrackDistance),
    neighbouringCountries: [...others].filter(name => !same(name, countryName)).sort(),
  };
}
