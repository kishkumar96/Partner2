'use client';

import { useEffect } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { getBeforeLayerId } from '@/utils/layerOrder';
import { EEZ_ATTRIBUTION, loadEezAssets, type EezAssets, type EezStatus } from '@/utils/pacificEez';

/**
 * The Pacific EEZ outlines under every data overlay: muted outlines for neighbours, a brighter one for the
 * selected country, and curated country/territory labels. Visual context only. It adds no click handlers
 * and no fill, so it cannot take a click from an asset or a cyclone track.
 *
 * Like the other layer components, MapView remounts it when the basemap changes (a new map instance), and
 * it also puts itself back if a style reload drops its source.
 */

const OUTLINES = 'pacific-eez-outlines';
const LABELS = 'pacific-eez-label-points';
const LAYERS = [
  'pacific-eez-labels-minor',
  'pacific-eez-labels',
  'pacific-eez-selected',
  'pacific-eez-outline',
] as const;

// Same glyph set the forecast overlays use; text only shows if the basemap style has glyphs
const LABEL_FONT = ['Open Sans Bold', 'Arial Unicode MS Bold'];

function palette(dark: boolean) {
  return dark
    ? {
        outline: '#94a3b8',
        selected: '#22d3ee',
        text: '#cbd5e1',
        selectedText: '#67e8f9',
        halo: '#0f172a',
      }
    : {
        outline: '#64748b',
        selected: '#0891b2',
        text: '#475569',
        selectedText: '#0e7490',
        halo: '#ffffff',
      };
}

function addToMap(map: MapLibreMap, assets: EezAssets, country: string, dark: boolean) {
  if (map.getSource(OUTLINES)) return;
  const colors = palette(dark);
  map.addSource(OUTLINES, {
    type: 'geojson',
    data: assets.outlines,
    attribution: EEZ_ATTRIBUTION,
  });
  map.addSource(LABELS, { type: 'geojson', data: assets.labels });

  const selected = ['==', ['get', 'country'], country] as never;
  const notSelected = ['!=', ['get', 'country'], country] as never;
  const layout = { 'line-cap': 'round', 'line-join': 'round' } as const;

  map.addLayer(
    {
      id: 'pacific-eez-outline',
      type: 'line',
      source: OUTLINES,
      filter: notSelected,
      layout,
      paint: { 'line-color': colors.outline, 'line-width': 1, 'line-opacity': 0.6 },
    },
    getBeforeLayerId(map, 'pacific-eez-outline')
  );
  map.addLayer(
    {
      id: 'pacific-eez-selected',
      type: 'line',
      source: OUTLINES,
      filter: selected,
      layout,
      paint: { 'line-color': colors.selected, 'line-width': 2.2, 'line-opacity': 0.95 },
    },
    getBeforeLayerId(map, 'pacific-eez-selected')
  );

  const label = (rank: unknown, minzoom: number, id: string) =>
    map.addLayer(
      {
        id,
        type: 'symbol',
        source: LABELS,
        minzoom,
        filter: rank as never,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': LABEL_FONT,
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 13],
          // Collision-managed: where two labels meet, the lower rank (country) is kept
          'symbol-sort-key': ['get', 'rank'],
          'text-allow-overlap': false,
          'text-optional': true,
          'text-padding': 4,
        } as never,
        paint: {
          'text-color': ['case', selected, colors.selectedText, colors.text],
          'text-halo-color': colors.halo,
          'text-halo-width': 1.4,
          // Fades out between zoom 6 and 7, where the country's own layers carry the names
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 6, 1, 7, 0],
        } as never,
      },
      getBeforeLayerId(map, id)
    );
  label(['<=', ['get', 'rank'], 2], 2, 'pacific-eez-labels');
  label(['>=', ['get', 'rank'], 3], 4.5, 'pacific-eez-labels-minor');
}

function removeFromMap(map: MapLibreMap) {
  try {
    for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(OUTLINES)) map.removeSource(OUTLINES);
    if (map.getSource(LABELS)) map.removeSource(LABELS);
  } catch {
    // The map or its style is already gone
  }
}

interface PacificEezLayerProps {
  map: MapLibreMap | null;
  visible: boolean;
  /** Dashboard country code: its zones get the brighter outline */
  selectedCountry: string;
  /** Whether the basemap is dark, for readable outlines and labels */
  dark?: boolean;
  /** Bump to try again after a failed load */
  retryKey?: number;
  onStatusChange?: (status: EezStatus) => void;
}

export default function PacificEezLayer({
  map,
  visible,
  selectedCountry,
  dark = false,
  retryKey = 0,
  onStatusChange,
}: PacificEezLayerProps) {
  useEffect(() => {
    if (!map || !visible) {
      onStatusChange?.('idle');
      return;
    }
    const controller = new AbortController();
    let assets: EezAssets | null = null;

    const draw = () => {
      if (!assets) return;
      try {
        if (map.isStyleLoaded()) addToMap(map, assets, selectedCountry, dark);
      } catch {
        // Style not ready: the style.load listener below tries again
      }
    };

    onStatusChange?.('loading');
    loadEezAssets()
      .then(loaded => {
        if (controller.signal.aborted) return;
        assets = loaded;
        draw();
        onStatusChange?.('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) onStatusChange?.('failed');
      });

    // A style reload drops custom sources; put the outlines back
    map.on('style.load', draw);
    map.on('styledata', draw);

    return () => {
      controller.abort();
      map.off('style.load', draw);
      map.off('styledata', draw);
      removeFromMap(map);
    };
    // The outline of the selected country is baked into the layers' filters, so a country change redraws
  }, [map, visible, selectedCountry, dark, retryKey, onStatusChange]);

  return null;
}
