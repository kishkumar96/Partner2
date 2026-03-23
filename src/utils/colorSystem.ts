import { CountryCode } from '@/types/thredds';

/**
 * Unified Color System for Pacific Disaster Dashboard
 *
 * This module defines all color palettes used across the application to ensure
 * consistency between map layers, legends, and UI components.
 */

// ============================================
// CATEGORICAL COLORS - Hazard Types
// ============================================

/**
 * Categorical hazard colors - used for hazard type identification
 * These are distinct, accessible colors for different hazard categories
 */
export const HAZARD_CATEGORICAL_COLORS = {
  wind: '#3b82f6', // Blue - primary wind hazard
  'tropical-cyclone': '#3b82f6', // Blue - tropical cyclone (same as wind)
  inundation: '#0891b2', // Cyan - flooding/inundation
  'coastal-flooding': '#0891b2', // Cyan - coastal flooding
  'fluvial-flooding': '#06b6d4', // Light cyan - river flooding
  earthquake: '#a855f7', // Purple - seismic
  tsunami: '#8b5cf6', // Violet - tsunami
  volcanic: '#ef4444', // Red - volcanic
  landslide: '#f59e0b', // Amber - landslide
  drought: '#eab308', // Yellow - drought
  wildfire: '#dc2626', // Dark red - wildfire
  storm: '#6366f1', // Indigo - general storm
  unknown: '#9ca3af', // Gray - unknown/unclassified
} as const;

// ============================================
// SEQUENTIAL COLORS - Continuous Metrics
// ============================================

/**
 * Sequential color scale for Economic Loss (USD)
 * Subtle, desaturated colors for professional choropleth overlays
 * Green (minimal) → Yellow → Orange → Red (catastrophic)
 *
 * World-class design: Low saturation for better basemap visibility
 * Aligned with FEMA damage assessment categories:
 * - Minimal: < $1M (pale green)
 * - Low: $1M - $5M (pale yellow)
 * - Moderate: $5M - $10M (light yellow)
 * - High: $10M - $20M (muted orange)
 * - Severe: $20M - $50M (muted red)
 * - Catastrophic: > $50M (deep red)
 */
export const LOSS_SEQUENTIAL_COLORS = [
  { threshold: 0, color: '#e8f5e9', label: 'Minimal' }, // Very pale green
  { threshold: 1000000, color: '#fff9c4', label: 'Low' }, // Pale yellow
  { threshold: 5000000, color: '#ffe082', label: 'Moderate' }, // Light yellow
  { threshold: 10000000, color: '#ffcc80', label: 'High' }, // Muted peach
  { threshold: 20000000, color: '#ef9a9a', label: 'Severe' }, // Muted red
  { threshold: 50000000, color: '#c62828', label: 'Catastrophic' }, // Deep red
] as const;

// Samoa (TC Gita) has much lower regional losses than the other country datasets.
// Use tighter class breaks so the choropleth shows meaningful contrast.
export const SAMOA_LOSS_SEQUENTIAL_COLORS = [
  { threshold: 0, color: '#e8f5e9', label: 'Minimal' },
  { threshold: 100000, color: '#fff9c4', label: 'Low' },
  { threshold: 300000, color: '#ffe082', label: 'Moderate' },
  { threshold: 700000, color: '#ffcc80', label: 'High' },
  { threshold: 1500000, color: '#ef9a9a', label: 'Severe' },
  { threshold: 3000000, color: '#c62828', label: 'Catastrophic' },
] as const;

/**
 * Sequential color scale for Wind Speed (km/h)
 * Subtle, desaturated cool-to-warm progression for professional overlays
 * Gray → Blue → Yellow → Orange → Red → Purple
 *
 * World-class design: Muted colors for better basemap context
 * Aligned with Saffir-Simpson Hurricane Wind Scale:
 * - Below TS: < 63 km/h (pale gray)
 * - Tropical Depression/Storm: 63-100 km/h (pale blue)
 * - Category 1-2: 100-154 km/h (pale yellow)
 * - Category 3: 155-177 km/h (muted orange)
 * - Category 4: 178-209 km/h (muted red)
 * - Category 5: > 210 km/h (deep purple)
 */
