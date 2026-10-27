/**
 * WGS84 UTM (EPSG 326xx north, 327xx south), in both directions.
 *
 * The hazard rasters are gridded in UTM metres. A map needs longitude and latitude for the corners of
 * the picture, and a click on the map needs the grid cell under it. These are the Krüger series
 * (the same maths `pyproj` uses), good to well under a millimetre inside a zone, so no projection
 * library is needed for one small raster.
 */

export interface UtmZone {
  zone: number;
  south: boolean;
}

const A = 6378137; // WGS84 semi-major axis, metres
const F = 1 / 298.257223563;
const K0 = 0.9996;
const FALSE_EASTING = 500000;
const FALSE_NORTHING_SOUTH = 10000000;

const N = F / (2 - F);
const N2 = N * N;
const N3 = N2 * N;
const N4 = N3 * N;
const RECTIFYING_RADIUS = (A / (1 + N)) * (1 + N2 / 4 + N4 / 64);
const BETA = [
  N / 2 - (2 * N2) / 3 + (37 * N3) / 96 - N4 / 360,
  N2 / 48 + N3 / 15 - (437 * N4) / 1440,
  (17 * N3) / 480 - (37 * N4) / 840,
  (4397 * N4) / 161280,
];
const ALPHA = [
  N / 2 - (2 * N2) / 3 + (5 * N3) / 16 + (41 * N4) / 180,
  (13 * N2) / 48 - (3 * N3) / 5 + (557 * N4) / 1440,
  (61 * N3) / 240 - (103 * N4) / 140,
  (49561 * N4) / 161280,
];
const DELTA = [
  2 * N - (2 * N2) / 3 - 2 * N3 + (116 * N4) / 45,
  (7 * N2) / 3 - (8 * N3) / 5 - (227 * N4) / 45,
  (56 * N3) / 15 - (136 * N4) / 35,
  (4279 * N4) / 630,
];

/** The UTM zone an EPSG code names: 32601-32660 are the northern zones, 32701-32760 the southern. */
export function utmZoneFromEpsg(epsg: number): UtmZone {
  if (epsg >= 32601 && epsg <= 32660) return { zone: epsg - 32600, south: false };
  if (epsg >= 32701 && epsg <= 32760) return { zone: epsg - 32700, south: true };
  throw new RangeError(`EPSG:${epsg} is not a WGS84 UTM zone (32601-32660 or 32701-32760)`);
}

/** Longitude and latitude, in degrees, of a point given in metres within a UTM zone. */
export function utmToLonLat(
  easting: number,
  northing: number,
  { zone, south }: UtmZone
): [number, number] {
  const xi = (northing - (south ? FALSE_NORTHING_SOUTH : 0)) / (K0 * RECTIFYING_RADIUS);
  const eta = (easting - FALSE_EASTING) / (K0 * RECTIFYING_RADIUS);

  let xiPrime = xi;
  let etaPrime = eta;
  for (let j = 1; j <= 4; j += 1) {
    xiPrime -= BETA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaPrime -= BETA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }

  const chi = Math.asin(Math.sin(xiPrime) / Math.cosh(etaPrime));
  let latitude = chi;
  for (let j = 1; j <= 4; j += 1) latitude += DELTA[j - 1] * Math.sin(2 * j * chi);

  const centralMeridian = (zone * 6 - 183) * (Math.PI / 180);
  const longitude = centralMeridian + Math.atan2(Math.sinh(etaPrime), Math.cos(xiPrime));
  return [(longitude * 180) / Math.PI, (latitude * 180) / Math.PI];
}

/** Metres within a UTM zone for a longitude and latitude in degrees (the inverse of `utmToLonLat`). */
export function lonLatToUtm(
  longitude: number,
  latitude: number,
  { zone, south }: UtmZone
): [number, number] {
  const phi = (latitude * Math.PI) / 180;
  const centralMeridian = (zone * 6 - 183) * (Math.PI / 180);
  const lambda = (longitude * Math.PI) / 180 - centralMeridian;

  const c = (2 * Math.sqrt(N)) / (1 + N);
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - c * Math.atanh(c * Math.sin(phi)));
  const xiPrime = Math.atan2(t, Math.cos(lambda));
  const etaPrime = Math.atanh(Math.sin(lambda) / Math.sqrt(1 + t * t));

  let xi = xiPrime;
  let eta = etaPrime;
  for (let j = 1; j <= 4; j += 1) {
    xi += ALPHA[j - 1] * Math.sin(2 * j * xiPrime) * Math.cosh(2 * j * etaPrime);
    eta += ALPHA[j - 1] * Math.cos(2 * j * xiPrime) * Math.sinh(2 * j * etaPrime);
  }
  return [
    FALSE_EASTING + K0 * RECTIFYING_RADIUS * eta,
    (south ? FALSE_NORTHING_SOUTH : 0) + K0 * RECTIFYING_RADIUS * xi,
  ];
}
