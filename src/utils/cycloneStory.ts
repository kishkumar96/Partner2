/**
 * Cyclone Story Beat Detection
 * Automatically identifies meaningful milestones in cyclone forecast data
 */

import { getCategoryLabel as getCategoryName } from '@/theme/cycloneScale';
import { formatCycloneMetric } from './cycloneCategory';
import { CycloneForecastPoint } from './cycloneAnimationLoader';
import { CountryCode } from '@/types/thredds';
import { ArrowUp, Cloud, Flame, MapPin, Wind, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type StoryBeatType =
  | 'peak-intensity'
  | 'rapid-intensification'
  | 'category-upgrade'
  | 'closest-approach'
  | 'peak-uncertainty';

export function getStoryBeatIcon(type: StoryBeatType): LucideIcon {
  switch (type) {
    case 'peak-intensity':
      return Flame;
    case 'rapid-intensification':
      return Zap;
    case 'category-upgrade':
      return ArrowUp;
    case 'closest-approach':
      return MapPin;
    case 'peak-uncertainty':
      return Cloud;
    default:
      return Wind;
  }
}

export interface StoryBeat {
  id: string;
  index: number;
  time: Date;
  title: string;
  description: string;
  severity: number; // 1-5, used for de-duplication priority
  type: StoryBeatType;
  metrics?: {
    wind?: number;
    pressure?: number;
    category?: number;
    distance?: number;
    uncertainty?: number;
    windChange?: number;
    pressureChange?: number;
  };
}

// Region center coordinates for closest approach detection
const REGION_CENTERS: Record<string, { lat: number; lon: number }> = {
  VU: { lat: -17.7333, lon: 168.3167 }, // Vanuatu - Port Vila
  WS: { lat: -13.8333, lon: -171.7667 }, // Samoa - Apia
  TO: { lat: -21.1789, lon: -175.1982 }, // Tonga - Nuku'alofa
  CK: { lat: -21.2067, lon: -159.7777 }, // Cook Islands - Avarua
};

// Default center (Vanuatu) for backwards compatibility
const VANUATU_CENTER = { lat: -17.7333, lon: 168.3167 };

/**
 * Calculate Haversine distance between two points (in km)
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get category name for display
 */
/**
 * Detect story beats from cyclone forecast data
 * @param forecastTrack - Array of cyclone forecast points
 * @param countryCode - Country code to determine closest approach center (VU, WS, TO, CK)
 * @param centerPoint - Optional override center point for closest approach
 */
export function detectStoryBeats(
  forecastTrack: CycloneForecastPoint[],
  countryCode?: CountryCode | null,
  centerPoint?: { lat: number; lon: number }
): StoryBeat[] {
  if (forecastTrack.length === 0) return [];

  // Determine center point: explicit override > country code > default
  const center = centerPoint || (countryCode && REGION_CENTERS[countryCode]) || VANUATU_CENTER;

  const beats: StoryBeat[] = [];

  // 1. Peak Intensity
  let maxWindIndex = 0;
  let maxWind = -Infinity;
  let minPressure = Infinity;

  for (let i = 0; i < forecastTrack.length; i++) {
    const point = forecastTrack[i];
    if (point.meanWind === null) continue;
    if (
      point.meanWind > maxWind ||
      (point.meanWind === maxWind && (point.pressure ?? Infinity) < minPressure)
    ) {
      maxWindIndex = i;
      maxWind = point.meanWind;
      minPressure = point.pressure ?? Infinity;
    }
  }

  const peakPoint = forecastTrack[maxWindIndex];
  if (Number.isFinite(maxWind))
    beats.push({
      id: 'peak-intensity',
      index: maxWindIndex,
      time: peakPoint.time,
      title: 'Peak Intensity',
      description: `Maximum sustained wind: ${formatCycloneMetric(peakPoint.meanWind, 'kt')}. Pressure: ${formatCycloneMetric(peakPoint.pressure, 'hPa')}.`,
      severity: 5,
      type: 'peak-intensity',
      metrics: {
        wind: peakPoint.meanWind ?? undefined,
        pressure: peakPoint.pressure ?? undefined,
        category: peakPoint.category ?? undefined,
      },
    });

  // 2. Rapid Intensification (6-hour window, ≥25 kt increase OR ≥20 hPa drop)
  //    Uses actual time differences rather than assuming 1-hour timesteps.
  const sixHoursInMs = 6 * 60 * 60 * 1000;
  const sixHourToleranceHours = 0.5; // allowable deviation from 6 hours

  for (let i = 1; i < forecastTrack.length; i++) {
    const current = forecastTrack[i];
    const currentTimeMs = current.time.getTime();
    const targetTimeMs = currentTimeMs - sixHoursInMs;

    // Find the point closest to 6 hours prior, without going later than the target time
    let priorIndex = i - 1;
    while (priorIndex > 0 && forecastTrack[priorIndex].time.getTime() > targetTimeMs) {
      priorIndex--;
    }

    const sixHoursPrior = forecastTrack[priorIndex];
    const timeDiffHours = (currentTimeMs - sixHoursPrior.time.getTime()) / (60 * 60 * 1000);

    // Skip if we don't have a point reasonably close to 6 hours prior
    if (timeDiffHours < 6 - sixHourToleranceHours || timeDiffHours > 6 + sixHourToleranceHours) {
      continue;
    }

    const windIncrease =
      current.meanWind != null && sixHoursPrior.meanWind != null
        ? current.meanWind - sixHoursPrior.meanWind
        : NaN;
    const pressureDrop =
      sixHoursPrior.pressure != null && current.pressure != null
        ? sixHoursPrior.pressure - current.pressure
        : NaN;

    if (windIncrease >= 25 || pressureDrop >= 20) {
      beats.push({
        id: `rapid-intensification-${i}`,
        index: i,
        time: current.time,
        title: 'Rapid Intensification',
        description:
          windIncrease >= 25
            ? `Winds increased by ${Math.round(
                windIncrease
              )} kt over ${timeDiffHours.toFixed(1)} hours`
            : `Pressure dropped ${Math.round(
                pressureDrop
              )} hPa over ${timeDiffHours.toFixed(1)} hours`,
        severity: 4,
        type: 'rapid-intensification',
        metrics: {
          wind: current.meanWind ?? undefined,
          pressure: current.pressure ?? undefined,
          windChange: windIncrease,
          pressureChange: pressureDrop,
        },
      });
    }
  }

  // Announce actual source timesteps, never fabricated intermediate categories.
  for (let i = 0; i < forecastTrack.length; i++) {
    const point = forecastTrack[i];
    const previous = forecastTrack[i - 1];
    if (point.category == null || point.category === previous?.category) continue;
    const upgraded =
      previous?.category != null &&
      point.category > previous.category &&
      point.classification?.scale === previous.classification?.scale;
    beats.push({
      id: `category-${point.category}-${i}`,
      index: i,
      time: point.time,
      title: `${getCategoryName(point.category)} ${upgraded ? 'Reached' : 'Recorded'}`,
      description: `${getCategoryName(point.category)} (${point.classification?.provenance ?? 'reported'}). Sustained wind: ${formatCycloneMetric(point.meanWind, 'kt')}`,
      severity: point.category >= 4 ? 5 : point.category >= 3 ? 4 : 3,
      type: 'category-upgrade',
      metrics: {
        category: point.category ?? undefined,
        wind: point.meanWind ?? undefined,
        pressure: point.pressure ?? undefined,
      },
    });
  }

  // 4. Closest Approach to specified center point
  let closestIndex = 0;
  let minDistance = haversineDistance(
    forecastTrack[0].latitude,
    forecastTrack[0].longitude,
    center.lat,
    center.lon
  );

  for (let i = 1; i < forecastTrack.length; i++) {
    const point = forecastTrack[i];
    const distance = haversineDistance(point.latitude, point.longitude, center.lat, center.lon);
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = i;
    }
  }

  const closestPoint = forecastTrack[closestIndex];

  // Helper to get region name
  const getRegionName = (code?: CountryCode | null): string => {
    const regionNames: Record<string, string> = {
      VU: 'Vanuatu',
      WS: 'Samoa',
      TO: 'Tonga',
      CK: 'Cook Islands',
    };
    return (code && regionNames[code]) || 'the region';
  };

  beats.push({
    id: 'closest-approach',
    index: closestIndex,
    time: closestPoint.time,
    title: 'Closest Approach',
    description: `Cyclone passes ${Math.round(minDistance)} km from ${getRegionName(countryCode)} at ${getCategoryName(closestPoint.category)}`,
    severity: minDistance < 100 ? 5 : minDistance < 200 ? 4 : 3,
    type: 'closest-approach',
    metrics: {
      distance: minDistance,
      wind: closestPoint.meanWind ?? undefined,
      category: closestPoint.category ?? undefined,
    },
  });

  // 5. Peak Uncertainty
  let maxUncertaintyIndex = 0;
  let maxUncertainty = forecastTrack[0].uncertainty;

  for (let i = 1; i < forecastTrack.length; i++) {
    if (forecastTrack[i].uncertainty > maxUncertainty) {
      maxUncertaintyIndex = i;
      maxUncertainty = forecastTrack[i].uncertainty;
    }
  }

  const uncertainPoint = forecastTrack[maxUncertaintyIndex];
  beats.push({
    id: 'peak-uncertainty',
    index: maxUncertaintyIndex,
    time: uncertainPoint.time,
    title: 'Peak Uncertainty',
    description: `Highest forecast uncertainty at ${Math.round(maxUncertainty)} km radius`,
    severity: 2,
    type: 'peak-uncertainty',
    metrics: {
      uncertainty: maxUncertainty,
      wind: uncertainPoint.meanWind ?? undefined,
    },
  });

  // Sort by index
  beats.sort((a, b) => a.index - b.index);

  // De-duplicate beats using time-based and type-based logic
  // Keeps beats if they are different types or separated by 6+ hours
  const dedupedBeats: StoryBeat[] = [];

  if (beats.length === 0) {
    return dedupedBeats;
  }

  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

  for (let i = 0; i < beats.length; i++) {
    const current = beats[i];

    // Check if we should keep this beat
    let shouldKeep = true;

    // Look back at recent beats to see if current is redundant
    for (let j = dedupedBeats.length - 1; j >= 0; j--) {
      const existing = dedupedBeats[j];

      // If beats are far apart in index (>5), stop checking
      if (current.index - existing.index > 5) break;

      // If different types, both can coexist
      if (current.type !== existing.type) continue;

      // Same type - check time separation
      const timeDiff = Math.abs(current.time.getTime() - existing.time.getTime());

      if (timeDiff < SIX_HOURS_MS) {
        // Too close in time - keep only higher severity
        if (current.severity > existing.severity) {
          // Replace existing with current
          dedupedBeats[j] = current;
        }
        // Either way, don't add current as a new beat
        shouldKeep = false;
        break;
      }
    }

    if (shouldKeep) {
      dedupedBeats.push(current);
    }
  }

  // Re-sort after deduplication
  dedupedBeats.sort((a, b) => a.index - b.index);

  return dedupedBeats;
}

/**
 * Get the next beat from current index
 */
export function getNextBeat(beats: StoryBeat[], currentIndex: number): StoryBeat | null {
  if (!beats || beats.length === 0 || typeof currentIndex !== 'number') return null;
  return beats.find(b => b.index > currentIndex) || null;
}

/**
 * Get the previous beat from current index
 */
export function getPreviousBeat(beats: StoryBeat[], currentIndex: number): StoryBeat | null {
  if (!beats || beats.length === 0 || typeof currentIndex !== 'number') return null;
  for (let i = beats.length - 1; i >= 0; i--) {
    if (beats[i].index < currentIndex) {
      return beats[i];
    }
  }
  return null;
}

/**
 * Check if current index is at a beat (within 1 step tolerance for consistency)
 */
export function isAtBeat(beats: StoryBeat[], currentIndex: number): StoryBeat | null {
  if (!beats || beats.length === 0 || typeof currentIndex !== 'number') return null;
  return beats.find(b => Math.abs(b.index - currentIndex) <= 1) || null;
}