export const WIND_SEQUENTIAL_COLORS = [
  { threshold: 0, color: '#f5f5f5', label: 'Below TS' }, // Pale gray
  { threshold: 63, color: '#bbdefb', label: 'Cat 1 / TS' }, // Pale blue
  { threshold: 100, color: '#fff9c4', label: 'Cat 2' }, // Pale yellow
  { threshold: 120, color: '#ffe082', label: 'Cat 3' }, // Light yellow
  { threshold: 140, color: '#ffcc80', label: 'Cat 3 - Severe' }, // Muted peach
  { threshold: 165, color: '#ef9a9a', label: 'Cat 4' }, // Muted red
  { threshold: 200, color: '#9575cd', label: 'Cat 5 - Extreme' }, // Muted purple
] as const;

// ============================================
// COLOR SCALE GENERATORS
// ============================================

/**
 * Generate MapLibre interpolation expression for economic loss
 * @returns MapLibre style expression
 */
export function getLossSequentialColors(countryCode?: CountryCode | null) {
  if (countryCode === 'WS') {
    return SAMOA_LOSS_SEQUENTIAL_COLORS;
  }
  return LOSS_SEQUENTIAL_COLORS;
}

export function createLossColorExpression(countryCode?: CountryCode | null): any {
  const scale = getLossSequentialColors(countryCode);
  return [
    'interpolate',
    ['linear'],
    ['get', 'Total_Loss'],
    ...scale.flatMap(({ threshold, color }) => [threshold, color]),
  ];
}

/**
 * Generate MapLibre interpolation expression for wind speed
 * @returns MapLibre style expression
 */
export function createWindColorExpression(): any {
  return [
    'interpolate',
    ['linear'],
    ['get', 'Max_Wind_Gusts'],
    ...WIND_SEQUENTIAL_COLORS.flatMap(({ threshold, color }) => [threshold, color]),
  ];
}

/**
 * Get categorical color for a hazard type
 * @param hazardId - Hazard identifier
 * @returns Hex color code
 */
export function getHazardColor(hazardId: string): string {
  return (
    HAZARD_CATEGORICAL_COLORS[hazardId as keyof typeof HAZARD_CATEGORICAL_COLORS] ||
    HAZARD_CATEGORICAL_COLORS.unknown
  );
}

// ============================================
// OPACITY SCALES
// ============================================

/**
 * Base opacity values for map layers
 * World-class design: Prioritize basemap visibility with ultra-subtle overlays
 */
export const LAYER_OPACITY = {
  district: {
    fill: 0.12, // Ultra-subtle fill (reduced from 0.35)
    fillHover: 0.25, // Hover highlight (reduced from 0.5)
    fillSelected: 0.4, // Selected emphasis (reduced from 0.65)
    outline: 0.18, // District separators should stay subordinate to the fill
    outlineHover: 0.95, // Clear hover feedback (reduced from 1.0)
  },
  regional: {
    fill: 0.65, // Base fill for loss mode - INCREASED for better visibility
    fillSelected: 0.85, // Selected region in loss mode
    fillWind: 0.5, // Base fill for wind mode - INCREASED for better visibility
    fillWindSelected: 0.7, // Selected region in wind mode
    outline: 0.16, // Default regional boundaries should be barely perceptible
  },
  heatmap: {
    base: 0.4, // Reduced for better visual hierarchy
    peak: 0.8, // Peak emphasis (reduced from 0.9)
  },
} as const;

/**
 * Create scale-dependent opacity expression for districts
 * Higher zoom = more visible fill for detail work
 * Lower zoom = more transparent for overview
 */
