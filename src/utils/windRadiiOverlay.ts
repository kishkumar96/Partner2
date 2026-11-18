import { buildWindRadiusRing, offsetLatLon } from '@/utils/forecastCone';

/**
 * Wind-radius rings for one moment of a forecast track, for the forecast map.
 *
 * An advisory gives, for each point, how far 34 kt (gale), 48 kt (storm) and 64 kt (hurricane) winds
 * reach in the NE, SE, SW and NW quadrants. Each value is the farthest the wind reaches within that
 * 90° sector, not a measurement at its middle, so the faithful drawing is the sector as issued: an arc
 * of that radius across the quadrant. `smooth` blends neighbouring quadrants into one rounded outline
 * for readability, and can show wind reaching places the advisory does not claim.
 *
 * Points whose feed gave no radii get an estimate from their wind speed in the loader, always a circle.
 * Those are not drawn here at all: an invented circle on a forecast map reads as data.
 */

export type WindRadiusKind = 'gale' | 'storm' | 'hurricane';
export type WindRadiiShape = 'sector' | 'smooth';

export interface WindRadiiPoint {
  time: Date;
  latitude: number;
  longitude: number;
  galeRadiusNE?: number;
  galeRadiusSE?: number;
  galeRadiusSW?: number;
  galeRadiusNW?: number;
  stormRadiusNE?: number;
  stormRadiusSE?: number;
  stormRadiusSW?: number;
  stormRadiusNW?: number;
  hurricaneRadiusNE?: number;
  hurricaneRadiusSE?: number;
  hurricaneRadiusSW?: number;
  hurricaneRadiusNW?: number;
  radiiReported?: boolean;
}

export interface WindRadiusProperties {
  kind: WindRadiusKind;
  /** "34 kt" */
  threshold: string;
  /** The instant of the advisory point, ISO 8601 */
  at: string;
  /** Radii in nautical miles */
  ne: number;
  se: number;
  sw: number;
  nw: number;
}

export type WindRadiusCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon, WindRadiusProperties>;

export const WIND_RADIUS_THRESHOLDS: Record<WindRadiusKind, string> = {
  gale: '34 kt',
  storm: '48 kt',
  hurricane: '64 kt',
};

const KINDS: readonly WindRadiusKind[] = ['gale', 'storm', 'hurricane'];
const KM_PER_NM = 1.852;
/** Arc vertices per 90° sector: enough to look round at any zoom a country is viewed at */
const SECTOR_SEGMENTS = 18;

function quadrants(point: WindRadiiPoint, kind: WindRadiusKind): [number, number, number, number] {
  const n = (value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
  if (kind === 'gale') {
    return [
      n(point.galeRadiusNE),
      n(point.galeRadiusSE),
      n(point.galeRadiusSW),
      n(point.galeRadiusNW),
    ];
  }
  if (kind === 'storm') {
    return [
      n(point.stormRadiusNE),
      n(point.stormRadiusSE),
      n(point.stormRadiusSW),
      n(point.stormRadiusNW),
    ];
  }
  return [
    n(point.hurricaneRadiusNE),
    n(point.hurricaneRadiusSE),
    n(point.hurricaneRadiusSW),
    n(point.hurricaneRadiusNW),
  ];
}

/** Whether the point has radii of its own (not the loader's estimate) for at least one threshold */
export function hasReportedRadii(point: WindRadiiPoint): boolean {
  return (
    point.radiiReported !== false &&
    point.time instanceof Date &&
    Number.isFinite(point.time.getTime()) &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    KINDS.some(kind => quadrants(point, kind).some(r => r > 0))
  );
}

/** The points that can be drawn, in time order: these are the steps of the time control */
export function windRadiiSteps(
  points: readonly WindRadiiPoint[] | null | undefined
): WindRadiiPoint[] {
  return (points ?? [])
    .filter(hasReportedRadii)
    .sort((a, b) => a.time.getTime() - b.time.getTime());
}

/**
 * The ring of the four sectors as issued: for each quadrant an arc at that quadrant's radius, so the
 * outline steps outward or inward along a radial line at NE/SE/SW/NW's shared bearings (090, 180, 270, 000).
 */
function sectorRing(
  center: [number, number],
  [ne, se, sw, nw]: [number, number, number, number]
): [number, number][] {
  const ring: [number, number][] = [];
  [ne, se, sw, nw].forEach((radiusNm, quadrant) => {
    for (let i = 0; i <= SECTOR_SEGMENTS; i++) {
      const bearing = quadrant * 90 + (i / SECTOR_SEGMENTS) * 90;
      ring.push(
        radiusNm > 0
          ? offsetLatLon(center[0], center[1], bearing, radiusNm * KM_PER_NM)
          : [center[0], center[1]]
      );
    }
  });
  ring.push(ring[0]);
  return ring;
}

/** One polygon per wind threshold at this point, outermost (gale) first so smaller rings draw on top. */
export function buildWindRadiiAt(
  point: WindRadiiPoint | null | undefined,
  shape: WindRadiiShape = 'sector'
): WindRadiusCollection | null {
  if (!point || !hasReportedRadii(point)) return null;
  const features: GeoJSON.Feature<GeoJSON.Polygon, WindRadiusProperties>[] = [];
  for (const kind of KINDS) {
    const q = quadrants(point, kind);
    if (!q.some(r => r > 0)) continue;
    const center: [number, number] = [point.longitude, point.latitude];
    const ring = shape === 'smooth' ? buildWindRadiusRing(center, ...q, 72) : sectorRing(center, q);
    if (ring.length < 4) continue;
    features.push({
      type: 'Feature',
      properties: {
        kind,
        threshold: WIND_RADIUS_THRESHOLDS[kind],
        at: point.time.toISOString(),
        ne: q[0],
        se: q[1],
        sw: q[2],
        nw: q[3],
      },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
  }
  return features.length > 0 ? { type: 'FeatureCollection', features } : null;
}

/** "20 Nov 06:00 UTC" for a step of the time control; `timeZone` is an IANA name, or null for UTC */
export function windRadiiStepLabel(time: Date, timeZone: string | null, zoneName: string): string {
  try {
    const text = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone ?? 'UTC',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(time);
    return `${text.replace(',', '')} ${zoneName}`;
  } catch {
    return time.toISOString();
  }
}
