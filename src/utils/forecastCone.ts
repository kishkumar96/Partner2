/**
 * Cyclone track geometry utilities.
 */

import { CycloneForecastPoint } from './cycloneAnimationLoader';

// ---------------------------------------------------------------------------
// Geographic helpers
// ---------------------------------------------------------------------------

/** Mean Earth radius in kilometres (WGS-84 volumetric mean). */
const EARTH_RADIUS_KM = 6371;

/**
 * Offset a (lon, lat) point by a compass bearing and distance (km).
 * Uses the spherical-Earth forward-azimuth formula; accurate at any latitude
 * — replaces the flat equirectangular approximation that distorted ring shapes
 * away from the equator.
 */
function offsetLatLon(
  lon: number,
  lat: number,
  bearingDeg: number,
  distKm: number
): [number, number] {
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const θ = (bearingDeg * Math.PI) / 180;
  const δ = distKm / EARTH_RADIUS_KM;
  const sinφ1 = Math.sin(φ1),
    cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ),
    cosδ = Math.cos(δ);
  const φ2 = Math.asin(sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * sinδ * cosφ1, cosδ - sinφ1 * Math.sin(φ2));
  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI];
}

// ---------------------------------------------------------------------------
// Per-bearing ring radius helper
// ---------------------------------------------------------------------------

/**
 * Smooth cosine blend between quadrant-centre values (NE=45°, SE=135°, SW=225°,
 * NW=315°).  Replaces the old step function that produced flat 90°-arc edges.
 */
function ringRadiusAtBearingSmooth(
  ne: number,
  se: number,
  sw: number,
  nw: number,
  bearingDeg: number
): number {
  const b = ((bearingDeg % 360) + 360) % 360;
  const r = [
    Math.max(0, ne || 0), // index 0 — NE centre at 45°
    Math.max(0, se || 0), // index 1 — SE centre at 135°
    Math.max(0, sw || 0), // index 2 — SW centre at 225°
    Math.max(0, nw || 0), // index 3 — NW centre at 315°
  ];
  // Shift so that index-0 (NE, 45°) starts the range; each quadrant spans 90°.
  const shifted = (b - 45 + 360) % 360;
  const fq = shifted / 90;
  const lo = Math.floor(fq) % 4;
  const hi = (lo + 1) % 4;
  const t = fq - Math.floor(fq);
  const tc = (1 - Math.cos(t * Math.PI)) / 2; // cosine ease-in-out
  return r[lo] + (r[hi] - r[lo]) * tc;
}

// ---------------------------------------------------------------------------
// Local ENU projection helper (dateline-safe, metric-correct support scoring)
// ---------------------------------------------------------------------------

/**
 * Project raw (lon, lat) ring points onto a local equirectangular tangent
 * plane anchored at (lon0, lat0), returning metric ENU coordinates in meters.
 *
 * Longitudes are unwrapped around lon0 before projection, making the result
 * dateline-safe for tracks that cross ±180°.
 */
function toLocalENU(points: [number, number][], lon0: number, lat0: number): [number, number][] {
  const earthRadiusM = EARTH_RADIUS_KM * 1000;
  const cosLat0 = Math.cos((lat0 * Math.PI) / 180);
  return points.map(([lon, lat]) => {
    const dLon = ((lon - lon0 + 540) % 360) - 180; // unwrap to ±180 of anchor
    const dLonRad = (dLon * Math.PI) / 180;
    const dLatRad = ((lat - lat0) * Math.PI) / 180;
    return [earthRadiusM * dLonRad * cosLat0, earthRadiusM * dLatRad] as [number, number];
  });
}

/**
 * Unwrap a longitude sequence so no two adjacent values differ by more
 * than 180°.  Prevents antimeridian jumps (e.g. 179° → -179°) from
 * splitting rings built from different track positions into separate
 * longitude "sheets" and producing globe-spanning polygon artifacts.
 * Returns a new array — originals are not mutated.
 */
function unwrapLons(lons: number[]): number[] {
  if (lons.length < 2) return [...lons];
  const result = [lons[0]];
  for (let i = 1; i < lons.length; i++) {
    const diff = lons[i] - result[i - 1];
    if (diff > 180) result.push(lons[i] - 360);
    else if (diff < -180) result.push(lons[i] + 360);
    else result.push(lons[i]);
  }
  return result;
}

/** Normalize longitude difference to the principal range [-180, 180]. */
function normalizeDeltaLonDeg(deltaLon: number): number {
  return ((deltaLon + 540) % 360) - 180;
}

// ---------------------------------------------------------------------------
// Wind-radius envelope (single clean polygon per wind type)
// ---------------------------------------------------------------------------