export function createScaleDependentOpacity(baseOpacity: number): any {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    5,
    baseOpacity * 0.6, // Far out - very transparent
    8,
    baseOpacity, // Medium zoom - base opacity
    12,
    baseOpacity * 1.2, // Close in - more visible (capped at reasonable max)
  ];
}

/**
 * Create regional fill opacity expression
 * Uses unified opacity values from LAYER_OPACITY
 * @param mode - Map visualization mode ("wind" or "loss")
 * @param selectedRegion - Currently selected region ID
 * @returns MapLibre style expression for fill-opacity
 */
export function createRegionalFillOpacity(
  mode: 'wind' | 'loss',
  selectedRegion: string | null,
  scale: number = 1
): any {
  const isWindMode = mode === 'wind';
  const baseOpacity =
    (isWindMode ? LAYER_OPACITY.regional.fillWind : LAYER_OPACITY.regional.fill) * scale;
  const selectedOpacity =
    (isWindMode ? LAYER_OPACITY.regional.fillWindSelected : LAYER_OPACITY.regional.fillSelected) *
    scale;

  return [
    'case',
    [
      'any',
      ['==', ['to-string', ['coalesce', ['get', 'Region.ID'], '']], selectedRegion || ''],
      ['==', ['to-string', ['coalesce', ['get', 'Region_ID'], '']], selectedRegion || ''],
      ['==', ['to-string', ['coalesce', ['get', 'Region.Region'], '']], selectedRegion || ''],
      ['==', ['to-string', ['coalesce', ['get', 'Region'], '']], selectedRegion || ''],
    ],
    selectedOpacity,
    baseOpacity,
  ];
}

/**
 * Create regional line color expression for selection highlighting
 * @param selectedRegion - Currently selected region ID
 * @returns MapLibre style expression for line-color
 */
export function createRegionalLineColor(selectedRegion: string | null): any {
  return [
    'case',
    [
      'any',
      ['==', ['to-string', ['coalesce', ['get', 'Region.ID'], '']], selectedRegion || ''],
      ['==', ['to-string', ['coalesce', ['get', 'Region_ID'], '']], selectedRegion || ''],
      ['==', ['to-string', ['coalesce', ['get', 'Region.Region'], '']], selectedRegion || ''],
      ['==', ['to-string', ['coalesce', ['get', 'Region'], '']], selectedRegion || ''],
    ],
    'rgba(241, 245, 249, 0.85)', // Soft light edge for selected
    'rgba(100, 116, 139, 0.22)', // Neutral slate divider for default
  ];
}

/**
 * Create regional line width expression for selection highlighting
 * @param selectedRegion - Currently selected region ID
 * @returns MapLibre style expression for line-width
 */
export function createRegionalLineWidth(selectedRegion: string | null): any {
  return [
    'case',
    [
      'any',
      ['==', ['to-string', ['coalesce', ['get', 'Region.ID'], '']], selectedRegion || ''],
      ['==', ['to-string', ['coalesce', ['get', 'Region_ID'], '']], selectedRegion || ''],
      ['==', ['to-string', ['coalesce', ['get', 'Region.Region'], '']], selectedRegion || ''],
      ['==', ['to-string', ['coalesce', ['get', 'Region'], '']], selectedRegion || ''],
    ],
    1.2, // Enough to signal selection without becoming the main signal
    0.45, // Default width should be structural only
  ];
}

// ============================================
// ACCESSIBILITY HELPERS
// ============================================

/**
 * Ensure color has sufficient contrast for accessibility
 * @param color - Hex color code
 * @returns Adjusted color with better contrast
 */
export function ensureContrast(color: string): string {
  // For now, return original - could implement luminance calculation
  // and adjustment if needed for WCAG AA compliance
  return color;
}

/**
 * Get text color (light/dark) based on background color
 * @param backgroundColor - Hex color code
 * @returns "light" or "dark"
 */
export function getTextColorForBackground(backgroundColor: string): 'light' | 'dark' {
  // Simple heuristic - could be improved with proper luminance calculation
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? 'dark' : 'light';
}
