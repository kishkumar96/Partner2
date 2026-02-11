/**
 * Cyclone Story Beat Detection
 * Automatically identifies meaningful milestones in cyclone forecast data
 */

import { CycloneForecastPoint } from './cycloneAnimationLoader';

export type StoryBeatType = 
  | 'peak-intensity'
  | 'rapid-intensification'
  | 'category-upgrade'
  | 'closest-approach'
  | 'peak-uncertainty';

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

// Vanuatu center coordinates (Port Vila area)
const VANUATU_CENTER = { lat: -17.7333, lon: 168.3167 };

/**
 * Calculate Haversine distance between two points (in km)
 */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get category name for display
 */
const CATEGORY_NAME_MAP: { [key: number]: string } = {
  0: 'Tropical Depression',
  1: 'Category 1',
  2: 'Category 2',
  3: 'Category 3',
  4: 'Category 4',
  5: 'Category 5',
};

function getCategoryName(category: number): string {
  const mapped = CATEGORY_NAME_MAP[category];
  return mapped !== undefined ? mapped : `Category ${category}`;
}

/**
 * Detect story beats from cyclone forecast data
 */
export function detectStoryBeats(forecastTrack: CycloneForecastPoint[]): StoryBeat[] {
  if (forecastTrack.length === 0) return [];

  const beats: StoryBeat[] = [];

  // 1. Peak Intensity
  let maxWindIndex = 0;
  let maxWind = forecastTrack[0].meanWind;
  let minPressure = forecastTrack[0].pressure;
  
  for (let i = 1; i < forecastTrack.length; i++) {
    const point = forecastTrack[i];
    if (point.meanWind > maxWind || 
        (point.meanWind === maxWind && point.pressure < minPressure)) {
      maxWindIndex = i;
      maxWind = point.meanWind;
      minPressure = point.pressure;
    }
  }

  const peakPoint = forecastTrack[maxWindIndex];
  beats.push({
    id: 'peak-intensity',
    index: maxWindIndex,
    time: peakPoint.time,
    title: 'Peak Intensity',
    description: `Maximum sustained winds of ${Math.round(peakPoint.meanWind)} kt with pressure at ${Math.round(peakPoint.pressure)} hPa`,
    severity: 5,
    type: 'peak-intensity',
    metrics: {
      wind: peakPoint.meanWind,
      pressure: peakPoint.pressure,
      category: peakPoint.category,
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
    while (
      priorIndex > 0 &&
      forecastTrack[priorIndex].time.getTime() > targetTimeMs
    ) {
      priorIndex--;
    }

    const sixHoursPrior = forecastTrack[priorIndex];
    const timeDiffHours =
      (currentTimeMs - sixHoursPrior.time.getTime()) / (60 * 60 * 1000);

    // Skip if we don't have a point reasonably close to 6 hours prior
    if (
      timeDiffHours < 6 - sixHourToleranceHours ||
      timeDiffHours > 6 + sixHourToleranceHours
    ) {
      continue;
    }

    const windIncrease = current.meanWind - sixHoursPrior.meanWind;
    const pressureDrop = sixHoursPrior.pressure - current.pressure;

    if (windIncrease >= 25 || pressureDrop >= 20) {
      beats.push({
        id: `rapid-intensification-${i}`,
        index: i,
        time: current.time,
        title: '⚡ Rapid Intensification',
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
          wind: current.meanWind,
          pressure: current.pressure,
          windChange: windIncrease,
          pressureChange: pressureDrop,
        },
      });
    }
  }

  // 3. Category Upgrades (Cat 1, Cat 3, Cat 5)
  const categoryThresholds = [1, 3, 5];
  const seenCategories = new Set<number>();
  
  for (let i = 0; i < forecastTrack.length; i++) {
    const point = forecastTrack[i];
    for (const threshold of categoryThresholds) {
      if (point.category >= threshold && !seenCategories.has(threshold)) {
        seenCategories.add(threshold);
        const catName = getCategoryName(threshold);
        beats.push({
          id: `category-${threshold}`,
          index: i,
          time: point.time,
          title: `📈 ${catName} Cyclone`,
          description: `Storm upgraded to ${catName} with ${Math.round(point.meanWind)} kt winds`,
          severity: threshold === 5 ? 5 : threshold === 3 ? 4 : 3,
          type: 'category-upgrade',
          metrics: {
            category: threshold,
            wind: point.meanWind,
            pressure: point.pressure,
          },
        });
        break; // Only one upgrade per timestep
      }
    }
  }

  // 4. Closest Approach to Vanuatu
  let closestIndex = 0;
  let minDistance = haversineDistance(
    forecastTrack[0].latitude,
    forecastTrack[0].longitude,
    VANUATU_CENTER.lat,
    VANUATU_CENTER.lon
  );

  for (let i = 1; i < forecastTrack.length; i++) {
    const point = forecastTrack[i];
    const distance = haversineDistance(
      point.latitude,
      point.longitude,
      VANUATU_CENTER.lat,
      VANUATU_CENTER.lon
    );
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = i;
    }
  }

  const closestPoint = forecastTrack[closestIndex];
  beats.push({
    id: 'closest-approach',
    index: closestIndex,
    time: closestPoint.time,
    title: '🎯 Closest Approach',
    description: `Cyclone passes ${Math.round(minDistance)} km from Vanuatu at ${getCategoryName(closestPoint.category)} strength`,
    severity: minDistance < 100 ? 5 : minDistance < 200 ? 4 : 3,
    type: 'closest-approach',
    metrics: {
      distance: minDistance,
      wind: closestPoint.meanWind,
      category: closestPoint.category,
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
    title: '📊 Peak Uncertainty',
    description: `Highest forecast uncertainty at ${Math.round(maxUncertainty)} km radius`,
    severity: 2,
    type: 'peak-uncertainty',
    metrics: {
      uncertainty: maxUncertainty,
      wind: uncertainPoint.meanWind,
    },
  });

  // Sort by index
  beats.sort((a, b) => a.index - b.index);

  // De-duplicate beats within 1-2 steps (keep higher severity)
  const dedupedBeats: StoryBeat[] = [];

  if (beats.length === 0) {
    return dedupedBeats;
  }

  // Since beats are sorted by index, we can form clusters of overlapping beats
  let cluster: StoryBeat[] = [];

  const flushCluster = () => {
    if (cluster.length === 0) return;
    // Select the beat with the highest severity within this cluster.
    // If multiple have the same severity, keep the earliest in the cluster
    // (which also has the lowest index due to sorting).
    let best = cluster[0];
    for (let i = 1; i < cluster.length; i++) {
      const candidate = cluster[i];
      if (candidate.severity > best.severity) {
        best = candidate;
      }
    }
    dedupedBeats.push(best);
    cluster = [];
  };

  for (let i = 0; i < beats.length; i++) {
    const current = beats[i];

    if (cluster.length === 0) {
      cluster.push(current);
      continue;
    }

    const lastInCluster = cluster[cluster.length - 1];
    // If current beat is within 2 indices of the last beat in the cluster,
    // it belongs to the same overlapping cluster.
    if (Math.abs(current.index - lastInCluster.index) <= 2) {
      cluster.push(current);
    } else {
      // Current beat starts a new cluster; flush the previous one.
      flushCluster();
      cluster.push(current);
    }
  }

  // Flush the final cluster
  flushCluster();

  // Re-sort after deduplication (preserves existing behavior, even though
  // dedupedBeats should already be in order)
  dedupedBeats.sort((a, b) => a.index - b.index);

  return dedupedBeats;
}

/**
 * Get the next beat from current index
 */
export function getNextBeat(
  beats: StoryBeat[],
  currentIndex: number
): StoryBeat | null {
  return beats.find((b) => b.index > currentIndex) || null;
}

/**
 * Get the previous beat from current index
 */
export function getPreviousBeat(
  beats: StoryBeat[],
  currentIndex: number
): StoryBeat | null {
  for (let i = beats.length - 1; i >= 0; i--) {
    if (beats[i].index < currentIndex) {
      return beats[i];
    }
  }
  return null;
}

/**
 * Check if current index is at a beat (within 1 step tolerance)
 */
export function isAtBeat(
  beats: StoryBeat[],
  currentIndex: number
): StoryBeat | null {
  return beats.find((b) => Math.abs(b.index - currentIndex) <= 1) || null;
}