export type WindType = 'gale' | 'storm' | 'hurricane';

/**
 * Build one asymmetric wind-radius ring (closed coordinate array) centred on
 * `center`, using separate radii (nautical miles) for each quadrant.
 * Returns an empty array when all radii are zero/NaN.
 */
export function buildWindRadiusRing(
  center: [number, number],
  radiusNE: number,
  radiusSE: number,
  radiusSW: number,
  radiusNW: number,
  segments = 288 // 1.25° per point — smooth curves without excess vertex count
): [number, number][] {
  if ([radiusNE, radiusSE, radiusSW, radiusNW].every(r => !r || r <= 0)) return [];

  const points: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const bearingDeg = (i / segments) * 360;
    const radiusNM = ringRadiusAtBearingSmooth(radiusNE, radiusSE, radiusSW, radiusNW, bearingDeg);
    const radiusKm = radiusNM * 1.852;
    points.push(
      radiusKm > 0
        ? offsetLatLon(center[0], center[1], bearingDeg, radiusKm)
        : [center[0], center[1]]
    );
  }
  if (points.length > 0) points.push(points[0]);
  return points;
}

/**
 * Generate the outer wind-swath envelope for a given wind type across all
 * forecast timesteps.
 *
 * Algorithm — support-function outer boundary:
 *   For each compass bearing (0°–359° at 1° resolution), find the ring whose
 *   boundary point extends farthest in that direction.  Connecting those 360
 *   "winner" points in bearing order traces the exact outer boundary of the
 *   union of all per-timestep wind rings — every vertex lies on an actual
 *   forecast ring (not a geometric approximation), and the result is smooth
 *   without convex-hull angular artefacts.
 */
export function generateWindEnvelope(
  forecastPoints: CycloneForecastPoint[],
  windType: WindType
): GeoJSON.Feature<GeoJSON.Polygon> | null {
  const getRadii = (pt: CycloneForecastPoint): [number, number, number, number] => {
    if (windType === 'gale')
      return [pt.galeRadiusNE, pt.galeRadiusSE, pt.galeRadiusSW, pt.galeRadiusNW];
    if (windType === 'storm')
      return [pt.stormRadiusNE, pt.stormRadiusSE, pt.stormRadiusSW, pt.stormRadiusNW];
    return [pt.hurricaneRadiusNE, pt.hurricaneRadiusSE, pt.hurricaneRadiusSW, pt.hurricaneRadiusNW];
  };

  const pts = forecastPoints.filter(pt => getRadii(pt).some(r => r > 0));
  if (pts.length === 0) return null;

  // Single point — fall back to the ring polygon directly.
  if (pts.length === 1) {
    const [ne, se, sw, nw] = getRadii(pts[0]);
    const ring = buildWindRadiusRing([pts[0].longitude, pts[0].latitude], ne, se, sw, nw);
    if (ring.length < 4) return null;
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { windType },
    };
  }

  // Collect actual smooth ring boundary points for all forecast positions.
  // Using real ring points (rather than recomputing from a coarse quadrant lookup)
  // ensures the support function finds the true outermost point at each bearing.
  const RING_SEGS = 144; // 2.5° resolution — accurate without excess vertices
  const BEARING_STEPS = 720; // 0.5° bearing resolution
  // Unwrap center longitudes so rings from all filtered track positions share
  // the same longitude "sheet".  Without this, a track that crosses the
  // antimeridian (e.g. centers at +179° and -179°) would produce rings whose
  // longitudes live on opposite numeric sides of ±180°, making the ENU
  // centroid anchor land ~180° away from the actual storm and corrupting
  // the support-function argmax → globe-spanning envelope artifact.
  const centerLons = unwrapLons(pts.map(p => p.longitude));
  const allPoints: [number, number][] = [];
  for (let pi = 0; pi < pts.length; pi++) {
    const [ne, se, sw, nw] = getRadii(pts[pi]);
    const ring = buildWindRadiusRing([centerLons[pi], pts[pi].latitude], ne, se, sw, nw, RING_SEGS);
    allPoints.push(...ring.slice(0, -1)); // skip repeated closing point
  }
  if (allPoints.length === 0) return null;

  // Project all ring points to a local ENU tangent plane so that the support
  // function scores distances in metric space — eliminating longitude shrinkage
  // bias at non-equatorial latitudes (e.g. Southern Pacific storms).
  // We also unwrap longitudes around the anchor so tracks crossing ±180° work.
  const lat0 = allPoints.reduce((s, p) => s + p[1], 0) / allPoints.length;
  const lon0 = allPoints.reduce((s, p) => s + p[0], 0) / allPoints.length;
  const enuPoints = toLocalENU(allPoints, lon0, lat0);

  // Support-function outer boundary: for each bearing direction, find the
  // actual ring point that projects farthest in that direction (in ENU space).
  const coords: [number, number][] = [];
  for (let i = 0; i < BEARING_STEPS; i++) {
    const bRad = (i / BEARING_STEPS) * 2 * Math.PI;
    const sinB = Math.sin(bRad);
    const cosB = Math.cos(bRad);
    let maxScore = -Infinity;
    let bestIdx = -1;
    for (let j = 0; j < enuPoints.length; j++) {
      const score = enuPoints[j][0] * sinB + enuPoints[j][1] * cosB;
      if (score > maxScore) {
        maxScore = score;
        bestIdx = j;
      }
    }
    if (bestIdx >= 0) coords.push(allPoints[bestIdx]); // keep original lon/lat
  }

  if (coords.length < 3) return null;
  coords.push(coords[0]); // close

  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: { windType },
  };
}

