const LOCAL_DATA_ALIASES: Record<string, string> = {
  '/vanuatu/cyclone-track.geojson': 'cyclone-track (2).geojson',
  '/vanuatu/regional-impacts.geojson': 'regional-impacts (1).geojson',
  '/vanuatu/regional-impacts-by-sector.geojson': 'regional-impacts-by-sector (1).geojson',
  '/vanuatu/exposure-by-cluster.geojson': 'exposure-by-cluster (1).geojson',
  '/vanuatu/national-summary.csv': 'national-summary (1).csv',
  '/vanuatu/impact-by-asset-type.csv': 'impact-by-asset-type (1).csv',
  '/vanuatu/impact-by-sector.csv': 'impact-by-sector (1).csv',
  '/vanuatu/regional-summary.csv': 'regional-summary (1).csv',
  '/vanuatu/regional-summary-by-sector.csv': 'regional-summary-by-sector (1).csv',
};

export function resolveLocalDataAlias(url: string): string | null {
  const [pathname, query = ''] = url.split('?');
  const filename = LOCAL_DATA_ALIASES[pathname];

  if (!filename) {
    return null;
  }

  const apiPath = `/api/data/${encodeURIComponent(filename)}`;
  return query ? `${apiPath}?${query}` : apiPath;
}
