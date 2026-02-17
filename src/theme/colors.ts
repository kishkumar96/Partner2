/**
 * Centralized Color System - Pacific Disaster Platform
 *
 * Single source of truth for all colors across the application.
 * Benefits:
 * - Consistent visual language
 * - Easy maintenance and updates
 * - Support for accessibility features (color-blind mode, high contrast)
 * - Future theming capabilities (dark mode, custom branding)
 *
 * Usage: Import specific color constants or functions from this file
 * instead of using hardcoded HEX values in components.
 */

// Re-export cyclone-specific colors for convenience
export * from './cycloneScale';

// ============================================================================
// Hazard Colors (Map Layer Visualization)
// ============================================================================

export interface HazardColors {
  wind: string;
  cycloneTrack: string;
  inundation: string;
  flood: string;
  earthquake: string;
  tsunami: string;
  volcano: string;
  default: string;
}

/**
 * Primary hazard colors for map layers, markers, and legends
 */
export const HAZARD_COLORS: HazardColors = {
  wind: '#3B82F6', // Blue-500 - Wind/Cyclone
  cycloneTrack: '#3B82F6', // Blue-500 - Cyclone track
  inundation: '#06B6D4', // Cyan-500 - Water/Flooding
  flood: '#06B6D4', // Cyan-500 - Flooding
  earthquake: '#EF4444', // Red-500 - Seismic
  tsunami: '#0891B2', // Cyan-600 - Ocean wave
  volcano: '#DC2626', // Red-600 - Volcanic
  default: '#6B7280', // Gray-500 - Unknown/Other
};

/**
 * Get color for a hazard type
 */
export function getHazardColor(hazardId: string): string {
  const normalized = hazardId.toLowerCase().replace(/-/g, '');

  if (normalized.includes('wind')) return HAZARD_COLORS.wind;
  if (normalized.includes('cyclone') || normalized.includes('track'))
    return HAZARD_COLORS.cycloneTrack;
  if (normalized.includes('inundation')) return HAZARD_COLORS.inundation;
  if (normalized.includes('flood')) return HAZARD_COLORS.flood;
  if (normalized.includes('earthquake') || normalized.includes('seismic'))
    return HAZARD_COLORS.earthquake;
  if (normalized.includes('tsunami')) return HAZARD_COLORS.tsunami;
  if (normalized.includes('volcano')) return HAZARD_COLORS.volcano;

  return HAZARD_COLORS.default;
}

// ============================================================================
// Economic Loss/Damage Colors (Choropleth Scale)
// ============================================================================

export interface DamageSeverity {
  minimal: string;
  minor: string;
  moderate: string;
  substantial: string;
  severe: string;
  catastrophic: string;
}

/**
 * Building damage colors (point markers)
 * Based on economic loss thresholds
 * Updated with more vibrant, high-contrast colors for better visibility
 */
export const BUILDING_DAMAGE_COLORS: DamageSeverity = {
  minimal: '#84CC16', // Lime-500 - < $10K (bright green-yellow)
  minor: '#84CC16', // Lime-500 - < $10K (bright green-yellow)
  moderate: '#FBBF24', // Amber-400 - $10K-$50K (bright yellow-orange)
  substantial: '#F97316', // Orange-500 - $50K-$100K (vivid orange)
  severe: '#EF4444', // Red-500 - $100K-$500K (bright red)
  catastrophic: '#DC2626', // Red-600 - > $500K (deep red)
};

/**
 * Road damage colors (line features)
 * Vibrant colors appropriate for linear features - need higher saturation than polygons
 */
export const ROAD_DAMAGE_COLORS = {
  light: '#FBBF24', // Amber-400 - < $5K (bright yellow-orange)
  moderate: '#FB923C', // Orange-400 - $5K-$25K (vivid orange)
  heavy: '#F97316', // Orange-500 - $25K-$75K (bright orange)
  severe: '#EF4444', // Red-500 - > $75K (bright red)
};

/**
 * Get building damage color by loss amount
 */
export function getBuildingDamageColor(lossUSD: number): string {
  if (lossUSD >= 500000) return BUILDING_DAMAGE_COLORS.catastrophic;
  if (lossUSD >= 100000) return BUILDING_DAMAGE_COLORS.severe;
  if (lossUSD >= 50000) return BUILDING_DAMAGE_COLORS.substantial;
  if (lossUSD >= 10000) return BUILDING_DAMAGE_COLORS.moderate;
  return BUILDING_DAMAGE_COLORS.minimal;
}

