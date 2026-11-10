import { useMemo } from 'react';
import { advisoryAge } from './forecastBriefing';
import { isForecastExposureRow, toArea, type ForecastExposure } from './forecastExposure';
import {
  countByLevel,
  prioritise,
  type PriorityLevel,
  type PriorityResult,
} from './responsePriority';
import { usePriorityThresholds } from './usePriorityThresholds';

export interface ResponsePriority {
  results: PriorityResult[];
  counts: Record<PriorityLevel, number>;
  thresholds: ReturnType<typeof usePriorityThresholds>['thresholds'];
  isCustom: boolean;
  update: ReturnType<typeof usePriorityThresholds>['update'];
  reset: ReturnType<typeof usePriorityThresholds>['reset'];
  /** Hours since the advisory was issued; null when unknown */
  ageHours: number | null;
  /** The areas as GeoJSON with their priority, for the map outline */
  features: GeoJSON.FeatureCollection | null;
}

/**
 * Operational priority for a forecast, at the finest level the run has: its
 * area features (area councils) when they carry exposure, else its provinces.
 * Thresholds are this country's own (see usePriorityThresholds).
 */
export function useResponsePriority(
  exposure: ForecastExposure | null,
  areaFeatures: GeoJSON.FeatureCollection | null,
  issuedAt: string | null | undefined,
  countryCode: string
): ResponsePriority | null {
  const { thresholds, isCustom, update, reset } = usePriorityThresholds(countryCode);

  return useMemo(() => {
    if (!exposure) return null;
    const ageHours = advisoryAge(issuedAt)?.hours ?? null;

    const fromFeatures = (areaFeatures?.features ?? [])
      .map(feature => {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const name = String(props['Region.Region'] ?? props.Region ?? '').trim();
        return name && isForecastExposureRow(props)
          ? { name, feature, area: toArea(props, name) }
          : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const useFeatures = fromFeatures.length > exposure.regions.length;
    const areas = useFeatures
      ? fromFeatures.map(({ name, area }) => ({ name, area }))
      : exposure.regions.map(area => ({ name: area.name, area }));
    const results = prioritise(areas, thresholds, ageHours);

    let features: GeoJSON.FeatureCollection | null = null;
    if (useFeatures) {
      const byName = new Map(results.map(result => [result.name, result]));
      features = {
        type: 'FeatureCollection',
        features: fromFeatures.map(({ name, feature }) => {
          const result = byName.get(name)!;
          return {
            ...feature,
            properties: {
              ...feature.properties,
              priority: result.level,
              priority_reasons: result.reasons.join(' | '),
            },
          };
        }),
      };
    }

    return {
      results,
      counts: countByLevel(results),
      thresholds,
      isCustom,
      update,
      reset,
      ageHours,
      features,
    };
  }, [exposure, areaFeatures, issuedAt, thresholds, isCustom, update, reset]);
}
