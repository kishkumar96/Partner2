/**
 * The brief's map is a capture of the live map, so it showed whatever the officer's view happened to be: a
 * storm at the very edge, or the islands as dots in empty ocean. This frames the map on the forecast (the
 * islands and the part of the track near them, see forecastFocusCollection) for the capture, then puts the
 * officer's own view back, so the page on screen is not left somewhere they did not put it.
 */

export interface FramableMap {
  getCenter: () => { lng: number; lat: number };
  getZoom: () => number;
  getBearing: () => number;
  getPitch: () => number;
  fitBounds: (bounds: unknown, options: Record<string, unknown>) => unknown;
  jumpTo: (options: {
    center: [number, number];
    zoom: number;
    bearing: number;
    pitch: number;
  }) => unknown;
}

export interface FrameOptions {
  padding?: number;
  /** Do not zoom in past this: a single small island should not fill the page with featureless sea */
  maxZoom?: number;
}

/**
 * Runs `capture` with the map fitted to `bounds`, flat and north-up, and restores the previous camera whatever
 * happens. With no bounds, or a map that cannot be framed, it just runs `capture` on the view as it is.
 */
export async function withMapFramedOn<T>(
  map: Partial<FramableMap> | null | undefined,
  bounds: unknown,
  capture: () => Promise<T>,
  options: FrameOptions = {}
): Promise<T> {
  if (
    !map ||
    !bounds ||
    typeof map.fitBounds !== 'function' ||
    typeof map.jumpTo !== 'function' ||
    typeof map.getCenter !== 'function' ||
    typeof map.getZoom !== 'function'
  ) {
    return capture();
  }
  const center = map.getCenter();
  const saved = {
    center: [center.lng, center.lat] as [number, number],
    zoom: map.getZoom(),
    bearing: map.getBearing?.() ?? 0,
    pitch: map.getPitch?.() ?? 0,
  };
  try {
    map.fitBounds(bounds, {
      padding: options.padding ?? 48,
      maxZoom: options.maxZoom ?? 10,
      bearing: 0,
      pitch: 0,
      animate: false,
    });
    return await capture();
  } finally {
    map.jumpTo(saved);
  }
}
