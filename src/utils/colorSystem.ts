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
  wind: "#3b82f6",           // Blue - primary wind hazard
  "tropical-cyclone": "#3b82f6", // Blue - tropical cyclone (same as wind)
  inundation: "#0891b2",     // Cyan - flooding/inundation
  "coastal-flooding": "#0891b2", // Cyan - coastal flooding
  "fluvial-flooding": "#06b6d4", // Light cyan - river flooding
  earthquake: "#a855f7",     // Purple - seismic
  tsunami: "#8b5cf6",        // Violet - tsunami
  volcanic: "#ef4444",       // Red - volcanic
  landslide: "#f59e0b",      // Amber - landslide
  drought: "#eab308",        // Yellow - drought
  wildfire: "#dc2626",       // Dark red - wildfire
  storm: "#6366f1",          // Indigo - general storm
  unknown: "#9ca3af",        // Gray - unknown/unclassified
} as const;

// ============================================
// SEQUENTIAL COLORS - Continuous Metrics
// ============================================

/**
 * Sequential color scale for Economic Loss (USD)
 * Green (minimal) → Yellow → Orange → Red (catastrophic)
 * 
 * Aligned with FEMA damage assessment categories:
 * - Minimal: < $1M (green)
 * - Low: $1M - $5M (light yellow)
 * - Moderate: $5M - $10M (yellow)
 * - High: $10M - $20M (orange)
 * - Severe: $20M - $50M (red)
 * - Catastrophic: > $50M (dark red)
 */
export const LOSS_SEQUENTIAL_COLORS = [
  { threshold: 0, color: "#dcfce7", label: "Minimal" },          // green-100
  { threshold: 1000000, color: "#fde047", label: "Low" },        // yellow-300
  { threshold: 5000000, color: "#facc15", label: "Moderate" },   // yellow-400
  { threshold: 10000000, color: "#fb923c", label: "High" },      // orange-400
  { threshold: 20000000, color: "#ef4444", label: "Severe" },    // red-500
  { threshold: 50000000, color: "#b91c1c", label: "Catastrophic" }, // red-700
] as const;

/**
 * Sequential color scale for Wind Speed (km/h)
 * Gray → Blue → Yellow → Orange → Red → Purple
 * 
 * Aligned with Saffir-Simpson Hurricane Wind Scale:
 * - Below TS: < 63 km/h (gray)
 * - Tropical Depression/Storm: 63-100 km/h (light blue)
 * - Category 1-2: 100-154 km/h (yellow)
 * - Category 3: 155-177 km/h (orange)
 * - Category 4: 178-209 km/h (red)
 * - Category 5: > 210 km/h (purple)
 */
export const WIND_SEQUENTIAL_COLORS = [
  { threshold: 0, color: "#e5e7eb", label: "Below TS" },         // gray-200
  { threshold: 63, color: "#7dd3fc", label: "Cat 1 / TS" },      // sky-300
  { threshold: 100, color: "#fde047", label: "Cat 2" },          // yellow-300
  { threshold: 120, color: "#facc15", label: "Cat 3" },          // yellow-400
  { threshold: 140, color: "#fb923c", label: "Cat 3 - Severe" }, // orange-400
  { threshold: 165, color: "#dc2626", label: "Cat 4" },          // red-600
  { threshold: 200, color: "#7c3aed", label: "Cat 5 - Extreme" }, // violet-600
] as const;

// ============================================
// COLOR SCALE GENERATORS
// ============================================

/**
 * Generate MapLibre interpolation expression for economic loss
 * @returns MapLibre style expression
 */
export function createLossColorExpression(): any {
  return [
    "interpolate",
    ["linear"],
    ["get", "Total_Loss"],
    ...LOSS_SEQUENTIAL_COLORS.flatMap(({ threshold, color }) => [threshold, color]),
  ];
}

/**
 * Generate MapLibre interpolation expression for wind speed
 * @returns MapLibre style expression
 */
export function createWindColorExpression(): any {
  return [
    "interpolate",
    ["linear"],
    ["get", "Max_Wind_Gusts"],
    ...WIND_SEQUENTIAL_COLORS.flatMap(({ threshold, color }) => [threshold, color]),
  ];
}

/**
 * Get categorical color for a hazard type
 * @param hazardId - Hazard identifier
 * @returns Hex color code
 */
export function getHazardColor(hazardId: string): string {
  return HAZARD_CATEGORICAL_COLORS[hazardId as keyof typeof HAZARD_CATEGORICAL_COLORS] 
    || HAZARD_CATEGORICAL_COLORS.unknown;
}

// ============================================
// OPACITY SCALES
// ============================================

/**
 * Base opacity values for map layers
 * These ensure basemap context remains visible
 */
export const LAYER_OPACITY = {
  district: {
    fill: 0.35,           // Base fill for districts (lower for better basemap visibility)
    fillHover: 0.5,       // Fill on hover
    fillSelected: 0.65,   // Fill when selected
    outline: 0.8,         // Outline always visible
    outlineHover: 1.0,    // Outline on hover
  },
  regional: {
    fill: 0.5,           // Regional polygons
    fillSelected: 0.7,   // Selected region
    outline: 0.85,       // Regional boundaries
  },
  heatmap: {
    base: 0.6,           // Heatmap base opacity
    peak: 0.9,           // Heatmap peak opacity
  },
} as const;

/**
 * Create scale-dependent opacity expression for districts
 * Higher zoom = more visible fill for detail work
 * Lower zoom = more transparent for overview
 */
export function createScaleDependentOpacity(baseOpacity: number): any {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    5, baseOpacity * 0.6,      // Far out - very transparent
    8, baseOpacity,            // Medium zoom - base opacity
    12, baseOpacity * 1.2,     // Close in - more visible (capped at reasonable max)
  ];
}

// ============================================
// ACCESSIBILITY HELPERS
// ============================================

/**
 * Ensure color has sufficient contrast for accessibility
 * @param color - Hex color code
 * @param onDark - Whether color will be on dark background
 * @returns Adjusted color with better contrast
 */
export function ensureContrast(color: string, onDark: boolean = true): string {
  // For now, return original - could implement luminance calculation
  // and adjustment if needed for WCAG AA compliance
  return color;
}

/**
 * Get text color (light/dark) based on background color
 * @param backgroundColor - Hex color code
 * @returns "light" or "dark"
 */
export function getTextColorForBackground(backgroundColor: string): "light" | "dark" {
  // Simple heuristic - could be improved with proper luminance calculation
  const hex = backgroundColor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? "dark" : "light";
}
