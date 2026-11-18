import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPartnerRiskInformationGeometry } from '@/utils/realDataLoader';
import type { ForecastExposure } from '@/utils/forecastExposure';
import type { CountryCode } from '@/types/thredds';
import {
  releaseSteps,
  selectAdvisoryReleases,
  type AdvisoryReleases,
  type ReleaseStep,
} from '@/utils/advisoryReleases';
import {
  buildWindRadiiAt,
  windRadiiSteps,
  windRadiiStepLabel,
  type WindRadiiPoint,
  type WindRadiiShape,
} from '@/utils/windRadiiOverlay';
import {
  buildTrackTimeLabels,
  COUNTRY_TIME_ZONES,
  timeZoneName,
  type TimeZoneMode,
  type TrackTimePoint,
} from '@/utils/trackTimeLabels';

export type ForecastOverlayId =
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

export interface ForecastLayerOption {
  id: ForecastOverlayId;
  label: string;
  /** Short name for the collapsed summary, e.g. "Wind swaths" */
  short: string;
  available: boolean;
  /** Shown but cannot be switched on, with `note` saying why */
  disabled?: boolean;
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
  /** Whether date and time labels are in UTC or the country's own time */
  /** The storm's advisories, oldest first, for the release scrubber (empty with fewer than two) */
  releaseSteps: ReleaseStep[];
  /** The wind-radii time control: which advisory point's rings are drawn, and how */
  windRadii: {
    /** One label per point with radii, oldest first; empty when the advisory gave none */
    steps: string[];
    step: number;
    setStep: (step: number) => void;
    shape: WindRadiiShape;
    setShape: (shape: WindRadiiShape) => void;
  };
  timeZoneMode: TimeZoneMode;
  setTimeZoneMode: (mode: TimeZoneMode) => void;
  /** "UTC" or e.g. "UTC+13", for the switch and legend */
  timeZoneName: string;
}

/** What the advisory and time-label overlays are drawn from. */
export interface ForecastLayerExtras {
  /** The start of every advisory of the country's storms */
  advisoryReleases: AdvisoryReleases | null;
  /** The advisory on screen (its start point is highlighted) */
  activeRunId: string | null;
  /** The shown run's track points, with times */
  trackPoints: Array<TrackTimePoint & Partial<WindRadiiPoint>> | null;
}

const DEFAULT_SHOWN: Record<ForecastOverlayId, boolean> = {
  track: true,
  swaths: true,
  rings: false,
  facilities: true,
  floodplain: false,
  priority: false,
  origins: true,
  releases: true,
  times: true,
  radii: true,
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
  priorityFeatures: GeoJSON.FeatureCollection | null = null,
  extras: ForecastLayerExtras | null = null
): ForecastLayerControls | null {
  const layers = exposure?.layers ?? null;
  const floodplainRowId = layers?.floodplainRowId ?? null;
  const [shown, setShown] = useState(DEFAULT_SHOWN);
  const [floodplain, setFloodplain] = useState<GeoJSON.FeatureCollection | null>(null);
  const [floodplainState, setFloodplainState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const floodplainRequested = useRef(false);
  const [timeZoneMode, setTimeZoneMode] = useState<TimeZoneMode>('utc');

  const releases = useMemo(
    () => selectAdvisoryReleases(extras?.advisoryReleases ?? null, extras?.activeRunId ?? null),
    [extras?.advisoryReleases, extras?.activeRunId]
  );
  const timeLabels = useMemo(
    () => buildTrackTimeLabels(extras?.trackPoints, { mode: timeZoneMode, countryCode }),
    [extras?.trackPoints, timeZoneMode, countryCode]
  );
  const radiiPoints = useMemo(
    () => windRadiiSteps(extras?.trackPoints as WindRadiiPoint[] | null | undefined),
    [extras?.trackPoints]
  );
  const [radiiStep, setRadiiStep] = useState(0);
  const [radiiShape, setRadiiShape] = useState<WindRadiiShape>('sector');
  const radiiIndex = Math.min(radiiStep, Math.max(0, radiiPoints.length - 1));
  const windRadii = useMemo(
    () => buildWindRadiiAt(radiiPoints[radiiIndex], radiiShape),
    [radiiPoints, radiiIndex, radiiShape]
  );
  const zoneName = useMemo(
    () => timeZoneName(timeZoneMode, countryCode),
    [timeZoneMode, countryCode]
  );

  const radiiLabels = useMemo(
    () =>
      radiiPoints.map(point =>
        windRadiiStepLabel(
          point.time,
          timeZoneMode === 'local' ? COUNTRY_TIME_ZONES[countryCode] : null,
          zoneName
        )
      ),
    [radiiPoints, timeZoneMode, countryCode, zoneName]
  );

  // A different forecast starts from its defaults and must not keep the
  // previous forecast's multi-megabyte floodplain geometry.
  useEffect(() => {
    floodplainRequested.current = false;
    setShown(DEFAULT_SHOWN);
    setRadiiStep(0);
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
    all.push(
      {
        id: 'origins',
        label: 'Start of each advisory',
        short: 'Advisory starts',
        available: !!releases,
        note: 'Where the storm was when each advisory was issued. Click one to open it.',
      },
      {
        id: 'releases',
        label: 'Earlier forecast tracks',
        short: 'Earlier tracks',
        available: !!releases && releases.tracks.features.length > 0,
        note: 'Each earlier advisory’s whole track, fainter the older it is.',
      },
      {
        id: 'times',
        label: 'Dates and times along the track',
        short: 'Track times',
        available: !!timeLabels,
        note: 'Hour labels every 6 hours, and a marker at each midnight where the date changes.',
      },
      {
        id: 'radii',
        label: 'Wind radii by quadrant',
        short: 'Wind radii',
        available: !!extras?.trackPoints?.length,
        disabled: radiiPoints.length === 0,
        note:
          radiiPoints.length === 0
            ? 'This advisory gave no wind radii, so there is nothing to draw.'
            : 'How far gale (34 kt), storm (48 kt) and hurricane (64 kt) winds reach in each quadrant, at the time chosen below. Each is the farthest reach within its quadrant.',
      }
    );
    const options = all.filter(option => option.available);
    if (options.length === 0) return null;
    const active = options.filter(option => shown[option.id] && !option.disabled);
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
        origins: releases?.origins ?? null,
        releases: releases && releases.tracks.features.length > 0 ? releases.tracks : null,
        times: timeLabels,
        radii: windRadii,
      },
      floodplainState,
      activeCount: active.length,
      summary: active.length > 0 ? active.map(option => option.short).join(' · ') : 'None shown',
      releaseSteps: releaseSteps(releases),
      windRadii: {
        steps: radiiLabels,
        step: radiiIndex,
        setStep: setRadiiStep,
        shape: radiiShape,
        setShape: setRadiiShape,
      },
      timeZoneMode,
      setTimeZoneMode,
      timeZoneName: zoneName,
    };
  }, [
    exposure,
    layers,
    shown,
    toggle,
    floodplain,
    floodplainState,
    priorityFeatures,
    releases,
    timeLabels,
    windRadii,
    radiiPoints,
    radiiLabels,
    radiiIndex,
    radiiShape,
    extras?.trackPoints,
    timeZoneMode,
    zoneName,
  ]);
}
