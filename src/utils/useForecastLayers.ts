import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPartnerRiskInformationGeometry } from '@/utils/realDataLoader';
import type { ForecastExposure } from '@/utils/forecastExposure';
import type { CountryCode } from '@/types/thredds';

export type ForecastOverlayId =
  | 'track'
  | 'swaths'
  | 'rings'
  | 'facilities'
  | 'floodplain'
  | 'priority';

export interface ForecastLayerOption {
  id: ForecastOverlayId;
  label: string;
  /** Short name for the collapsed summary, e.g. "Wind swaths" */
  short: string;
  available: boolean;
  note?: string;
}

export interface ForecastLayerControls {
  shown: Record<ForecastOverlayId, boolean>;
  toggle: (id: ForecastOverlayId) => void;
  /** Only the overlays this run has data for */
  options: ForecastLayerOption[];
  /** GeoJSON for each overlay (floodplain only once it has been fetched) */
  data: Record<ForecastOverlayId, GeoJSON.FeatureCollection | null>;
  floodplainState: 'idle' | 'loading' | 'failed';
  /** How many available overlays are switched on */
  activeCount: number;
  /** e.g. "Wind swaths · Facilities", or "None shown" */
  summary: string;
}

const DEFAULT_SHOWN: Record<ForecastOverlayId, boolean> = {
  track: true,
  swaths: true,
  rings: false,
  facilities: true,
  floodplain: false,
  priority: false,
};

/**
 * The state behind a Rapid Exposure Forecast's map overlays, shared by the
 * switches in Map Controls and the layers drawn on the map. The floodplain
 * layer is several MB, so it is fetched the first time it is switched on.
 */
export function useForecastLayers(
  exposure: ForecastExposure | null,
  countryCode: CountryCode,
  /** The areas with their operational priority, for the outline layer */
  priorityFeatures: GeoJSON.FeatureCollection | null = null
): ForecastLayerControls | null {
  const layers = exposure?.layers ?? null;
  const floodplainRowId = layers?.floodplainRowId ?? null;
  const [shown, setShown] = useState(DEFAULT_SHOWN);
  const [floodplain, setFloodplain] = useState<GeoJSON.FeatureCollection | null>(null);
  const [floodplainState, setFloodplainState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const floodplainRequested = useRef(false);

  // A different forecast starts from its defaults and must not keep the
  // previous forecast's multi-megabyte floodplain geometry.
  useEffect(() => {
    floodplainRequested.current = false;
    setShown(DEFAULT_SHOWN);
    setFloodplain(null);
    setFloodplainState('idle');
  }, [countryCode, floodplainRowId]);

  useEffect(() => {
    if (!shown.floodplain || floodplainRequested.current || !floodplainRowId) return;
    floodplainRequested.current = true;
    setFloodplainState('loading');
    const controller = new AbortController();
    void fetchPartnerRiskInformationGeometry(countryCode, floodplainRowId, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setFloodplain(result);
        setFloodplainState(result ? 'idle' : 'failed');
      })
      .catch(() => setFloodplainState('failed'));
    return () => controller.abort();
  }, [shown.floodplain, floodplainRowId, countryCode]);

  const toggle = useCallback(
    (id: ForecastOverlayId) => setShown(current => ({ ...current, [id]: !current[id] })),
    []
  );

  return useMemo(() => {
    if (!exposure || !layers) return null;
    const facilityCount = exposure.facilities.length;
    const floodplainFacilities = exposure.facilities.filter(f => f.inFloodplain).length;
    const all: ForecastLayerOption[] = [
      {
        id: 'track',
        label:
          layers.cycloneTrackSource === 'run'
            ? 'Rapid Exposure Forecast input track'
            : 'Forecast track',
        short: 'Track',
        available: !!layers.cycloneTrack,
        note:
          layers.cycloneTrackSource === 'run'
            ? 'The exact track used for this forecast run'
            : 'The forecast track linked to this event (the run kept no copy of its own)',
      },
      {
        id: 'swaths',
        label: 'Forecast wind swaths',
        short: 'Wind swaths',
        available: !!layers.windSwaths,
      },
      {
        id: 'facilities',
        label: `Facilities (${facilityCount})`,
        short: 'Facilities',
        available: !!layers.facilities && facilityCount > 0,
        note: floodplainFacilities
          ? `${floodplainFacilities} in floodplains (blue ring)`
          : undefined,
      },
      {
        id: 'floodplain',
        label: 'Floodplain exposure',
        short: 'Floodplains',
        available: !!layers.floodplainRowId,
        note:
          floodplainState === 'loading'
            ? 'Loading…'
            : floodplainState === 'failed'
              ? 'Couldn’t load'
              : undefined,
      },
      {
        id: 'priority',
        label: 'Response priority (preliminary)',
        short: 'Priority',
        available: !!priorityFeatures,
        note: 'Outlines each area Red / Amber / Green. See Operational priority for why.',
      },
      {
        id: 'rings',
        label: 'Distance from track (25 km rings)',
        short: 'Distance rings',
        available: !!layers.trackDistance,
      },
    ];
    const options = all.filter(option => option.available);
    if (options.length === 0) return null;
    const active = options.filter(option => shown[option.id]);
    return {
      shown,
      toggle,
      options,
      data: {
        track: layers.cycloneTrack,
        swaths: layers.windSwaths,
        rings: layers.trackDistance,
        facilities: layers.facilities,
        floodplain,
        priority: priorityFeatures,
      },
      floodplainState,
      activeCount: active.length,
      summary: active.length > 0 ? active.map(option => option.short).join(' · ') : 'None shown',
    };
  }, [exposure, layers, shown, toggle, floodplain, floodplainState, priorityFeatures]);
}