/**
 * Get road damage color by loss amount
 */
export function getRoadDamageColor(lossUSD: number): string {
  if (lossUSD >= 75000) return ROAD_DAMAGE_COLORS.severe;
  if (lossUSD >= 25000) return ROAD_DAMAGE_COLORS.heavy;
  if (lossUSD >= 5000) return ROAD_DAMAGE_COLORS.moderate;
  return ROAD_DAMAGE_COLORS.light;
}

// ============================================================================
// Regional Impact Colors (Polygon Fills)
// ============================================================================

/**
 * Regional impact polygon colors
 * Used for district/province-level data visualization
 */
export const REGIONAL_IMPACT_COLORS = {
  // Loss mode (economic damage)
  lowLoss: '#ECFCCB', // Lime-100
  mediumLoss: '#FDE047', // Yellow-300
  highLoss: '#F97316', // Orange-500
  criticalLoss: '#DC2626', // Red-600

  // Wind mode (max gusts)
  lowWind: '#DBEAFE', // Blue-100
  mediumWind: '#60A5FA', // Blue-400
  highWind: '#F97316', // Orange-500
  severeWind: '#DC2626', // Red-600
};

// ============================================================================
// Sector Colors
// ============================================================================

/**
 * Economic sector colors for charts and breakdowns
 */
export const SECTOR_COLORS = {
  residential: '#EF4444', // Red-500 - Housing
  commercial: '#3B82F6', // Blue-500 - Business
  infrastructure: '#F59E0B', // Amber-500 - Roads/utilities
  agriculture: '#10B981', // Green-500 - Farming
  industrial: '#8B5CF6', // Purple-500 - Manufacturing
  education: '#EC4899', // Pink-500 - Schools
  health: '#14B8A6', // Teal-500 - Hospitals
  government: '#6366F1', // Indigo-500 - Public buildings
};

/**
 * Get sector color
 */
export function getSectorColor(sector: string): string {
  const normalized = sector.toLowerCase();

  if (normalized.includes('residential') || normalized.includes('housing'))
    return SECTOR_COLORS.residential;
  if (normalized.includes('commercial') || normalized.includes('business'))
    return SECTOR_COLORS.commercial;
  if (normalized.includes('infrastructure') || normalized.includes('road'))
    return SECTOR_COLORS.infrastructure;
  if (normalized.includes('agriculture') || normalized.includes('farm'))
    return SECTOR_COLORS.agriculture;
  if (normalized.includes('industrial') || normalized.includes('manufacturing'))
    return SECTOR_COLORS.industrial;
  if (normalized.includes('education') || normalized.includes('school'))
    return SECTOR_COLORS.education;
  if (
    normalized.includes('health') ||
    normalized.includes('hospital') ||
    normalized.includes('medical')
  )
    return SECTOR_COLORS.health;
  if (normalized.includes('government') || normalized.includes('public'))
    return SECTOR_COLORS.government;

  return HAZARD_COLORS.default;
}

// ============================================================================
// UI & Component Colors
// ============================================================================

/**
 * Common UI colors (Glass morphism, panels, overlays)
 */
export const UI_COLORS = {
  // Glass panel backgrounds
  glassDark: 'rgba(15, 23, 42, 0.95)', // slate-900 with opacity
  glassMedium: 'rgba(30, 41, 59, 0.90)', // slate-800
  glassLight: 'rgba(51, 65, 85, 0.85)', // slate-700

  // Borders
  borderSubtle: 'rgba(255, 255, 255, 0.10)',
  borderMedium: 'rgba(255, 255, 255, 0.20)',
  borderStrong: 'rgba(255, 255, 255, 0.30)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#E2E8F0', // slate-200
  textTertiary: '#94A3B8', // slate-400
  textMuted: '#64748B', // slate-500

  // Accents
  primary: '#3B82F6', // Blue-500
  secondary: '#8B5CF6', // Purple-500
  success: '#10B981', // Green-500
  warning: '#F59E0B', // Amber-500
  error: '#EF4444', // Red-500
  info: '#06B6D4', // Cyan-500
};

// ============================================================================
// Wind Radii Colors (Cyclone Animation)
// ============================================================================

