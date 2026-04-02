/**
 * Legend Validation & Type Utilities
 *
 * Comprehensive validation for legend threshold editing with:
 * - Range validation (min/max ordering)
 * - Format validation (currency, speed units)
 * - Accessibility helpers
 * - Error message generation
 */

import type { LegendThreshold, LegendSettings } from '@/data/realThreddsLayers';

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string; severity: 'error' | 'warning' };

export type ThresholdCategory = keyof LegendSettings;

export interface ValidationContext {
  category: ThresholdCategory;
  index: number;
  allThresholds: LegendThreshold[];
}

/**
 * Validate that threshold values are in ascending order
 */
export function validateThresholdOrder(
  value: number,
  context: ValidationContext
): ValidationResult {
  const { index, allThresholds } = context;

  // Check against previous threshold
  if (index > 0) {
    const prevThreshold = allThresholds[index - 1];
    if (isFinite(prevThreshold.value) && value <= prevThreshold.value) {
      return {
        valid: false,
        error: `Value must be greater than previous threshold (${prevThreshold.value})`,
        severity: 'error',
      };
    }
  }

  // Check against next threshold
  if (index < allThresholds.length - 1) {
    const nextThreshold = allThresholds[index + 1];
    if (isFinite(nextThreshold.value) && value >= nextThreshold.value) {
      return {
        valid: false,
        error: `Value must be less than next threshold (${nextThreshold.value})`,
        severity: 'error',
      };
    }
  }

  return { valid: true };
}

/**
 * Validate label format for specific category
 */
export function validateLabelFormat(label: string, category: ThresholdCategory): ValidationResult {
  if (!label || label.trim() === '') {
    return {
      valid: false,
      error: 'Label cannot be empty',
      severity: 'error',
    };
  }

  // Category-specific format hints (warnings, not errors)
  if (category === 'loss') {
    if (!label.includes('$') && !label.toLowerCase().includes('m')) {
      return {
        valid: false,
        error: 'Economic loss labels typically include currency symbols (e.g., "$1M")',
        severity: 'warning',
      };
    }
  }

  if (category === 'wind') {
    if (!label.includes('km/h') && !label.includes('mph')) {
      return {
        valid: false,
        error: 'Wind speed labels should include units (e.g., "km/h" or "mph")',
        severity: 'warning',
      };
    }
  }

  return { valid: true };
}

/**
 * Validate entire threshold array for consistency
 */
export function validateThresholdArray(
  thresholds: LegendThreshold[],
  category: ThresholdCategory
): ValidationResult {
  if (thresholds.length === 0) {
    return {
      valid: false,
      error: 'At least one threshold is required',
      severity: 'error',
    };
  }

  // Check for duplicate values
  const values = thresholds.map(t => t.value).filter(v => isFinite(v));
  const uniqueValues = new Set(values);

  if (values.length !== uniqueValues.size) {
    return {
      valid: false,
      error: 'Threshold values must be unique',
      severity: 'error',
    };
  }

  // Validate ordering
  for (let i = 0; i < thresholds.length - 1; i++) {
    const current = thresholds[i];
    const next = thresholds[i + 1];

    if (isFinite(current.value) && isFinite(next.value)) {
      if (current.value >= next.value) {
        return {
          valid: false,
          error: `Threshold ${i + 1} value (${current.value}) must be less than threshold ${i + 2} value (${next.value})`,
          severity: 'error',
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Generate human-readable label suggestion based on threshold values
 */
export function suggestLabel(
  threshold: LegendThreshold,
  nextThreshold: LegendThreshold | undefined,
  category: ThresholdCategory
): string {
  if (category === 'loss') {
    const currentM = threshold.value / 1e6;
    if (nextThreshold && isFinite(nextThreshold.value)) {
      const nextM = nextThreshold.value / 1e6;
      return `$${currentM}M - $${nextM}M`;
    }
    return `> $${currentM}M`;
  }

  if (category === 'wind') {
    const current = Math.round(threshold.value);
    if (nextThreshold && isFinite(nextThreshold.value)) {
      const next = Math.round(nextThreshold.value);
      return `${current}-${next} km/h`;
    }
    return `> ${current} km/h`;
  }

  if (category === 'buildings') {
    const currentK = threshold.value / 1000;
    if (nextThreshold && isFinite(nextThreshold.value)) {
      const nextK = nextThreshold.value / 1000;
      return `$${currentK}K - $${nextK}K`;
    }
    return `> $${currentK}K`;
  }

  if (category === 'roads') {
    const currentK = threshold.value / 1000;
    if (nextThreshold && isFinite(nextThreshold.value)) {
      const nextK = nextThreshold.value / 1000;
      return `$${currentK}K - $${nextK}K`;
    }
    return `> $${currentK}K`;
  }

  return '';
}

/**
 * Get category display metadata
 */
export interface CategoryMetadata {
  displayName: string;
  description: string;
  unit: string;
  editable: boolean;
}

export const CATEGORY_METADATA: Record<ThresholdCategory, CategoryMetadata> = {
  loss: {
    displayName: 'Economic Loss',
    description: 'Monetary damage estimates',
    unit: 'USD',
    editable: true,
  },
  wind: {
    displayName: 'Wind Speed',
    description: 'Maximum sustained wind velocity',
    unit: 'km/h',
    editable: true,
  },
  buildings: {
    displayName: 'Building Damage',
    description: 'Structural damage estimates',
    unit: 'USD',
    editable: false,
  },
  roads: {
    displayName: 'Road Damage',
    description: 'Infrastructure damage estimates',
    unit: 'USD',
    editable: false,
  },
};

/**
 * Parse numeric value from label string
 * Handles formats like "$1.5M", "150 km/h", "> $3K"
 */
export function parseValueFromLabel(label: string): number | null {
  // Remove common prefixes
  const cleaned = label.replace(/^>/, '').replace(/^</, '').trim();

  // Extract number with optional decimal
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const num = parseFloat(match[1]);

  // Check for multipliers
  if (cleaned.includes('M') || cleaned.includes('m')) {
    return num * 1e6;
  }
  if (cleaned.includes('K') || cleaned.includes('k')) {
    return num * 1e3;
  }

  return num;
}
