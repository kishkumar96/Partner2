/**
 * Centralized cyclone visualization theme and color scales
 * Single source of truth for all cyclone-related colors, preventing drift
 * Supports accessibility and future theming (dark mode, color-blind safe, etc.)
 */

// ============================================================================
// Category Color Scale (Saffir-Simpson Scale)
// ============================================================================

export interface CategoryScale {
  category5: string;
  category4: string;
  category3: string;
  category2: string;
  category1: string;
  tropicalStorm: string;
}

/**
 * Primary category colors (HEX)
 * Used for: track markers, labels, legend items
 */
export const CATEGORY_COLORS: CategoryScale = {
  category5: '#7C3AED', // Violet - Catastrophic
  category4: '#DC2626', // Red - Extreme
  category3: '#FB923C', // Orange - Extensive
  category2: '#FACC15', // Yellow - Moderate
  category1: '#FDE047', // Light Yellow - Minimal
  tropicalStorm: '#7DD3FC', // Sky Blue - Tropical Storm
};

/**
 * Category colors with alpha channel (RGBA)
 * Used for: fills, glows, overlays
 */
export const CATEGORY_COLORS_RGBA = {
  category5: 'rgba(124, 58, 237, ', // append alpha)
  category4: 'rgba(220, 38, 38, ',
  category3: 'rgba(251, 146, 60, ',
  category2: 'rgba(250, 204, 21, ',
  category1: 'rgba(253, 224, 71, ',
  tropicalStorm: 'rgba(125, 211, 252, ',
};

/**
 * Get color for cyclone category (Saffir-Simpson scale)
 * @param category - Cyclone category (1-5, or <1 for tropical storm)
 * @returns HEX color string
 */
export function getCategoryColor(category: number): string {
  if (category >= 5) return CATEGORY_COLORS.category5;
  if (category >= 4) return CATEGORY_COLORS.category4;
  if (category >= 3) return CATEGORY_COLORS.category3;
  if (category >= 2) return CATEGORY_COLORS.category2;
  if (category >= 1) return CATEGORY_COLORS.category1;
  return CATEGORY_COLORS.tropicalStorm;
}

/**
 * Get RGBA color with custom alpha
 * @param category - Cyclone category
 * @param alpha - Opacity (0-1)
 * @returns RGBA color string
 */
export function getCategoryColorRGBA(category: number, alpha: number): string {
  const base = (() => {
    if (category >= 5) return CATEGORY_COLORS_RGBA.category5;
    if (category >= 4) return CATEGORY_COLORS_RGBA.category4;
    if (category >= 3) return CATEGORY_COLORS_RGBA.category3;
    if (category >= 2) return CATEGORY_COLORS_RGBA.category2;
    if (category >= 1) return CATEGORY_COLORS_RGBA.category1;
    return CATEGORY_COLORS_RGBA.tropicalStorm;
  })();
  return `${base}${alpha})`;
}

/**
 * Get category label (human-readable)
 */
export function getCategoryLabel(category: number): string {
  if (category >= 5) return 'Category 5';
  if (category >= 4) return 'Category 4';
  if (category >= 3) return 'Category 3';
  if (category >= 2) return 'Category 2';
  if (category >= 1) return 'Category 1';
  return 'Tropical Storm';
}

// ============================================================================
// Wind Speed Color Scale (Continuous)
// ============================================================================

/**
 * Get color based on wind speed (knots)
 * Used for: wind speed visualizations, intensity gradients
 */
export function getWindColor(windKnots: number): string {
  if (windKnots >= 137) return CATEGORY_COLORS.category5; // Cat 5
  if (windKnots >= 113) return CATEGORY_COLORS.category4; // Cat 4
  if (windKnots >= 96) return CATEGORY_COLORS.category3; // Cat 3
  if (windKnots >= 83) return CATEGORY_COLORS.category2; // Cat 2
  if (windKnots >= 64) return CATEGORY_COLORS.category1; // Cat 1
  if (windKnots >= 34) return CATEGORY_COLORS.tropicalStorm; // Tropical Storm
  return '#94A3B8'; // Below tropical storm threshold (slate-400)
}

/**
 * Get wind speed label
 */
