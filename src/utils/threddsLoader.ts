/**
 * THREDDS Data Server Loader
 * Utilities for fetching and parsing data from THREDDS catalogs
 */

import { CountryCode, THREDDS_CONFIG, CycloneTrack } from '@/types/thredds';

export interface THREDDSDataset {
  name: string;
  url: string;
  size: string;
  lastModified: string;
  type: 'nc' | 'tif' | 'csv' | 'unknown';
}

export interface THREDDSCatalogResponse {
  datasets: THREDDSDataset[];
  path: string;
}

/**
 * Parse THREDDS HTML catalog page to extract dataset information
 */
export async function fetchTHREDDSCatalog(
  countryCode: CountryCode,
  hazardType: string
): Promise<THREDDSCatalogResponse> {
  const catalogUrl = buildCatalogUrl(countryCode, hazardType);

  try {
    const response = await fetch(catalogUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch THREDDS catalog: ${response.statusText}`);
    }

    const html = await response.text();
    const datasets = parseHTMLCatalog(html);

    return {
      datasets,
      path: catalogUrl,
    };
  } catch (error) {
    console.error('Error fetching THREDDS catalog:', error);
    return {
      datasets: [],
      path: catalogUrl,
    };
  }
}

/**
 * Build THREDDS catalog URL for a specific country and hazard
 */
export function buildCatalogUrl(countryCode: CountryCode, hazardType: string): string {
  const countryMap: Record<CountryCode, string> = {
    VU: 'vu_hazard',
    WS: 'ws_hazard',
    TO: 'to_hazard',
    CK: 'ck_hazard',
  };

  const countryPath = countryMap[countryCode] || countryMap.VU;

  return `${THREDDS_CONFIG.baseUrl}/catalog${THREDDS_CONFIG.hazardPath}/${countryPath}/${hazardType}/catalog.html`;
}

/**
 * Build direct file access URL for a dataset
 */
export function buildFileUrl(
  countryCode: CountryCode,
  hazardType: string,
  filename: string
): string {
  const countryMap: Record<CountryCode, string> = {
    VU: 'vu_hazard',
    WS: 'ws_hazard',
    TO: 'to_hazard',
    CK: 'ck_hazard',
  };

  const countryPath = countryMap[countryCode] || countryMap.VU;

  return `${THREDDS_CONFIG.baseUrl}/fileServer${THREDDS_CONFIG.hazardPath}/${countryPath}/${hazardType}/${filename}`;
}

/**
 * Parse HTML catalog page to extract dataset information
 */
function parseHTMLCatalog(html: string): THREDDSDataset[] {
  const datasets: THREDDSDataset[] = [];

  // Use regex to parse the HTML table rows
  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRegex) || [];

  for (const row of rows) {
    // Skip header rows
    if (row.includes('<th') || row.includes('Parent Directory')) {
      continue;
    }

    // Extract dataset name (filename)
    const nameMatch = row.match(/<a[^>]*>([^<]+)<\/a>/);
    const name = nameMatch ? nameMatch[1].trim() : null;

    if (!name || name === '../') {
      continue;
    }

    // Extract size
    const sizeMatch = row.match(/<td[^>]*align="right"[^>]*>([^<]+)<\/td>/);
    const size = sizeMatch ? sizeMatch[1].trim() : 'Unknown';

    // Extract last modified date
    const dateMatch = row.match(/<td[^>]*>(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^<]*)<\/td>/);
    const lastModified = dateMatch ? dateMatch[1].trim() : 'Unknown';

    // Determine file type
    const extension = name.split('.').pop()?.toLowerCase() || '';
    let type: THREDDSDataset['type'] = 'unknown';
    if (extension === 'nc') type = 'nc';
    else if (extension === 'tif' || extension === 'tiff') type = 'tif';
    else if (extension === 'csv') type = 'csv';

    datasets.push({
      name,
      url: name, // Relative URL, will be combined with base
      size,
      lastModified,
      type,
    });
  }

  return datasets;
}

/**
 * Fetch and parse CSV cyclone track data
 */
export async function fetchCycloneTrack(
  countryCode: CountryCode,
  filename: string
): Promise<CycloneTrack | null> {
  const url = buildFileUrl(countryCode, 'TC/Lola', filename);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch cyclone track: ${response.statusText}`);
    }

    const csvText = await response.text();
    return parseCSVTrack(csvText);
  } catch (error) {
    console.error('Error fetching cyclone track:', error);
    return null;
  }
}

