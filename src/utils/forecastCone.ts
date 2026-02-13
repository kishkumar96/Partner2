/**
 * Generate forecast cone geometry to visualize cyclone path uncertainty
 * Following NOAA/NHC standards for tropical cyclone forecast visualization
 */

import { CycloneForecastPoint } from './cycloneAnimationLoader';

export interface ForecastConeGeometry {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    };
    properties: {
      time: string;
      uncertainty: number;
    };
  }[];
}

/**
 * Generate forecast cone polygon based on track uncertainty
 * Uses the uncertainty field (in km) to create expanding cone
 */
export function generateForecastCone(
  forecastPoints: CycloneForecastPoint[]
): ForecastConeGeometry {
  if (!forecastPoints || forecastPoints.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }

  const features: ForecastConeGeometry['features'] = [];

  // Generate cone segments between consecutive points
  for (let i = 0; i < forecastPoints.length - 1; i++) {
    const point = forecastPoints[i];
    const nextPoint = forecastPoints[i + 1];
    
    // Uncertainty in km - convert to degrees (rough approximation: 1° ≈ 111km)
    const uncertaintyDeg = point.uncertainty / 111;
    const nextUncertaintyDeg = nextPoint.uncertainty / 111;
    
    // Create cone segment (trapezoid shape)
    const leftOffset = calculatePerpendicularOffset(
      point.longitude, point.latitude,
      nextPoint.longitude, nextPoint.latitude,
      -uncertaintyDeg
    );
    
    const rightOffset = calculatePerpendicularOffset(
      point.longitude, point.latitude,
      nextPoint.longitude, nextPoint.latitude,
      uncertaintyDeg
    );
    
    const nextLeftOffset = calculatePerpendicularOffset(
      point.longitude, point.latitude,
      nextPoint.longitude, nextPoint.latitude,
      -nextUncertaintyDeg
    );
    
    const nextRightOffset = calculatePerpendicularOffset(
      point.longitude, point.latitude,
      nextPoint.longitude, nextPoint.latitude,
      nextUncertaintyDeg
    );
    
    // Create polygon coordinates (trapezoid)
    const coordinates = [[
      [point.longitude + leftOffset[0], point.latitude + leftOffset[1]],
      [point.longitude + rightOffset[0], point.latitude + rightOffset[1]],
      [nextPoint.longitude + nextRightOffset[0], nextPoint.latitude + nextRightOffset[1]],
      [nextPoint.longitude + nextLeftOffset[0], nextPoint.latitude + nextLeftOffset[1]],
      [point.longitude + leftOffset[0], point.latitude + leftOffset[1]], // Close the polygon
    ]];
    
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates,
      },
      properties: {
        time: point.timeString,
        uncertainty: point.uncertainty,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Calculate perpendicular offset for cone edges
 */
function calculatePerpendicularOffset(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  distance: number
): [number, number] {
  // Calculate direction vector
  const dx = lon2 - lon1;
  const dy = lat2 - lat1;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length === 0) return [0, 0];
  
  // Perpendicular vector (rotate 90°)
  const perpX = -dy / length;
  const perpY = dx / length;
  
  return [perpX * distance, perpY * distance];
}

/**
 * Generate simplified cone outline (outer boundary only)
 */
export function generateForecastConeOutline(
  forecastPoints: CycloneForecastPoint[]
): GeoJSON.Feature<GeoJSON.LineString> {
  if (!forecastPoints || forecastPoints.length < 2) {
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [],
      },
      properties: {},
    };
  }

  const leftBoundary: [number, number][] = [];
  const rightBoundary: [number, number][] = [];

  // Calculate both boundaries
  for (let i = 0; i < forecastPoints.length - 1; i++) {
    const point = forecastPoints[i];
    const nextPoint = forecastPoints[i + 1];
    
    const uncertaintyDeg = point.uncertainty / 111;
    
    const leftOffset = calculatePerpendicularOffset(
      point.longitude, point.latitude,
      nextPoint.longitude, nextPoint.latitude,
      -uncertaintyDeg
    );
    
    const rightOffset = calculatePerpendicularOffset(
      point.longitude, point.latitude,
      nextPoint.longitude, nextPoint.latitude,
      uncertaintyDeg
    );
    
    leftBoundary.push([point.longitude + leftOffset[0], point.latitude + leftOffset[1]]);
    rightBoundary.push([point.longitude + rightOffset[0], point.latitude + rightOffset[1]]);
  }

  // Add final point
  const lastPoint = forecastPoints[forecastPoints.length - 1];
  const lastUncertaintyDeg = lastPoint.uncertainty / 111;
  leftBoundary.push([lastPoint.longitude - lastUncertaintyDeg, lastPoint.latitude]);
  rightBoundary.push([lastPoint.longitude + lastUncertaintyDeg, lastPoint.latitude]);

  // Combine into single outline: left boundary + reversed right boundary
  const outline = [...leftBoundary, ...rightBoundary.reverse(), leftBoundary[0]];

  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: outline,
    },
    properties: {
      type: 'forecast-cone',
    },
  };
}
