'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import { ChevronDown, ChevronUp, Layers as LayersIcon } from 'lucide-react';
import { getBeforeLayerId } from '@/utils/layerOrder';
import { MAP_DANGER_NAMES, WIND_DANGER_ORDER, windDangerColor } from '@/utils/forecastExposure';
import { RADIUS_OF_MAX_WINDS, windBandShortLabel } from '@/utils/windScale';
import {
  FACILITY_COLORS,
  FLOODPLAIN_COLOR,
  PRIORITY_COLORS,
  ORIGIN_COLORS,
  TRACK_COLOR,
  WIND_RADIUS_COLORS,
} from '@/utils/forecastColors';
import type { ForecastLayerControls } from '@/utils/useForecastLayers';
import { formatCount } from '@/utils/formatters';
import ReleaseScrubber from '@/components/ReleaseScrubber';
import { unwrapAntimeridian } from '@/utils/antimeridian';

/**
 * Map overlays for a Rapid Exposure Forecast: forecast wind swaths, distance
 * rings around the track, exposed facilities, and exposure in floodplains
 * (fetched when first switched on; it's several MB). Which are shown is chosen
 * in Map Controls (see ForecastLayersSection and useForecastLayers).
 */

type OverlayId =
  | 'track'
  | 'swaths'
  | 'rings'
  | 'facilities'
  | 'floodplain'
  | 'priority'
  | 'origins'
  | 'releases'
  | 'times'
  | 'radii';

const SOURCES: Record<OverlayId, string> = {
  track: 'forecast-cyclone-track',
  swaths: 'forecast-wind-swaths',
  rings: 'forecast-track-distance',
  facilities: 'forecast-facilities',
  floodplain: 'forecast-floodplain',
  priority: 'forecast-priority',
  origins: 'forecast-advisory-origins',
  releases: 'forecast-advisory-tracks',
  times: 'forecast-track-times',
  radii: 'forecast-wind-radii',
};

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!
  );
}

/**
 * REF's distance band, e.g. "Within 150km". Some runs wrote the band without its number
 * ("Within km of track"), which read as a blank in the popup.
 */
function trackDistanceText(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return `${formatCount(value)} km`;
  const text = typeof value === 'string' ? value.trim() : '';
  return /\d/.test(text) ? text : 'not recorded';
}

function count(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? formatCount(parsed) : '0';
}