/**
 * Pre-compute a smooth cumulative wind-swath envelope for every forecast frame.
 *
 * Incrementally accumulates wind-radius ring points as frames advance.  For
 * each frame f the support-function outer boundary is recalculated over ALL
 * ring points from frames 0 … f, producing a single, seam-free polygon that
 * smoothly grows with the animation — no stacking artefacts, no visible joins.
 *
 * **Complexity**: O(F × R × B) — linear in frame count.
 * The previous implementation re-projected and re-scanned all accumulated
 * ring points from scratch every frame, giving O(F² × R × B).  The optimised
 * version keeps per-bearing "champion" state and only processes the *new* ring
 * added at each frame, reducing the per-frame work to O(R × B).  A fixed ENU
 * anchor (computed once from the overall track centroid) keeps ENU coordinates
 * stable so the incremental max is always comparable across frames — no need
 * to re-project old points when the anchor would otherwise shift.
 *
 * @returns Array of length forecastPoints.length.  Entry f is a closed
 *   coordinate ring for the OUTER boundary of the cumulative union (no hole).
 *   Returns null for frames where no valid radii exist yet.
 */
export function buildCumulativeWindEnvelopes(
  forecastPoints: CycloneForecastPoint[],
  windType: WindType,
  ringSegs = 72, // ring vertices per forecast position (still well-resolved)
  bearingSteps = 360 // outer-boundary angular resolution
): Array<[number, number][] | null> {
  const getRadii = (pt: CycloneForecastPoint): [number, number, number, number] => {
    if (windType === 'gale')
      return [pt.galeRadiusNE, pt.galeRadiusSE, pt.galeRadiusSW, pt.galeRadiusNW];
    if (windType === 'storm')
      return [pt.stormRadiusNE, pt.stormRadiusSE, pt.stormRadiusSW, pt.stormRadiusNW];
    return [pt.hurricaneRadiusNE, pt.hurricaneRadiusSE, pt.hurricaneRadiusSW, pt.hurricaneRadiusNW];
  };

  // Unwrap center longitudes for the whole track before generating any rings.
  // This ensures rings from all frames share the same longitude "sheet",
  // preventing dateline-crossing tracks from producing globe-spanning artifacts.
  const centerLons = unwrapLons(forecastPoints.map(p => p.longitude));

  // ----- Fixed ENU anchor (computed once) ------------------------------------
  // Using a single stable anchor means ENU coordinates for all ring points are
  // comparable across frames, making incremental per-bearing champion tracking
  // correct.  The anchor is the centroid of ALL track centers; since the track
  // is typically <3000 km long, projection error at the edges is negligible for
  // an argmax that only needs relative ordering.
  const lon0 = centerLons.reduce((s, l) => s + l, 0) / centerLons.length;
  const lat0 = forecastPoints.reduce((s, p) => s + p.latitude, 0) / forecastPoints.length;
  const cosLat0 = Math.cos((lat0 * Math.PI) / 180);

  // Pre-compute sin/cos for all bearings once — avoids F × R trig calls.
  const sinB = new Float64Array(bearingSteps);
  const cosB = new Float64Array(bearingSteps);
  for (let i = 0; i < bearingSteps; i++) {
    const bRad = (i / bearingSteps) * 2 * Math.PI;
    sinB[i] = Math.sin(bRad);
    cosB[i] = Math.cos(bRad);
  }

  // Per-bearing champion state — updated incrementally each frame.
  // champScore[b] = highest ENU projection score seen so far in direction b.
  // champIdx[b]   = index into accumulated[] of the current winner.
  const champScore = new Float64Array(bearingSteps).fill(-Infinity);
  const champIdx = new Int32Array(bearingSteps).fill(-1);

  const accumulated: [number, number][] = [];
  const results: Array<[number, number][] | null> = [];
  let hasAny = false;

  for (let f = 0; f < forecastPoints.length; f++) {
    const [ne, se, sw, nw] = getRadii(forecastPoints[f]);

    if ([ne, se, sw, nw].some(r => r > 0)) {
      const ring = buildWindRadiusRing(
        [centerLons[f], forecastPoints[f].latitude],
        ne,
        se,
        sw,
        nw,
        ringSegs
      );
      const newPts = ring.slice(0, -1); // skip duplicate closing vertex
      const base = accumulated.length;
      accumulated.push(...newPts);
      hasAny = true;

      // Project only the NEW ring's points to ENU meters and update per-bearing
      // champions.  All previously accumulated points already have their
      // champions recorded — we never need to revisit them.
      const earthRadiusM = EARTH_RADIUS_KM * 1000;
      for (let j = 0; j < newPts.length; j++) {
        const dLonRad = (normalizeDeltaLonDeg(newPts[j][0] - lon0) * Math.PI) / 180;
        const dLatRad = ((newPts[j][1] - lat0) * Math.PI) / 180;
        const x = earthRadiusM * dLonRad * cosLat0;
        const y = earthRadiusM * dLatRad;
        const idx = base + j;
        for (let b = 0; b < bearingSteps; b++) {
          const score = x * sinB[b] + y * cosB[b];
          if (score > champScore[b]) {
            champScore[b] = score;
            champIdx[b] = idx;
          }
        }
      }
    }

    if (!hasAny || accumulated.length < 3) {
      results.push(null);
      continue;
    }

    // Assemble this frame's envelope ring from the current per-bearing winners.
    const coords: [number, number][] = [];
    for (let b = 0; b < bearingSteps; b++) {
      if (champIdx[b] >= 0) coords.push(accumulated[champIdx[b]]);
    }

    if (coords.length < 3) {
      results.push(null);
      continue;
    }
    coords.push(coords[0]); // close polygon
    results.push(coords);
  }

  return results;
}

