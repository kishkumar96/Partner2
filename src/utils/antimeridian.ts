/**
 * Antimeridian (dateline) handling for GeoJSON that is drawn on a MapLibre map.
 *
 * A producer that keeps longitudes inside [-180, 180] writes a track or a polygon that
 * crosses the dateline as ... 179.5, -179.5 ... . MapLibre joins consecutive vertices
 * with a straight line in lon/lat, so that step is drawn the long way round the world:
 * a horizontal line across the whole map. Because Cook Islands, Samoa and Tonga sit
 * either side of 180°, every forecast for the region can hit it.
 *
 * The fix is to make the sequence continuous (179.5, 180.5) rather than clip it.
 * MapLibre renders longitudes outside ±180 on the neighbouring world copy, so the
 * shape is drawn whole wherever the viewer is looking. `forecastCone.ts` and
 * `CycloneAnimationLayer.tsx` already do this for the shapes they build themselves.
 *
 * Assumes no single edge legitimately spans more than 180° of longitude, which holds
 * for any regional forecast. Points are left alone: a point at -179 draws correctly.
 */

type Position = GeoJSON.Position;

/** True if a step between two longitudes would be drawn across the world. */
function jumps(prev: number, next: number): boolean {
  return Math.abs(next - prev) > 180;
}

function lineJumps(line: Position[]): boolean {
  for (let i = 1; i < line.length; i++) if (jumps(line[i - 1][0], line[i][0])) return true;
  return false;
}

/** Make a vertex sequence continuous. Returns the input untouched when it already is. */
export function unwrapLine(line: Position[]): Position[] {
  if (!lineJumps(line)) return line;
  const out: Position[] = new Array(line.length);
  out[0] = line[0];
  for (let i = 1; i < line.length; i++) {
    const raw = line[i][0];
    const prev = out[i - 1][0];
    // Pick the multiple of 360 that lands this vertex closest to the previous one
    const offset = Math.round((prev - raw) / 360) * 360;
    out[i] = offset === 0 ? line[i] : [raw + offset, ...line[i].slice(1)];
  }
  return out;
}

function centreLon(ring: Position[]): number {
  let min = Infinity;
  let max = -Infinity;
  for (const [lon] of ring) {
    if (lon < min) min = lon;
    if (lon > max) max = lon;
  }
  return (min + max) / 2;
}

function shiftRing(ring: Position[], by: number): Position[] {
  return by === 0 ? ring : ring.map(p => [p[0] + by, ...p.slice(1)]);
}

/**
 * Unwrap a polygon's rings. Each ring is made continuous, then every hole is moved by a
 * whole number of turns so it sits on the same copy of the world as the outer ring
 * (a hole unwrapped on its own could end up 360° away from the ring that contains it).
 */
export function unwrapPolygon(rings: Position[][]): Position[][] {
  if (!rings.some(lineJumps)) return rings;
  const unwrapped = rings.map(unwrapLine);
  const anchor = centreLon(unwrapped[0]);
  return unwrapped.map((ring, i) =>
    i === 0 ? ring : shiftRing(ring, Math.round((anchor - centreLon(ring)) / 360) * 360)
  );
}

function unwrapGeometry(geometry: GeoJSON.Geometry | null): GeoJSON.Geometry | null {
  if (!geometry) return geometry;
  switch (geometry.type) {
    case 'LineString': {
      const coordinates = unwrapLine(geometry.coordinates);
      return coordinates === geometry.coordinates ? geometry : { ...geometry, coordinates };
    }
    case 'MultiLineString': {
      const coordinates = geometry.coordinates.map(unwrapLine);
      return coordinates.every((c, i) => c === geometry.coordinates[i])
        ? geometry
        : { ...geometry, coordinates };
    }
    case 'Polygon': {
      const coordinates = unwrapPolygon(geometry.coordinates);
      return coordinates === geometry.coordinates ? geometry : { ...geometry, coordinates };
    }
    case 'MultiPolygon': {
      const coordinates = geometry.coordinates.map(unwrapPolygon);
      return coordinates.every((c, i) => c === geometry.coordinates[i])
        ? geometry
        : { ...geometry, coordinates };
    }
    case 'GeometryCollection': {
      const geometries = geometry.geometries.map(g => unwrapGeometry(g) as GeoJSON.Geometry);
      return geometries.every((g, i) => g === geometry.geometries[i])
        ? geometry
        : { ...geometry, geometries };
    }
    default:
      return geometry;
  }
}

/**
 * Return the collection with every line and polygon made continuous across ±180°.
 * Nothing is copied unless a feature actually crosses, so the common case (and a
 * multi-MB floodplain layer) costs one pass and no allocation. Input is never mutated.
 */
export function unwrapAntimeridian<T extends GeoJSON.FeatureCollection>(collection: T): T {
  let changed = false;
  const features = collection.features.map(feature => {
    const geometry = unwrapGeometry(feature.geometry);
    if (geometry === feature.geometry) return feature;
    changed = true;
    return { ...feature, geometry } as GeoJSON.Feature;
  });
  return changed ? { ...collection, features } : collection;
}
