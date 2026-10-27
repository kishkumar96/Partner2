import { ZarrError, ZarrHttpStore } from './zarrReader';
import { lonLatToUtm, utmToLonLat, utmZoneFromEpsg } from './utm';

/**
 * Hazard scenarios read straight from the catalogue's Zarr store.
 *
 * A catalogue row names a scenario by its tile address (`.../hazard_tiles/<source>/<slr>/<selector>/{z}/{x}/{y}.png`).
 * Instead of asking the server for tiles, the dashboard can read that scenario's depth raster from
 * the store (through the API's `hazard_zarr` endpoint), colour it, and lay it on the map as one picture.
 */

/** Same products and groups as the server's `hazard_tiles.views.PRODUCTS`. */
export const HAZARD_PRODUCTS: Record<string, { group: string; dim: 'return_period' | 'event' }> = {
  combined: { group: 'probabilistic/combined', dim: 'return_period' },
  tc: { group: 'probabilistic/tc', dim: 'return_period' },
  swell: { group: 'probabilistic/swell', dim: 'return_period' },
  historical_tcs: { group: 'historical_tcs', dim: 'event' },
  synthetic_tcs: { group: 'synthetic_tcs', dim: 'event' },
  swell_driven: { group: 'swell_driven', dim: 'event' },
};

export interface HazardScenarioRef {
  /** The store's address (through the proxy), without a trailing slash */
  storeUrl: string;
  source: string;
  slr: number;
  /** A return period in years, or an event label */
  selector: string;
}

const TILE_URL =
  /^(.*)\/hazard_tiles\/([^/]+)\/([^/]+)\/([^/]+)\/\{z\}\/\{x\}\/\{y\}\.png(?:\?.*)?$/;

/** The scenario a catalogue row's tile address stands for, or null if it is not one of ours. */
export function parseHazardTileUrl(tileUrl: string): HazardScenarioRef | null {
  const match = TILE_URL.exec(tileUrl);
  if (!match) return null;
  const [, prefix, source, slr, selector] = match;
  const slrValue = Number(decodeURIComponent(slr));
  if (!HAZARD_PRODUCTS[source] || !Number.isFinite(slrValue)) return null;
  return {
    storeUrl: `${prefix}/hazard_zarr`,
    source,
    slr: slrValue,
    selector: decodeURIComponent(selector),
  };
}

/** On unless switched off: NEXT_PUBLIC_HAZARD_ZARR_DIRECT=false keeps the server-drawn tiles. */
export function hazardZarrEnabled(): boolean {
  return process.env.NEXT_PUBLIC_HAZARD_ZARR_DIRECT !== 'false';
}

/** [longitude, latitude] of the picture's top-left, top-right, bottom-right and bottom-left corners. */
export type ImageCorners = [[number, number], [number, number], [number, number], [number, number]];

export interface HazardScenarioImage {
  width: number;
  height: number;
  /** North-up RGBA pixels, ready to draw */
  rgba: Uint8ClampedArray;
  corners: ImageCorners;
  /** Cells with water, and the deepest one (metres) */
  wetCells: number;
  maxDepth: number;
  /** The raw depths in metres as stored (row 0 is the south edge), NaN where nothing floods */
  depth: Float32Array;
  georeference: Georeference;
}

/** Depths from 0 to this many metres are graded; anything deeper shares the darkest colour. */
export const DEPTH_RAMP_MAX_M = 5;
/** Opacity of every cell with a value, out of 255 (the server's tiles used the same). */
export const DEPTH_ALPHA = 190;

/**
 * The colour of one depth, exactly as the server's tiles drew it: pale blue at 0 m, darker blue
 * towards 5 m. Arithmetic is kept to 32-bit floats so each channel lands on the same integer as the
 * server's. The picture and the legend both use this, so they cannot disagree.
 */
export function depthRgb(depth: number): [number, number, number] {
  const clipped = Math.fround(Math.min(Math.max(depth, 0), DEPTH_RAMP_MAX_M));
  const shallow = Math.fround(1 - Math.fround(clipped / DEPTH_RAMP_MAX_M));
  return [Math.trunc(Math.fround(120 * shallow)), Math.trunc(Math.fround(200 * shallow)), 255];
}

/** Depths to RGBA pixels; cells with no value are transparent. `flipRows` turns a south-up grid north-up. */
export function depthToRgba(
  depth: Float32Array,
  width: number,
  height: number,
  flipRows: boolean
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const target = flipRows ? height - 1 - row : row;
    for (let col = 0; col < width; col += 1) {
      const value = depth[row * width + col];
      if (Number.isNaN(value)) continue;
      const [red, green, blue] = depthRgb(value);
      const at = (target * width + col) * 4;
      rgba[at] = red;
      rgba[at + 1] = green;
      rgba[at + 2] = blue;
      rgba[at + 3] = DEPTH_ALPHA;
    }
  }
  return rgba;
}

export interface Georeference {
  epsg: number;
  /** [a, b, 0, tx, d, e, 0, ty, ...]: x = a*col + b*row + tx, y = d*col + e*row + ty, at pixel centres */
  model_transformation: number[];
}

function georeferenceOf(attrs: Record<string, unknown>, group: string): Georeference {
  const { epsg, model_transformation: transform } = attrs as Partial<Georeference>;
  if (typeof epsg !== 'number' || !Array.isArray(transform) || transform.length < 8) {
    throw new ZarrError(`'${group}' has no georeference (epsg and model_transformation)`);
  }
  return { epsg, model_transformation: transform };
}

/**
 * The picture's corners on the map. The grid's reference point is the centre of its first cell, so
 * the edges lie half a cell further out. When rows run south to north (the usual for these rasters)
 * the picture is flipped to north-up, and the corners follow.
 */