// Keep legacy per-timestep swath for any future use
export function generateWindSwath(
  forecastPoints: CycloneForecastPoint[],
  windType: WindType
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  for (const pt of forecastPoints) {
    let ne: number, se: number, sw: number, nw: number;
    if (windType === 'gale') {
      ({ galeRadiusNE: ne, galeRadiusSE: se, galeRadiusSW: sw, galeRadiusNW: nw } = pt);
    } else if (windType === 'storm') {
      ({ stormRadiusNE: ne, stormRadiusSE: se, stormRadiusSW: sw, stormRadiusNW: nw } = pt);
    } else {
      ({
        hurricaneRadiusNE: ne,
        hurricaneRadiusSE: se,
        hurricaneRadiusSW: sw,
        hurricaneRadiusNW: nw,
      } = pt);
    }
    const ring = buildWindRadiusRing([pt.longitude, pt.latitude], ne, se, sw, nw);
    if (ring.length < 4) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { time: pt.timeString, windType },
    });
  }
  return { type: 'FeatureCollection', features };
}

export interface ForecastConeGeometry {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    };
    properties: {
      time: string;
      uncertainty: number;
    };
  }[];
}

/**
 * Generate forecast cone polygon based on track uncertainty
 * Uses the uncertainty field (in km) to create expanding cone
 */