export function getWindLabel(windKnots: number): string {
  if (windKnots >= 137) return 'Catastrophic (Cat 5)';
  if (windKnots >= 113) return 'Extreme (Cat 4)';
  if (windKnots >= 96) return 'Extensive (Cat 3)';
  if (windKnots >= 83) return 'Moderate (Cat 2)';
  if (windKnots >= 64) return 'Minimal (Cat 1)';
  if (windKnots >= 34) return 'Tropical Storm';
  return 'Depression';
}

// ============================================================================
// Pressure Color Scale
// ============================================================================

/**
 * Get color based on central pressure (hPa)
 * Lower pressure = more intense = warmer colors
 */
export function getPressureColor(pressureHPa: number): string {
  if (pressureHPa <= 920) return CATEGORY_COLORS.category5;
  if (pressureHPa <= 944) return CATEGORY_COLORS.category4;
  if (pressureHPa <= 964) return CATEGORY_COLORS.category3;
  if (pressureHPa <= 979) return CATEGORY_COLORS.category2;
  if (pressureHPa <= 989) return CATEGORY_COLORS.category1;
  return CATEGORY_COLORS.tropicalStorm;
}

// ============================================================================
// Story Beat Colors
// ============================================================================

export type StoryBeatType =
  | 'peak-intensity'
  | 'rapid-intensification'
  | 'category-upgrade'
  | 'closest-approach'
  | 'peak-uncertainty';

/**
 * Story beat type colors
 * Used for: beat markers, timeline indicators, story cards
 */
export const STORY_BEAT_COLORS: Record<StoryBeatType, string> = {
  'peak-intensity': '#DC2626', // Red - Critical moment
  'rapid-intensification': '#F59E0B', // Amber - Rapid change
  'category-upgrade': '#8B5CF6', // Purple - Milestone
  'closest-approach': '#EC4899', // Pink - Geographical concern
  'peak-uncertainty': '#6B7280', // Gray - Unknown
};

/**
 * Get color for story beat type
 */
export function getBeatColor(beatType: StoryBeatType): string {
  return STORY_BEAT_COLORS[beatType];
}

/**
 * Get RGBA beat color with custom alpha
 */
export function getBeatColorRGBA(beatType: StoryBeatType, alpha: number): string {
  const hex = STORY_BEAT_COLORS[beatType];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============================================================================
// Chart Colors
// ============================================================================

/**
 * Chart-specific colors (shared across all cyclone charts)
 */
export const CHART_COLORS = {
  // Primary data lines
  windSpeed: '#3B82F6', // Blue-500
  windGust: '#60A5FA', // Blue-400 (lighter for gust envelope)
  pressure: '#8B5CF6', // Purple-500

  // Fills and backgrounds
  windFill: 'rgba(59, 130, 246, 0.14)',
  pressureFill: 'rgba(139, 92, 246, 0.1)',

  // Grid and axes
  gridColor: 'rgba(148, 163, 184, 0.1)',
  axisColor: 'rgba(148, 163, 184, 0.5)',

  // Interactive elements
  tooltipBackground: 'rgba(15, 23, 42, 0.95)', // slate-900
  tooltipBorder: 'rgba(148, 163, 184, 0.3)',
};

// ============================================================================
// Accessibility & Theming Support
// ============================================================================

/**
 * Color-blind safe alternative palette (future enhancement)
 * Based on Paul Tol's color schemes
 */
export const CATEGORY_COLORS_COLORBLIND: CategoryScale = {
  category5: '#882255', // Purple-magenta
  category4: '#CC6677', // Rose
  category3: '#DDCC77', // Sand
  category2: '#88CCEE', // Cyan
  category1: '#44AA99', // Teal
  tropicalStorm: '#117733', // Green
};

/**
 * High contrast mode colors (future enhancement)
 */
export const CATEGORY_COLORS_HIGH_CONTRAST: CategoryScale = {
  category5: '#FF0000',
  category4: '#FF6600',
  category3: '#FFAA00',
  category2: '#FFFF00',
  category1: '#AAFF00',
  tropicalStorm: '#00AAFF',
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert HEX to RGBA
 */
export function hexToRGBA(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Get contrasting text color (black or white) for a background
 */
export function getContrastColor(hexColor: string): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);

  // Calculate relative luminance (WCAG formula)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}