export function imageCorners(
  georeference: Georeference,
  width: number,
  height: number
): { corners: ImageCorners; flipRows: boolean } {
  const [a, b, , tx, d, e, , ty] = georeference.model_transformation;
  if (a <= 0) throw new ZarrError('columns that run west is not supported');
  const zone = utmZoneFromEpsg(georeference.epsg);
  const at = (col: number, row: number): [number, number] =>
    utmToLonLat(a * col + b * row + tx, d * col + e * row + ty, zone);
  const flipRows = e > 0; // row 0 is the southern edge
  const top = flipRows ? height - 0.5 : -0.5;
  const bottom = flipRows ? -0.5 : height - 0.5;
  return {
    corners: [at(-0.5, top), at(width - 0.5, top), at(width - 0.5, bottom), at(-0.5, bottom)],
    flipRows,
  };
}

/** [west, south, east, north] of a product's grid, for fitting and legends. */
export async function hazardProductBounds(
  store: ZarrHttpStore,
  source: string
): Promise<[number, number, number, number]> {
  const product = HAZARD_PRODUCTS[source];
  if (!product) throw new ZarrError(`unknown hazard source '${source}'`);
  const [meta, attrs] = await Promise.all([
    store.arrayMeta(`${product.group}/depth`),
    store.attrs(product.group),
  ]);
  const { corners } = imageCorners(
    georeferenceOf(attrs, product.group),
    meta.shape[meta.shape.length - 1],
    meta.shape[meta.shape.length - 2]
  );
  const longitudes = corners.map(([longitude]) => longitude);
  const latitudes = corners.map(([, latitude]) => latitude);
  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ];
}

/** What a point on the map holds in a scenario. */
export type DepthReading =
  | { kind: 'depth'; metres: number }
  /** inside the modelled area, but nothing floods there */
  | { kind: 'dry' }
  /** off the edge of the modelled area */
  | { kind: 'outside' };

/**
 * The depth under a longitude and latitude. The point is taken to the grid's own metres and rounded
 * to the nearest cell, which is how the server's tiles sampled it.
 */
export function probeDepth(
  scenario: Pick<HazardScenarioImage, 'depth' | 'width' | 'height' | 'georeference'>,
  longitude: number,
  latitude: number
): DepthReading {
  const { georeference, width, height, depth } = scenario;
  const [a, b, , tx, d, e, , ty] = georeference.model_transformation;
  const [x, y] = lonLatToUtm(longitude, latitude, utmZoneFromEpsg(georeference.epsg));
  const determinant = a * e - b * d;
  const col = Math.round(((x - tx) * e - b * (y - ty)) / determinant);
  const row = Math.round((a * (y - ty) - d * (x - tx)) / determinant);
  if (!(col >= 0 && col < width && row >= 0 && row < height)) return { kind: 'outside' };
  const value = depth[row * width + col];
  return Number.isNaN(value) ? { kind: 'dry' } : { kind: 'depth', metres: value };
}

const stores = new Map<string, ZarrHttpStore>();

/** One store object per address, so its metadata is fetched once for all the scenarios. */
export function storeFor(storeUrl: string): ZarrHttpStore {
  let store = stores.get(storeUrl);
  if (!store) {
    store = new ZarrHttpStore(storeUrl);
    stores.set(storeUrl, store);
  }
  return store;
}

function indexOfNumber(values: Array<number | string>, wanted: number, what: string): number {
  const index = values.findIndex(
    value => typeof value === 'number' && Math.abs(value - wanted) < 1e-9
  );
  if (index < 0) throw new ZarrError(`the store has no ${what} ${wanted}`);
  return index;
}

/** Read one scenario from the store and turn it into a picture and its place on the map. */
export async function loadHazardScenario(
  store: ZarrHttpStore,
  scenario: Pick<HazardScenarioRef, 'source' | 'slr' | 'selector'>
): Promise<HazardScenarioImage> {
  const product = HAZARD_PRODUCTS[scenario.source];
  if (!product) throw new ZarrError(`unknown hazard source '${scenario.source}'`);
  const depthPath = `${product.group}/depth`;

  const [depthAttrs, slrValues, selectorValues, groupAttrs] = await Promise.all([
    store.attrs(depthPath),
    store.vector(`${product.group}/slr`),
    store.vector(`${product.group}/${product.dim}`),
    store.attrs(product.group),
  ]);
  const dimensions = depthAttrs._ARRAY_DIMENSIONS as string[] | undefined;
  if (!dimensions || dimensions.length < 3)
    throw new ZarrError(`'${depthPath}' does not say which axes it has`);

  const slrIndex = indexOfNumber(slrValues, scenario.slr, 'sea-level rise of');
  const selectorIndex =
    product.dim === 'return_period'
      ? indexOfNumber(selectorValues, Number(scenario.selector), 'return period of')
      : selectorValues.indexOf(scenario.selector);
  if (selectorIndex < 0) throw new ZarrError(`the store has no event '${scenario.selector}'`);

  const leading = dimensions.slice(0, -2).map(axis => (axis === 'slr' ? slrIndex : selectorIndex));
  const { data, height, width } = await store.plane(depthPath, leading);

  const georeference = georeferenceOf(groupAttrs, product.group);
  const { corners, flipRows } = imageCorners(georeference, width, height);
  let wetCells = 0;
  let maxDepth = 0;
  for (const value of data) {
    if (Number.isNaN(value)) continue;
    wetCells += 1;
    if (value > maxDepth) maxDepth = value;
  }
  return {
    width,
    height,
    rgba: depthToRgba(data, width, height, flipRows),
    corners,
    wetCells,
    maxDepth,
    depth: data,
    georeference,
  };
}
