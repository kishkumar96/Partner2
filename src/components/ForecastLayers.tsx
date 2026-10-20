'use client';

import { useEffect, useState } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import { ChevronDown, ChevronUp, Layers as LayersIcon } from 'lucide-react';
import { getBeforeLayerId } from '@/utils/layerOrder';
import { WIND_DANGER_ORDER, windDangerColor } from '@/utils/forecastExposure';
import {
  FACILITY_COLORS,
  FLOODPLAIN_COLOR,
  PRIORITY_COLORS,
  TRACK_COLOR,
} from '@/utils/forecastColors';
import type { ForecastLayerControls } from '@/utils/useForecastLayers';
import { formatCount } from '@/utils/formatters';

/**
 * Map overlays for a Rapid Exposure Forecast: forecast wind swaths, distance
 * rings around the track, exposed facilities, and exposure in floodplains
 * (fetched when first switched on; it's several MB). Which are shown is chosen
 * in Map Controls (see ForecastLayersSection and useForecastLayers).
 */

type OverlayId = 'track' | 'swaths' | 'rings' | 'facilities' | 'floodplain' | 'priority';

const SOURCES: Record<OverlayId, string> = {
  track: 'forecast-cyclone-track',
  swaths: 'forecast-wind-swaths',
  rings: 'forecast-track-distance',
  facilities: 'forecast-facilities',
  floodplain: 'forecast-floodplain',
  priority: 'forecast-priority',
};

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!
  );
}

function count(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? formatCount(parsed) : '0';
}