export function generateForecastCone(forecastPoints: CycloneForecastPoint[]): ForecastConeGeometry {
  if (!forecastPoints || forecastPoints.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }

  const features: ForecastConeGeometry['features'] = [];

  // Unwrap center longitudes so consecutive trapezoid segments stay
  // continuous across the antimeridian (e.g. 179° → 181° not 179° → -179°).
  const centerLons = unwrapLons(forecastPoints.map(p => p.longitude));

  // Generate cone segments between consecutive points
  for (let i = 0; i < forecastPoints.length - 1; i++) {
    const point = forecastPoints[i];
    const nextPoint = forecastPoints[i + 1];
    const cLon = centerLons[i];
    const nLon = centerLons[i + 1];

    // Uncertainty in km - convert to degrees (rough approximation: 1° ≈ 111km)
    const uncertaintyDeg = point.uncertainty / 111;
    const nextUncertaintyDeg = nextPoint.uncertainty / 111;

    // Create cone segment (trapezoid shape)
    const leftOffset = calculatePerpendicularOffset(
      cLon,
      point.latitude,
      nLon,
      nextPoint.latitude,
      -uncertaintyDeg
    );

    const rightOffset = calculatePerpendicularOffset(
      cLon,
      point.latitude,
      nLon,
      nextPoint.latitude,
      uncertaintyDeg
    );

    const nextLeftOffset = calculatePerpendicularOffset(
      cLon,
      point.latitude,
      nLon,
      nextPoint.latitude,
      -nextUncertaintyDeg
    );

    const nextRightOffset = calculatePerpendicularOffset(
      cLon,
      point.latitude,
      nLon,
      nextPoint.latitude,
      nextUncertaintyDeg
    );

    // Create polygon coordinates (trapezoid)
    const coordinates = [
      [
        [cLon + leftOffset[0], point.latitude + leftOffset[1]],
        [cLon + rightOffset[0], point.latitude + rightOffset[1]],
        [nLon + nextRightOffset[0], nextPoint.latitude + nextRightOffset[1]],
        [nLon + nextLeftOffset[0], nextPoint.latitude + nextLeftOffset[1]],
        [cLon + leftOffset[0], point.latitude + leftOffset[1]], // Close the polygon
      ],
    ];

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates,
      },
      properties: {
        time: point.timeString,
        uncertainty: point.uncertainty,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Calculate perpendicular offset for cone edges.
 * Applies cosLat scaling so the perpendicular direction is physically correct
 * in metric space — the old code used raw degree differences which distort the
 * perpendicular angle at non-equatorial latitudes.
 *
 * @param distance  Offset in latitude-degree units (uncertainty_km / 111).
 * @returns [lon_offset_deg, lat_offset_deg] to add to the track point.
 */
function calculatePerpendicularOffset(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  distance: number
): [number, number] {
  const midLat = (lat1 + lat2) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180) || 1e-9;
  // Scale lon displacement to physical units (cosLat) before computing
  // the perpendicular so that 1 unit East ≈ 1 unit North.
  const dx = (lon2 - lon1) * cosLat; // East, cosLat-weighted
  const dy = lat2 - lat1; // North
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return [0, 0];
  const perpX = -dy / length; // East component (cosLat-scaled)
  const perpY = dx / length; // North component
  // Undo the cosLat weighting when converting back to longitude degrees.
  return [(perpX * distance) / cosLat, perpY * distance];
}

/**
 * Generate simplified cone outline (outer boundary only)
 */
export function generateForecastConeOutline(
  forecastPoints: CycloneForecastPoint[]
): GeoJSON.Feature<GeoJSON.LineString> {
  if (!forecastPoints || forecastPoints.length < 2) {
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [],
      },
      properties: {},
    };
  }

  // Unwrap center longitudes for antimeridian continuity.
  const centerLons = unwrapLons(forecastPoints.map(p => p.longitude));

  const leftBoundary: [number, number][] = [];
  const rightBoundary: [number, number][] = [];

  // Calculate both boundaries
  for (let i = 0; i < forecastPoints.length - 1; i++) {
    const point = forecastPoints[i];
    const nextPoint = forecastPoints[i + 1];
    const cLon = centerLons[i];
    const nLon = centerLons[i + 1];

    const uncertaintyDeg = point.uncertainty / 111;

    const leftOffset = calculatePerpendicularOffset(
      cLon,
      point.latitude,
      nLon,
      nextPoint.latitude,
      -uncertaintyDeg
    );

    const rightOffset = calculatePerpendicularOffset(
      cLon,
      point.latitude,
      nLon,
      nextPoint.latitude,
      uncertaintyDeg
    );

    leftBoundary.push([cLon + leftOffset[0], point.latitude + leftOffset[1]]);
    rightBoundary.push([cLon + rightOffset[0], point.latitude + rightOffset[1]]);
  }

  // Add final point — longitude offset corrected for cosLat so the tip of the
  // cone has the same physical half-width as the uncertainty radius implies.
  const lastPoint = forecastPoints[forecastPoints.length - 1];
  const lastUncertaintyDeg = lastPoint.uncertainty / 111;
  const lastCosLat = Math.cos((lastPoint.latitude * Math.PI) / 180) || 1e-9;
  const lastCLon = centerLons[centerLons.length - 1];
  leftBoundary.push([lastCLon - lastUncertaintyDeg / lastCosLat, lastPoint.latitude]);
  rightBoundary.push([lastCLon + lastUncertaintyDeg / lastCosLat, lastPoint.latitude]);

  // Combine into single outline: left boundary + reversed right boundary
  const outline = [...leftBoundary, ...rightBoundary.reverse(), leftBoundary[0]];

  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: outline,
    },
    properties: {
      type: 'forecast-cone',
    },
  };
}