// Light text: the global popup style (globals.css) gives every map popup a dark background, and
// dark text on it could not be read. The band badge keeps dark text on its own light colour.
function popupHtml(title: string, rows: Array<[string, string]>, badge?: string | null): string {
  return `<div style="padding: 12px 36px 12px 12px; font-family: system-ui, sans-serif; font-size: 12px; color: #e2e8f0;">
    <h3 style="margin: 0 0 6px 0; font-size: 13px; font-weight: bold; color: #f8fafc;">${escapeHtml(title)}</h3>
    ${
      badge
        ? `<div style="background: ${windDangerColor(badge)}; color: #0f172a; padding: 3px 6px; border-radius: 4px; margin-bottom: 6px; font-weight: bold; font-size: 11px;">${escapeHtml(badge)}</div>`
        : ''
    }
    ${rows.map(([label, value]) => `<p style="margin: 2px 0;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join('')}
  </div>`;
}

const dangerLineColor = [
  'match',
  ['coalesce', ['get', 'Danger'], ''],
  ...MAP_DANGER_NAMES.flatMap(danger => [danger, windDangerColor(danger)]),
  windDangerColor(null),
] as unknown as maplibregl.ExpressionSpecification;

interface OverlayActions {
  /** Switch the dashboard to another advisory of the storm */
  selectAdvisory?: (runId: string) => void;
}

// The basemap's glyph set (see DamagedBuildingsLayer); text only shows if the style has glyphs
const LABEL_FONT = ['Open Sans Bold', 'Arial Unicode MS Bold'];
const LABEL_PAINT = {
  'text-color': '#1e1b4b',
  'text-halo-color': '#ffffff',
  'text-halo-width': 1.6,
};

function addOverlay(
  map: MapLibreMap,
  id: OverlayId,
  data: GeoJSON.FeatureCollection,
  onClick: (layerId: string, handler: (e: maplibregl.MapLayerMouseEvent) => void) => void,
  actions: OverlayActions = {}
) {
  const source = SOURCES[id];
  if (map.getSource(source)) return;
  // The API keeps longitudes in ±180, so a storm near the dateline would otherwise be
  // drawn with straight lines across the whole map
  map.addSource(source, { type: 'geojson', data: unwrapAntimeridian(data) });

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

  if (id === 'releases') {
    map.addLayer(
      {
        id: 'forecast-advisory-tracks',
        type: 'line',
        source,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ORIGIN_COLORS.other,
          'line-width': 2,
          'line-dasharray': [2, 2],
          // The newest earlier advisory reads clearest; the oldest fade towards the basemap
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'age'], 1],
            0,
            0.8,
            6,
            0.2,
          ],
        } as maplibregl.LineLayerSpecification['paint'],
      },
      getBeforeLayerId(map, 'forecast-advisory-tracks')
    );
  }

  if (id === 'radii') {
    const kindColor = [
      'match',
      ['get', 'kind'],
      'hurricane',
      WIND_RADIUS_COLORS.hurricane,
      'storm',
      WIND_RADIUS_COLORS.storm,
      WIND_RADIUS_COLORS.gale,
    ] as unknown as maplibregl.ExpressionSpecification;
    map.addLayer(
      {
        id: 'forecast-wind-radii-fill',
        type: 'fill',
        source,
        paint: {
          'fill-color': kindColor,
          'fill-opacity': 0.12,
        },
      },
      getBeforeLayerId(map, 'forecast-wind-radii-fill')
    );
    map.addLayer(
      {
        id: 'forecast-wind-radii-line',
        type: 'line',
        source,
        paint: { 'line-color': kindColor, 'line-width': 1.5, 'line-opacity': 0.85 },
      },
      getBeforeLayerId(map, 'forecast-wind-radii-line')
    );
    onClick('forecast-wind-radii-fill', e => {
      // Every threshold's rings overlap here, so list all of them, not just the top one
      const hits = map.queryRenderedFeatures(e.point, { layers: ['forecast-wind-radii-fill'] });
      const rings = hits.length > 0 ? hits : (e.features ?? []);
      const order = ['hurricane', 'storm', 'gale'];
      const rows = [...rings]
        .sort(
          (a, b) =>
            order.indexOf(String(a.properties?.kind)) - order.indexOf(String(b.properties?.kind))
        )
        .map((feature): [string, string] => {
          const p = (feature.properties ?? {}) as Record<string, unknown>;
          const nm = (value: unknown) => count(value);
          const widest = Math.max(...[p.ne, p.se, p.sw, p.nw].map(value => Number(value) || 0));
          return [
            String(p.threshold ?? ''),
            `NE ${nm(p.ne)} · SE ${nm(p.se)} · SW ${nm(p.sw)} · NW ${nm(p.nw)} nm (up to ${count(widest * 1.852)} km)`,
          ];
        });
      const at = String(rings[0]?.properties?.at ?? '');
      new maplibregl.Popup({ maxWidth: '280px' })
        .setLngLat(e.lngLat)
        .setHTML(
          popupHtml(
            'Wind reach by quadrant',
            [['Forecast time', `${at.replace('T', ' ').slice(0, 16)}Z`], ...rows],
            null
          )
        )
        .addTo(map);
    });
  }

  if (id === 'times') {
    const isDay = ['==', ['get', 'kind'], 'day'] as unknown as maplibregl.ExpressionSpecification;
    map.addLayer(
      {
        id: 'forecast-track-times-dot',
        type: 'circle',
        source,
        paint: {
          'circle-radius': ['case', isDay, 5.5, 3],
          'circle-color': ['case', isDay, ORIGIN_COLORS.day, TRACK_COLOR],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        } as maplibregl.CircleLayerSpecification['paint'],
      },
      getBeforeLayerId(map, 'forecast-track-times-dot')
    );
    map.addLayer(
      {
        id: 'forecast-track-times-label',
        type: 'symbol',
        source,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': LABEL_FONT,
          'text-size': ['case', isDay, 12, 10],
          'text-anchor': 'top',
          'text-offset': [0, 0.8],
          // A day marker outranks an hour label when they collide
          'symbol-sort-key': ['get', 'sortKey'],
          'text-optional': true,
        } as maplibregl.SymbolLayerSpecification['layout'],
        paint: LABEL_PAINT,
      },
      getBeforeLayerId(map, 'forecast-track-times-label')
    );
  }

  if (id === 'origins') {
    const selected = [
      '==',
      ['get', 'selected'],
      true,
    ] as unknown as maplibregl.ExpressionSpecification;
    const latest = [
      '==',
      ['get', 'isLatest'],
      true,
    ] as unknown as maplibregl.ExpressionSpecification;
    map.addLayer(
      {
        id: 'forecast-advisory-origins',
        type: 'circle',
        source,
        paint: {
          'circle-radius': ['case', selected, 8, latest, 6.5, 5],
          'circle-color': ['case', selected, ORIGIN_COLORS.selected, ORIGIN_COLORS.other],
          'circle-opacity': ['case', selected, 1, 0.75],
          'circle-stroke-color': ['case', latest, TRACK_COLOR, '#ffffff'],
          'circle-stroke-width': ['case', selected, 2.5, latest, 2.5, 1.5],
        } as maplibregl.CircleLayerSpecification['paint'],
      },
      getBeforeLayerId(map, 'forecast-advisory-origins')
    );
    map.addLayer(
      {
        id: 'forecast-advisory-origins-label',
        type: 'symbol',
        source,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': LABEL_FONT,
          'text-size': 10,
          'text-anchor': 'bottom',
          'text-offset': [0, -0.9],
          // The advisory on screen and the latest keep their label when others collide
          'symbol-sort-key': ['case', selected, 0, latest, 1, 2],
          'text-optional': true,
        } as maplibregl.SymbolLayerSpecification['layout'],
        paint: LABEL_PAINT,
      },
      getBeforeLayerId(map, 'forecast-advisory-origins-label')
    );
    onClick('forecast-advisory-origins', e => {
      const props = (e.features?.[0]?.properties ?? {}) as Record<string, unknown>;
      const runId = String(props.runId ?? '');
      const isSelected = props.selected === true || props.selected === 'true';
      const popup = new maplibregl.Popup({ maxWidth: '280px' })
        .setLngLat(e.lngLat)
        .setHTML(
          popupHtml(
            `Advisory issued ${String(props.label ?? '')}`,
            [
              ['Storm', String(props.storm ?? '')],
              ['Position at', props.positionLabel ? String(props.positionLabel) : 'not recorded'],
              ['Wind there', props.windKt ? `${props.windKt} kt` : 'not recorded'],
              [
                'Status',
                props.isLatest === true || props.isLatest === 'true' ? 'Latest' : 'Earlier',
              ],
            ],
            null
          ) +
            (isSelected
              ? '<p style="margin:0;padding:0 12px 12px;font-size:11px;color:#94a3b8;">Showing this advisory now</p>'
              : `<div style="padding:0 12px 12px;"><button type="button" data-advisory="${escapeHtml(runId)}" style="cursor:pointer;border:1px solid #38bdf8;background:#0c4a6e;color:#e0f2fe;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;">View this advisory</button></div>`)
        )
        .addTo(map);
      popup
        .getElement()
        ?.querySelector('[data-advisory]')
        ?.addEventListener('click', () => {
          actions.selectAdvisory?.(runId);
          popup.remove();
        });
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
              ['Distance from track', trackDistanceText(props.Track_distance)],
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
              ['Distance from track', trackDistanceText(props.Track_distance)],
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
    origins: ['forecast-advisory-origins-label', 'forecast-advisory-origins'],
    releases: ['forecast-advisory-tracks'],
    times: ['forecast-track-times-label', 'forecast-track-times-dot'],
    radii: ['forecast-wind-radii-line', 'forecast-wind-radii-fill'],
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
  onSelectAdvisory,
}: {
  map: MapLibreMap | null;
  controls: ForecastLayerControls;
  onOpenControls: () => void;
  /** Overlays left undrawn for now without changing the user's switches, e.g. the static
   * track while the cyclone animation draws the same track */
  hiddenOverlays?: OverlayId[];
  /** Called when someone chooses "View this advisory" on an advisory's start point */
  onSelectAdvisory?: (runId: string) => void;
}) {
  // A ref, so a new callback each render doesn't tear the overlays down and redraw them
  const selectAdvisoryRef = useRef(onSelectAdvisory);
  useEffect(() => {
    selectAdvisoryRef.current = onSelectAdvisory;
  }, [onSelectAdvisory]);
  const actions = useMemo<OverlayActions>(
    () => ({ selectAdvisory: runId => selectAdvisoryRef.current?.(runId) }),
    []
  );
  const { shown, data } = controls;
  // Drawn on the map: switched on AND this run has the data (a switch can be on for
  // a layer the run lacks, e.g. the REF input track)
  const available = new Set(
    controls.options.filter(option => !option.disabled).map(option => option.id)
  );
  const active = Object.fromEntries(
    (Object.keys(SOURCES) as OverlayId[]).map(id => [id, shown[id] && available.has(id)])
  ) as Record<OverlayId, boolean>;
  const overlays = map
    ? (Object.keys(SOURCES) as OverlayId[]).map(id => {
        const collection = data[id];
        return shown[id] && !hiddenOverlays.includes(id) && collection ? (
          <Overlay key={id} map={map} id={id} data={collection} actions={actions} />
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
      {controls.releaseSteps?.length >= 2 && (
        <ReleaseScrubber steps={controls.releaseSteps} onSelect={onSelectAdvisory} />
      )}
      <ForecastLegend active={active} timeZone={controls.timeZoneName} period={controls.period} />
    </>
  );
}

/** What everything drawn on the forecast map means. */
export function ForecastLegend({
  active,
  timeZone,
  period,
}: {
  active: Partial<Record<OverlayId, boolean>>;
  /** Name of the zone the time labels use, e.g. "UTC" */
  timeZone?: string;
  /** The period the wind shading covers, e.g. "18 Nov 18:00 – 24 Nov 00:00 UTC". Shown even while the
   * legend is collapsed: the shading means nothing without the time it is for. */
  period?: string | null;
}) {
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
      {period && (
        <p className="px-2.5 pb-1.5 text-[10px] leading-snug text-slate-300">
          Strongest forecast winds over {period}
        </p>
      )}
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
                    {windBandShortLabel(band)}
                  </span>
                </li>
              ))}
            </ul>
            {active.swaths && (
              <p className="mt-1 flex items-center gap-1 text-slate-300">
                <span
                  className="h-0 w-3 flex-shrink-0 border-t-[3px]"
                  style={{ borderColor: windDangerColor(RADIUS_OF_MAX_WINDS) }}
                  aria-hidden="true"
                />
                Ring of strongest winds around the centre (radius of maximum winds)
              </p>
            )}
          </div>
          {(active.facilities ||
            active.floodplain ||
            active.rings ||
            active.track ||
            active.priority ||
            active.origins ||
            active.releases ||
            active.radii ||
            active.times) && (
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
              {active.origins && (
                <li className="space-y-0.5">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full border-2 border-white"
                      style={{ backgroundColor: ORIGIN_COLORS.selected }}
                      aria-hidden="true"
                    />
                    Start of the advisory on screen
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full border border-white"
                      style={{ backgroundColor: ORIGIN_COLORS.other }}
                      aria-hidden="true"
                    />
                    Start of the storm&apos;s other advisories (outlined: the latest)
                  </span>
                </li>
              )}
              {active.releases && (
                <li className="flex items-center gap-1.5">
                  <span
                    className="w-3 flex-shrink-0 border-t-2 border-dashed"
                    style={{ borderColor: ORIGIN_COLORS.other }}
                    aria-hidden="true"
                  />
                  Earlier advisories&apos; tracks (fainter when older)
                </li>
              )}
              {active.radii && (
                <li className="space-y-0.5">
                  {(
                    [
                      ['gale', 'Gale (34 kt) reach'],
                      ['storm', 'Storm (48 kt) reach'],
                      ['hurricane', 'Hurricane (64 kt) reach'],
                    ] as const
                  ).map(([kind, text]) => (
                    <span key={kind} className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-3 flex-shrink-0 rounded-sm border"
                        style={{
                          borderColor: WIND_RADIUS_COLORS[kind],
                          backgroundColor: `${WIND_RADIUS_COLORS[kind]}33`,
                        }}
                        aria-hidden="true"
                      />
                      {text}
                    </span>
                  ))}
                  <span className="block text-slate-400">
                    Farthest reach within each quadrant, at the time chosen in Map Controls.
                  </span>
                </li>
              )}
              {active.times && (
                <li className="space-y-0.5">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full border-2 border-white"
                      style={{ backgroundColor: ORIGIN_COLORS.day }}
                      aria-hidden="true"
                    />
                    Day changes at midnight{timeZone ? ` (${timeZone})` : ''}
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <span
                      className="h-1.5 w-1.5 flex-shrink-0 rounded-full border border-white"
                      style={{ backgroundColor: TRACK_COLOR }}
                      aria-hidden="true"
                    />
                    Forecast time every 6 hours
                  </span>
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
  actions,
}: {
  map: MapLibreMap;
  id: OverlayId;
  data: GeoJSON.FeatureCollection;
  actions: OverlayActions;
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
        addOverlay(map, id, data, onClick, actions);
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
  }, [map, id, data, actions]);

  return null;
}
