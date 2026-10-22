import {
  loadHazardScenario,
  storeFor,
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

async function loadAndEncode(scenario: HazardScenarioRef): Promise<EncodedScenario> {
  const image = await loadHazardScenario(storeFor(scenario.storeUrl), scenario);
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

/** Forget what was read (for tests, and after the store in the bucket is replaced). */
export function clearHazardScenarioCache(): void {
  finished.clear();
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
    return 'added';
  } finally {
    pending.delete(layerId);
  }
}