function popupHtml(title: string, rows: Array<[string, string]>, badge?: string | null): string {
  return `<div style="padding: 6px; font-family: system-ui, sans-serif; font-size: 12px; color: #0f172a;">
    <h3 style="margin: 0 0 6px 0; font-size: 13px; font-weight: bold;">${escapeHtml(title)}</h3>
    ${
      badge
        ? `<div style="background: ${windDangerColor(badge)}; padding: 3px 6px; border-radius: 4px; margin-bottom: 6px; font-weight: bold; font-size: 11px;">${escapeHtml(badge)}</div>`
        : ''
    }
    ${rows.map(([label, value]) => `<p style="margin: 2px 0;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join('')}
  </div>`;
}

const dangerLineColor = [
  'match',
  ['coalesce', ['get', 'Danger'], ''],
  ...WIND_DANGER_ORDER.flatMap(danger => [danger, windDangerColor(danger)]),
  windDangerColor(null),
] as unknown as maplibregl.ExpressionSpecification;

function addOverlay(
  map: MapLibreMap,
  id: OverlayId,
  data: GeoJSON.FeatureCollection,
  onClick: (layerId: string, handler: (e: maplibregl.MapLayerMouseEvent) => void) => void
) {
  const source = SOURCES[id];
  if (map.getSource(source)) return;
  map.addSource(source, { type: 'geojson', data });

  if (id === 'track') {
    // A white casing under a dark line, so the track reads on light and dark basemaps
    map.addLayer(
      {
        id: 'forecast-cyclone-track-casing',
        type: 'line',
        source,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.9 },
      },
      getBeforeLayerId(map, 'forecast-cyclone-track-casing')
    );
    map.addLayer(
      {
        id: 'forecast-cyclone-track-line',
        type: 'line',
        source,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': TRACK_COLOR, 'line-width': 3, 'line-opacity': 1 },
      },
      getBeforeLayerId(map, 'forecast-cyclone-track-line')
    );
  }

  if (id === 'swaths') {
    map.addLayer(
      {
        id: 'forecast-wind-swaths-line',
        type: 'line',
        source,
        paint: {
          'line-color': dangerLineColor,
          'line-width': 2.5,
          'line-opacity': 0.9,
        },
      },
      getBeforeLayerId(map, 'forecast-wind-swaths-line')
    );
  }

  if (id === 'priority') {
    // An outline, not a fill: the wind shading underneath stays readable. A white
    // casing sets it apart from the similarly coloured wind-swath lines.
    map.addLayer(
      {
        id: 'forecast-priority-casing',
        type: 'line',
        source,
        layout: { 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.85 },
      },
      getBeforeLayerId(map, 'forecast-priority-casing')
    );
    map.addLayer(
      {
        id: 'forecast-priority-line',
        type: 'line',
        source,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': [
            'match',
            ['coalesce', ['get', 'priority'], 'grey'],
            ...Object.entries(PRIORITY_COLORS).flat(),
            PRIORITY_COLORS.grey,
          ] as unknown as maplibregl.ExpressionSpecification,
          'line-width': 3,
          'line-opacity': 0.95,
        },
      },
      getBeforeLayerId(map, 'forecast-priority-line')
    );
    map.addLayer(
      {
        id: 'forecast-priority-hit',
        type: 'fill',
        source,
        paint: { 'fill-color': '#000000', 'fill-opacity': 0 },
      },
      getBeforeLayerId(map, 'forecast-priority-hit')
    );
    onClick('forecast-priority-hit', e => {
      const props = (e.features?.[0]?.properties ?? {}) as Record<string, unknown>;
      const level = String(props.priority ?? 'grey');
      new maplibregl.Popup({ maxWidth: '300px' })
        .setLngLat(e.lngLat)
        .setHTML(
          popupHtml(
            String(props['Region.Region'] ?? props.Region ?? 'Area'),
            [
              ['Operational priority (preliminary)', level.toUpperCase()],
              ...String(props.priority_reasons ?? '')
                .split(' | ')
                .filter(Boolean)
                .map((reason, index): [string, string] => [index === 0 ? 'Why' : '', reason]),
            ],
            null
          )
        )
        .addTo(map);
    });
  }

  if (id === 'rings') {
    map.addLayer(
      {
        id: 'forecast-track-distance-line',
        type: 'line',
        source,
        paint: { 'line-color': '#475569', 'line-width': 1, 'line-dasharray': [3, 3] },
      },
      getBeforeLayerId(map, 'forecast-track-distance-line')
    );
  }

  if (id === 'floodplain') {
    map.addLayer(
      {
        id: 'forecast-floodplain-fill',
        type: 'fill',
        source,
        paint: { 'fill-color': FLOODPLAIN_COLOR, 'fill-opacity': 0.45 },
      },
      getBeforeLayerId(map, 'forecast-floodplain-fill')
    );
    map.addLayer(
      {
        id: 'forecast-floodplain-line',
        type: 'line',
        source,
        paint: { 'line-color': '#1e3a8a', 'line-width': 0.6 },
      },
      getBeforeLayerId(map, 'forecast-floodplain-line')
    );
    onClick('forecast-floodplain-fill', e => {
      const props = (e.features?.[0]?.properties ?? {}) as Record<string, unknown>;
      new maplibregl.Popup({ maxWidth: '260px' })
        .setLngLat(e.lngLat)
        .setHTML(
          popupHtml(
            'Floodplain',
            [
              ['People', count(props.Population)],
              ['Buildings', count(props.Buildings)],
              ['Building value', `$${count(props.Building_Value)}`],
              ['Health facilities', count(props.Health_Facilities ?? props.Health_Facilties)],
              ['Schools', count(props.Schools)],
              ['Evacuation centres', count(props.Evacuation_Centres)],
              ['Distance from track', String(props.Track_distance ?? '')],
            ],
            props.WindSpeed_kmph ? `Forecast winds up to ${props.WindSpeed_kmph} km/h` : null
          )
        )
        .addTo(map);
    });
  }

  if (id === 'facilities') {
    map.addLayer(
      {
        id: 'forecast-facilities',
        type: 'circle',
        source,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 3, 10, 6],
          'circle-color': [
            'match',
            ['get', 'exposure.Asset'],
            ...Object.entries(FACILITY_COLORS).flat(),
            '#e2e8f0',
          ] as unknown as maplibregl.ExpressionSpecification,
          // Blue ring: in a floodplain
          'circle-stroke-color': [
            'case',
            ['==', ['to-string', ['get', 'In_Floodplain']], 'true'],
            FLOODPLAIN_COLOR,
            '#0f172a',
          ],
          'circle-stroke-width': [
            'case',
            ['==', ['to-string', ['get', 'In_Floodplain']], 'true'],
            2,
            0.75,
          ],
        },
      },
      getBeforeLayerId(map, 'forecast-facilities')
    );
    onClick('forecast-facilities', e => {
      const props = (e.features?.[0]?.properties ?? {}) as Record<string, unknown>;
      const inFloodplain = String(props.In_Floodplain) === 'true';
      new maplibregl.Popup({ maxWidth: '260px' })
        .setLngLat(e.lngLat)
        .setHTML(
          popupHtml(
            String(props['exposure.Details'] || props['exposure.Asset'] || 'Facility'),
            [
              [
                'Type',
                [props['exposure.Asset'], props['exposure.UseType']].filter(Boolean).join(' · '),
              ],
              ['Area', String(props.Region ?? '')],
              ['Forecast wind', props.WindSpeed_kmph ? `${props.WindSpeed_kmph} km/h` : '–'],
              ['Distance from track', String(props.Track_distance ?? '')],
              ['In a floodplain', inFloodplain ? 'Yes' : 'No'],
            ],
            props.Danger ? String(props.Danger) : null
          )
        )
        .addTo(map);
    });
  }
}

function removeOverlay(map: MapLibreMap, id: OverlayId) {
  const layers: Record<OverlayId, string[]> = {
    track: ['forecast-cyclone-track-line', 'forecast-cyclone-track-casing'],
    swaths: ['forecast-wind-swaths-line'],
    rings: ['forecast-track-distance-line'],
    facilities: ['forecast-facilities'],
    floodplain: ['forecast-floodplain-line', 'forecast-floodplain-fill'],
    priority: ['forecast-priority-line', 'forecast-priority-casing', 'forecast-priority-hit'],
  };
  try {
    for (const layer of layers[id]) if (map.getLayer(layer)) map.removeLayer(layer);
    if (map.getSource(SOURCES[id])) map.removeSource(SOURCES[id]);
  } catch {
    // The map or its style is already gone
  }
}

/**
 * The forecast's overlays on the map, with a compact legend and a button into
 * the Map Controls "Forecast layers" section. The switches themselves live in
 * Map Controls (see ForecastLayersSection); this only draws what they select.
 */
export default function ForecastLayers({
  map,
  controls,
  onOpenControls,
  hiddenOverlays = [],
}: {
  map: MapLibreMap | null;
  controls: ForecastLayerControls;
  onOpenControls: () => void;
  /** Overlays left undrawn for now without changing the user's switches, e.g. the static
   * track while the cyclone animation draws the same track */
  hiddenOverlays?: OverlayId[];
}) {
  const { shown, data } = controls;
  // Drawn on the map: switched on AND this run has the data (a switch can be on for
  // a layer the run lacks, e.g. the REF input track)
  const available = new Set(controls.options.map(option => option.id));
  const active = Object.fromEntries(
    (Object.keys(SOURCES) as OverlayId[]).map(id => [id, shown[id] && available.has(id)])
  ) as Record<OverlayId, boolean>;
  const overlays = map
    ? (Object.keys(SOURCES) as OverlayId[]).map(id => {
        const collection = data[id];
        return shown[id] && !hiddenOverlays.includes(id) && collection ? (
          <Overlay key={id} map={map} id={id} data={collection} />
        ) : null;
      })
    : null;

  return (
    <>
      {overlays}
      <button
        type="button"
        onClick={onOpenControls}
        aria-label={`Forecast layers: ${controls.activeCount} shown. Open map controls`}
        className="absolute left-2 top-2 z-[5] inline-flex items-center gap-1.5 rounded-lg border border-slate-700/70 bg-slate-900/90 px-2.5 py-1.5 text-xs font-semibold text-slate-100 shadow-lg backdrop-blur hover:bg-slate-800/90"
      >
        <LayersIcon className="h-3.5 w-3.5" aria-hidden="true" />
        Layers · {controls.activeCount}
      </button>
      <ForecastLegend active={active} />
    </>
  );
}

/** What everything drawn on the forecast map means. */
export function ForecastLegend({ active }: { active: Record<OverlayId, boolean> }) {
  // Collapsed to start with: open, it covers the islands the forecast is about
  const [open, setOpen] = useState(false);

  // Area shading is always drawn, so the wind bands are always explained.
  const bands = [...WIND_DANGER_ORDER].reverse();

  return (
    <div
      role="region"
      aria-label="Forecast legend"
      className="absolute bottom-10 left-2 z-[5] w-[19rem] max-w-[calc(100%-1rem)] max-h-[calc(100%-3.5rem)] overflow-y-auto rounded-lg border border-slate-700/70 bg-slate-900/90 text-[10px] text-slate-200 shadow-lg backdrop-blur"
    >
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold"
      >
        Forecast legend
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-700/60 px-2.5 py-1.5">
          <div>
            <p className="mb-0.5 text-slate-400">
              Strongest forecast wind (area shading{active.swaths ? ' and swath outlines' : ''})
            </p>
            <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              {bands.map(band => (
                <li key={band} className="flex items-center gap-1">
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-sm border border-slate-600"
                    style={{ backgroundColor: windDangerColor(band) }}
                    aria-hidden="true"
                  />
                  {/* "Winds" is implied by the heading; the full name stays as the tooltip */}
                  <span className="truncate" title={band}>
                    {band.replace(/ Winds$/, '')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {(active.facilities ||
            active.floodplain ||
            active.rings ||
            active.track ||
            active.priority) && (
            <ul className="space-y-1">
              {active.facilities && (
                <li>
                  <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
                    {Object.entries(FACILITY_COLORS).map(([asset, color]) => (
                      <span key={asset} className="flex items-center gap-1">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: color }}
                          aria-hidden="true"
                        />
                        {asset}
                      </span>
                    ))}
                  </div>
                  <span className="mt-0.5 flex items-center gap-1 text-slate-300">
                    <span
                      className="h-2.5 w-2.5 rounded-full border-2"
                      style={{ borderColor: FLOODPLAIN_COLOR }}
                      aria-hidden="true"
                    />
                    Blue ring: facility in a floodplain
                  </span>
                </li>
              )}
              {active.floodplain && (
                <li className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                    style={{ backgroundColor: FLOODPLAIN_COLOR, opacity: 0.6 }}
                    aria-hidden="true"
                  />
                  Floodplain exposure
                </li>
              )}
              {active.priority && (
                <li>
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <span className="text-slate-400">Priority outline (preliminary):</span>
                    {Object.entries(PRIORITY_COLORS).map(([level, color]) => (
                      <span key={level} className="flex items-center gap-1 capitalize">
                        <span
                          className="h-0 w-3 border-t-[3px]"
                          style={{ borderColor: color }}
                          aria-hidden="true"
                        />
                        {level}
                      </span>
                    ))}
                  </div>
                </li>
              )}
              {active.rings && (
                <li className="flex items-center gap-1.5">
                  <span
                    className="w-3 flex-shrink-0 border-t border-dashed border-slate-400"
                    aria-hidden="true"
                  />
                  Distance from track (25 km rings)
                </li>
              )}
              {active.track && (
                <li className="flex items-center gap-1.5">
                  <span
                    className="h-1 w-3 flex-shrink-0 rounded-sm border border-white"
                    style={{ backgroundColor: TRACK_COLOR }}
                    aria-hidden="true"
                  />
                  Forecast track
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** One overlay's source and layers, for as long as it's shown */
function Overlay({
  map,
  id,
  data,
}: {
  map: MapLibreMap;
  id: OverlayId;
  data: GeoJSON.FeatureCollection;
}) {
  useEffect(() => {
    const handlers: Array<[string, (e: maplibregl.MapLayerMouseEvent) => void]> = [];
    const onClick = (layerId: string, handler: (e: maplibregl.MapLayerMouseEvent) => void) => {
      map.on('click', layerId, handler);
      handlers.push([layerId, handler]);
    };
    // Adding a source and layers needs the style JSON loaded, not every tile.
    // map.isStyleLoaded() is also false while any raster tile is still being
    // fetched (a slow tile server keeps it false for minutes), so waiting on it
    // can mean the overlays never appear. Try straight away, and retry on the
    // style/idle events only if the style genuinely isn't ready yet.
    let done = false;
    const tryAdd = (): boolean => {
      if (done) return true;
      try {
        addOverlay(map, id, data, onClick);
        done = true;
        return true;
      } catch {
        // Style not ready yet (or replaced mid-way); undo any partial add and retry
        removeOverlay(map, id);
        return false;
      }
    };
    const onEvent = () => {
      if (tryAdd()) {
        map.off('styledata', onEvent);
        map.off('idle', onEvent);
      }
    };
    if (!tryAdd()) {
      map.on('styledata', onEvent);
      map.on('idle', onEvent);
    }
    return () => {
      map.off('styledata', onEvent);
      map.off('idle', onEvent);
      for (const [layerId, handler] of handlers) map.off('click', layerId, handler);
      removeOverlay(map, id);
    };
  }, [map, id, data]);

  return null;
}