/**
 * Parse CSV cyclone track data into GeoJSON format
 */
function parseCSVTrack(csvText: string): CycloneTrack {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  const coordinates: number[][] = [];
  const features = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');

    if (values.length < 2) continue;

    // Assuming CSV has lat,lon columns (adjust based on actual format)
    const lon = parseFloat(values[1]);
    const lat = parseFloat(values[0]);

    if (!isNaN(lon) && !isNaN(lat)) {
      coordinates.push([lon, lat]);
    }
  }

  if (coordinates.length > 0) {
    features.push({
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates,
      },
      properties: {
        name: 'TC Lola',
        intensity: 'Category 5',
        date: '2024',
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Fetch NetCDF metadata (requires OPeNDAP or separate metadata endpoint)
 */
export async function fetchNetCDFMetadata(url: string): Promise<any> {
  try {
    // THREDDS provides various services - we can use OPeNDAP or WMS endpoints
    const metadataUrl = url.replace('/fileServer/', '/dodsC/') + '.das';

    const response = await fetch(metadataUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch NetCDF metadata: ${response.statusText}`);
    }

    const dasText = await response.text();
    return parseDAS(dasText);
  } catch (error) {
    console.error('Error fetching NetCDF metadata:', error);
    return null;
  }
}

/**
 * Parse DAS (Data Attribute Structure) format
 */
function parseDAS(dasText: string): any {
  // Basic parsing of DAS format
  const metadata: any = {};

  const lines = dasText.split('\n');
  let currentVar = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.includes('{')) {
      const varName = trimmed.split('{')[0].trim();
      currentVar = varName;
      metadata[currentVar] = {};
    } else if (trimmed.includes('}')) {
      currentVar = null;
    } else if (currentVar && trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim().replace(/;$/, '');
      metadata[currentVar][key.trim()] = value;
    }
  }

  return metadata;
}

/**
 * Get WMS GetMap URL for displaying NetCDF data as map layer
 */
export function buildWMSUrl(
  countryCode: CountryCode,
  hazardType: string,
  filename: string,
  layer: string,
  bbox: [number, number, number, number],
  width: number = 512,
  height: number = 512
): string {
  const countryMap: Record<CountryCode, string> = {
    VU: 'vu_hazard',
    WS: 'ws_hazard',
    TO: 'to_hazard',
    CK: 'ck_hazard',
  };

  const countryPath = countryMap[countryCode] || countryMap.VU;
  const datasetPath = `${THREDDS_CONFIG.hazardPath}/${countryPath}/${hazardType}/${filename}`;

  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: layer,
    CRS: 'EPSG:4326',
    BBOX: bbox.join(','),
    WIDTH: width.toString(),
    HEIGHT: height.toString(),
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    STYLES: '',
  });

  return `${THREDDS_CONFIG.baseUrl}/wms${datasetPath}?${params.toString()}`;
}

/**
 * List available hazard types for a country
 */
export const AVAILABLE_HAZARDS: Record<CountryCode, string[]> = {
  VU: ['TC/Lola', 'flood', 'volcanic', 'earthquake'],
  WS: ['TC', 'flood', 'tsunami'],
  TO: ['TC', 'volcanic', 'tsunami'],
  CK: ['TC', 'drought'],
};

/**
 * Get THREDDS catalog for Vanuatu TC Lola specifically
 */
export async function fetchVanuatuTCLolaCatalog(): Promise<THREDDSCatalogResponse> {
  return fetchTHREDDSCatalog('VU', 'TC/Lola');
}
