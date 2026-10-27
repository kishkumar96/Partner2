import {
  loadHazardScenario,
  probeDepth,
  storeFor,
  type DepthReading,
  type HazardScenarioImage,
  type HazardScenarioRef,
  type ImageCorners,
} from './hazardZarr';

/**
 * Puts one hazard scenario on a MapLibre map as a single picture read from the Zarr store.
 *
 * It is a drop-in for the raster-tile layer the catalogue rows describe: same source and layer ids,
 * same opacity, so the map's existing show/hide and clean-up keep working. If anything goes wrong
 * (the store is unreachable, the scenario is missing, the picture cannot be made) it says so in the
 * console and hands over to `onFallback`, which draws the server's tiles instead.
 */

/** The few map calls used, so a fake can stand in for the map in tests. */
export interface HazardLayerMap {
  getSource(id: string): unknown;
  getLayer(id: string): unknown;
  addSource(id: string, source: object): unknown;
  addLayer(layer: object, beforeId?: string): unknown;
}

export interface EncodedScenario {
  dataUrl: string;
  corners: ImageCorners;
}

export interface HazardLayerOptions {
  sourceId: string;
  layerId: string;
  scenario: HazardScenarioRef;
  /** A layer to put this one under, if it is on the map */
  beforeId?: string;
  /** Asked again when the picture is ready: whether this layer is still wanted */
  isWanted: () => boolean;
  /** Draw the server's tiles instead */
  onFallback: () => void;
  opacity?: number;
  /** Replaceable for tests */
  load?: (scenario: HazardScenarioRef) => Promise<EncodedScenario>;
}

/** The picture as a PNG data address: drawn on a canvas, which is how a browser makes a PNG. */
export function encodePng(image: HazardScenarioImage): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('this browser cannot draw a canvas');
  const pixels = context.createImageData(image.width, image.height);
  pixels.data.set(image.rgba);
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}

/** What a click needs from a loaded scenario: its raw depths and where they sit. */
type ScenarioRaster = Pick<HazardScenarioImage, 'depth' | 'width' | 'height' | 'georeference'>;

async function loadAndEncode(scenario: HazardScenarioRef): Promise<EncodedScenario> {
  const image = await loadHazardScenario(storeFor(scenario.storeUrl), scenario);
  rememberRaster(scenario, image);
  return { dataUrl: encodePng(image), corners: image.corners };
}

const CACHE_SIZE = 8;
const finished = new Map<string, Promise<EncodedScenario>>();

const keyOf = (scenario: HazardScenarioRef) =>
  `${scenario.storeUrl}|${scenario.source}|${scenario.slr}|${scenario.selector}`;

/** Scenarios already read, so switching back to one does not read it again. A failure is not kept. */
function cached(
  scenario: HazardScenarioRef,
  load: (s: HazardScenarioRef) => Promise<EncodedScenario>
) {
  const key = keyOf(scenario);
  const hit = finished.get(key);
  if (hit) {
    finished.delete(key);
    finished.set(key, hit); // most recently used last
    return hit;
  }
  const started = load(scenario);
  finished.set(key, started);
  started.catch(() => finished.delete(key));
  while (finished.size > CACHE_SIZE) finished.delete(finished.keys().next().value as string);
  return started;
}

/**
 * The raw depths of the scenarios drawn most recently. A raster is about 20 MB, so only the last two
 * are kept, which covers the one on screen and the one just left; a click on anything older reads it
 * again.
 */
const RASTER_CACHE_SIZE = 2;
const rasters = new Map<string, Promise<ScenarioRaster>>();

function keepRaster(key: string, raster: Promise<ScenarioRaster>) {
  rasters.delete(key);
  rasters.set(key, raster);
  while (rasters.size > RASTER_CACHE_SIZE) rasters.delete(rasters.keys().next().value as string);
}

function rememberRaster(scenario: HazardScenarioRef, image: ScenarioRaster) {
  keepRaster(keyOf(scenario), Promise.resolve(image));
}

/**
 * How deep the water is at a point in a scenario. Uses the raster the picture was made from when it
 * is still held, and reads the scenario again when it is not.
 */
export async function readScenarioDepth(
  scenario: HazardScenarioRef,
  longitude: number,
  latitude: number,
  loadRaster: (scenario: HazardScenarioRef) => Promise<ScenarioRaster> = s =>
    loadHazardScenario(storeFor(s.storeUrl), s)
): Promise<DepthReading> {
  const key = keyOf(scenario);
  let raster = rasters.get(key);
  if (raster) {
    keepRaster(key, raster); // most recently used last
  } else {
    raster = loadRaster(scenario);
    keepRaster(key, raster);
    raster.catch(() => rasters.delete(key));
  }
  return probeDepth(await raster, longitude, latitude);
}

/** Forget what was read (for tests, and after the store in the bucket is replaced). */
export function clearHazardScenarioCache(): void {
  finished.clear();
  rasters.clear();
}

/** The hazard layers this module has put on each map, so a click knows which scenarios to ask about. */
const placed = new WeakMap<object, Map<string, HazardScenarioRef>>();

export function hazardZarrLayersOn(
  map: object
): Array<{ layerId: string; scenario: HazardScenarioRef }> {
  return [...(placed.get(map) ?? [])].map(([layerId, scenario]) => ({ layerId, scenario }));
}

/** One load at a time per layer on a map, however many times the map's layers are reconciled. */
const inFlight = new WeakMap<object, Set<string>>();

export async function addHazardZarrLayer(
  map: HazardLayerMap,
  options: HazardLayerOptions
): Promise<'added' | 'fallback' | 'skipped'> {
  const {
    sourceId,
    layerId,
    scenario,
    beforeId,
    isWanted,
    onFallback,
    opacity = 0.85,
    load = loadAndEncode,
  } = options;
  if (map.getSource(sourceId) || map.getLayer(layerId)) return 'skipped';

  let pending = inFlight.get(map);
  if (!pending) inFlight.set(map, (pending = new Set()));
  if (pending.has(layerId)) return 'skipped';
  pending.add(layerId);

  try {
    let encoded: EncodedScenario;
    try {
      encoded = await cached(scenario, load);
    } catch (error) {
      console.warn(
        `Hazard layer ${layerId}: could not read the scenario from the Zarr store, using server tiles instead.`,
        error
      );
      onFallback();
      return 'fallback';
    }
    // the map may have moved on while the picture was loading
    if (map.getSource(sourceId) || map.getLayer(layerId)) return 'skipped';
    try {
      map.addSource(sourceId, {
        type: 'image',
        url: encoded.dataUrl,
        coordinates: encoded.corners,
      });
      const layer = {
        id: layerId,
        type: 'raster',
        source: sourceId,
        layout: { visibility: isWanted() ? 'visible' : 'none' },
        paint: {
          'raster-opacity': opacity,
          'raster-resampling': 'nearest',
          'raster-fade-duration': 0,
        },
      };
      if (beforeId && map.getLayer(beforeId)) map.addLayer(layer, beforeId);
      else map.addLayer(layer);
    } catch (error) {
      // the map was removed or its style is changing: nothing to draw on
      console.warn(`Hazard layer ${layerId}: the map could not take the picture.`, error);
      return 'skipped';
    }
    let known = placed.get(map);
    if (!known) placed.set(map, (known = new Map()));
    known.set(layerId, scenario);
    return 'added';
  } finally {
    pending.delete(layerId);
  }
}