/**
 * Wind radii visualization colors (with alpha for fills)
 */
export const WIND_RADII_COLORS = {
  gale: {
    stroke: '#FFD700', // Gold - 34-47 kt
    fill: '#FFD70040', // Gold with alpha
  },
  storm: {
    stroke: '#FFA500', // Orange - 48-63 kt
    fill: '#FFA50040', // Orange with alpha
  },
  hurricane: {
    stroke: '#FF0000', // Red - ≥64 kt
    fill: '#FF000040', // Red with alpha
  },
  uncertainty: {
    stroke: '#666666', // Gray - Forecast cone
    fill: '#88888820', // Gray with alpha (dashed)
  },
};

// ============================================================================
// Map-Specific Colors
// ============================================================================

/**
 * Map layer colors
 */
export const MAP_COLORS = {
  // District polygons
  districtFill: '#FFFFFF',
  districtOutline: '#94A3AF',
  districtHover: 'rgba(59, 130, 246, 0.2)', // Blue tint on hover
  districtSelected: 'rgba(59, 130, 246, 0.4)', // Blue tint when selected

  // Markers
  markerStroke: '#FFFFFF',
  markerShadow: 'rgba(0, 0, 0, 0.3)',

  // Track lines
  forecastTrack: '#9333EA', // Purple-600 - Forecast path
  historicalTrack: '#3B82F6', // Blue-500 - Historical path
};

// ============================================================================
// Chart & Graph Colors
// ============================================================================

/**
 * Data visualization colors for charts
 * Includes primary, secondary, and tertiary data series
 */
export const DATA_VIZ_COLORS = {
  series1: '#3B82F6', // Blue-500
  series2: '#8B5CF6', // Purple-500
  series3: '#EC4899', // Pink-500
  series4: '#F59E0B', // Amber-500
  series5: '#10B981', // Green-500
  series6: '#06B6D4', // Cyan-500

  // Chart backgrounds
  chartBackground: 'rgba(15, 23, 42, 0.95)',
  chartGrid: 'rgba(148, 163, 184, 0.1)',
  chartAxis: 'rgba(148, 163, 184, 0.5)',

  // Tooltip
  tooltipBg: 'rgba(15, 23, 42, 0.95)',
  tooltipBorder: 'rgba(75, 85, 99, 1)', // Gray-600
  tooltipText: '#FFFFFF',
};

// ============================================================================
// Severity & Alert Colors
// ============================================================================

/**
 * Alert and severity levels
 */
export const SEVERITY_COLORS = {
  low: {
    bg: 'rgba(34, 197, 94, 0.2)', // Green with alpha
    text: '#86EFAC', // Green-300
    border: '#22C55E', // Green-500
  },
  medium: {
    bg: 'rgba(234, 179, 8, 0.2)', // Yellow with alpha
    text: '#FDE047', // Yellow-300
    border: '#EAB308', // Yellow-500
  },
  high: {
    bg: 'rgba(249, 115, 22, 0.2)', // Orange with alpha
    text: '#FED7AA', // Orange-200
    border: '#F97316', // Orange-500
  },
  critical: {
    bg: 'rgba(239, 68, 68, 0.2)', // Red with alpha
    text: '#FCA5A5', // Red-300
    border: '#EF4444', // Red-500
  },
};

/**
 * Get severity color set
 */
export function getSeverityColor(severity: 'low' | 'medium' | 'high' | 'critical') {
  return SEVERITY_COLORS[severity];
}

// ============================================================================
// Accessibility Utilities
// ============================================================================

/**
 * Check if two colors have sufficient contrast (WCAG AA standard)
 * @param foreground - Foreground color (HEX)
 * @param background - Background color (HEX)
 * @returns true if contrast ratio >= 4.5:1
 */
export function hasAccessibleContrast(foreground: string, background: string): boolean {
  const getLuminance = (hex: string): number => {
    const rgb = parseInt(hex.slice(1), 16);
    const r = ((rgb >> 16) & 0xff) / 255;
    const g = ((rgb >> 8) & 0xff) / 255;
    const b = (rgb & 0xff) / 255;

    const [rs, gs, bs] = [r, g, b].map(c =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    );

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  return ratio >= 4.5;
}

/**
 * Convert any HEX color to RGBA with custom alpha
 */
export function colorWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
