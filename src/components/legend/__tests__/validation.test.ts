import {
  validateThresholdOrder,
  validateLabelFormat,
  validateThresholdArray,
  suggestLabel,
  parseValueFromLabel,
  CATEGORY_METADATA,
} from '../validation';
import type { LegendThreshold } from '@/data/realThreddsLayers';

describe('Legend Validation Utilities', () => {
  describe('validateThresholdOrder', () => {
    const thresholds: LegendThreshold[] = [
      { value: 100, label: '0-100', color: '#aaa' },
      { value: 500, label: '100-500', color: '#bbb' },
      { value: 1000, label: '500-1000', color: '#ccc' },
    ];

    it('validates correct ordering', () => {
      const result = validateThresholdOrder(300, {
        category: 'loss',
        index: 1,
        allThresholds: thresholds,
      });

      expect(result.valid).toBe(true);
    });

    it('rejects value less than previous threshold', () => {
      const result = validateThresholdOrder(50, {
        category: 'loss',
        index: 1,
        allThresholds: thresholds,
      });

      expect(result.valid).toBe(false);
      if (result.valid) {
        throw new Error('Expected validation to fail');
      }
      expect(result.error).toContain('must be greater than previous threshold');
    });

    it('rejects value greater than next threshold', () => {
      const result = validateThresholdOrder(1500, {
        category: 'loss',
        index: 1,
        allThresholds: thresholds,
      });

      expect(result.valid).toBe(false);
      if (result.valid) {
        throw new Error('Expected validation to fail');
      }
      expect(result.error).toContain('must be less than next threshold');
    });

    it('allows any value for first threshold', () => {
      const result = validateThresholdOrder(50, {
        category: 'loss',
        index: 0,
        allThresholds: thresholds,
      });

      expect(result.valid).toBe(true);
    });

    it('handles Infinity in adjacent thresholds', () => {
      const infiniteThresholds: LegendThreshold[] = [
        { value: 100, label: '0-100', color: '#aaa' },
        { value: Infinity, label: '> 100', color: '#bbb' },
      ];

      const result = validateThresholdOrder(200, {
        category: 'loss',
        index: 0,
        allThresholds: infiniteThresholds,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('validateLabelFormat', () => {
    it('rejects empty labels', () => {
      const result = validateLabelFormat('', 'loss');

      expect(result.valid).toBe(false);
      if (result.valid) {
        throw new Error('Expected validation to fail');
      }
      expect(result.severity).toBe('error');
    });

    it('warns about missing currency symbol for loss', () => {
      const result = validateLabelFormat('100-500', 'loss');

      expect(result.valid).toBe(false);
      if (result.valid) {
        throw new Error('Expected validation to fail');
      }
      expect(result.severity).toBe('warning');
      expect(result.error).toContain('currency symbols');
    });

    it('accepts properly formatted loss labels', () => {
      const result = validateLabelFormat('$100M - $500M', 'loss');

      expect(result.valid).toBe(true);
    });

    it('warns about missing units for wind', () => {
      const result = validateLabelFormat('100-200', 'wind');

      expect(result.valid).toBe(false);
      if (result.valid) {
        throw new Error('Expected validation to fail');
      }
      expect(result.severity).toBe('warning');
      expect(result.error).toContain('units');
    });

    it('accepts wind labels with km/h', () => {
      const result = validateLabelFormat('100-200 km/h', 'wind');

      expect(result.valid).toBe(true);
    });

    it('accepts wind labels with mph', () => {
      const result = validateLabelFormat('60-120 mph', 'wind');

      expect(result.valid).toBe(true);
    });
  });

  describe('validateThresholdArray', () => {
    it('rejects empty arrays', () => {
      const result = validateThresholdArray([], 'loss');

      expect(result.valid).toBe(false);
      if (result.valid) {
        throw new Error('Expected validation to fail');
      }
      expect(result.error).toContain('At least one threshold');
    });

    it('rejects duplicate values', () => {
      const duplicates: LegendThreshold[] = [
        { value: 100, label: 'First', color: '#aaa' },
        { value: 100, label: 'Duplicate', color: '#bbb' },
      ];

      const result = validateThresholdArray(duplicates, 'loss');

      expect(result.valid).toBe(false);
      if (result.valid) {
        throw new Error('Expected validation to fail');
      }
      expect(result.error).toContain('unique');
    });

    it('validates correct ordering across entire array', () => {
      const ordered: LegendThreshold[] = [
        { value: 100, label: '0-100', color: '#aaa' },
        { value: 500, label: '100-500', color: '#bbb' },
        { value: 1000, label: '500-1000', color: '#ccc' },
      ];

      const result = validateThresholdArray(ordered, 'loss');

      expect(result.valid).toBe(true);
    });

    it('rejects unordered arrays', () => {
      const unordered: LegendThreshold[] = [
        { value: 500, label: '500', color: '#aaa' },
        { value: 100, label: '100', color: '#bbb' },
      ];

      const result = validateThresholdArray(unordered, 'loss');

      expect(result.valid).toBe(false);
    });
  });

  describe('suggestLabel', () => {
    it('suggests loss label for finite range', () => {
      const threshold: LegendThreshold = { value: 500000, label: '', color: '#aaa' };
      const next: LegendThreshold = { value: 1000000, label: '', color: '#bbb' };

      const suggestion = suggestLabel(threshold, next, 'loss');

      expect(suggestion).toBe('$0.5M - $1M');
    });

    it('suggests loss label for infinite range', () => {
      const threshold: LegendThreshold = { value: 3000000, label: '', color: '#aaa' };

      const suggestion = suggestLabel(threshold, undefined, 'loss');

      expect(suggestion).toBe('> $3M');
    });

    it('suggests wind label for finite range', () => {
      const threshold: LegendThreshold = { value: 100, label: '', color: '#aaa' };
      const next: LegendThreshold = { value: 120, label: '', color: '#bbb' };

      const suggestion = suggestLabel(threshold, next, 'wind');

      expect(suggestion).toBe('100-120 km/h');
    });

    it('suggests wind label for infinite range', () => {
      const threshold: LegendThreshold = { value: 200, label: '', color: '#aaa' };

      const suggestion = suggestLabel(threshold, undefined, 'wind');

      expect(suggestion).toBe('> 200 km/h');
    });
  });

  describe('parseValueFromLabel', () => {
    it('parses millions', () => {
      expect(parseValueFromLabel('$1.5M')).toBe(1500000);
      expect(parseValueFromLabel('$3M')).toBe(3000000);
    });

    it('parses thousands', () => {
      expect(parseValueFromLabel('$50K')).toBe(50000);
      expect(parseValueFromLabel('$100K')).toBe(100000);
    });

    it('parses plain numbers', () => {
      expect(parseValueFromLabel('150')).toBe(150);
      expect(parseValueFromLabel('200 km/h')).toBe(200);
    });

    it('handles greater-than prefix', () => {
      expect(parseValueFromLabel('> $3M')).toBe(3000000);
      expect(parseValueFromLabel('> 200 km/h')).toBe(200);
    });

    it('returns null for non-numeric strings', () => {
      expect(parseValueFromLabel('invalid')).toBe(null);
      expect(parseValueFromLabel('')).toBe(null);
    });
  });

  describe('CATEGORY_METADATA', () => {
    it('has metadata for all categories', () => {
      expect(CATEGORY_METADATA.loss).toBeDefined();
      expect(CATEGORY_METADATA.wind).toBeDefined();
      expect(CATEGORY_METADATA.buildings).toBeDefined();
      expect(CATEGORY_METADATA.roads).toBeDefined();
    });

    it('marks loss and wind as editable', () => {
      expect(CATEGORY_METADATA.loss.editable).toBe(true);
      expect(CATEGORY_METADATA.wind.editable).toBe(true);
    });

    it('marks buildings and roads as non-editable', () => {
      expect(CATEGORY_METADATA.buildings.editable).toBe(false);
      expect(CATEGORY_METADATA.roads.editable).toBe(false);
    });

    it('includes display names and units', () => {
      expect(CATEGORY_METADATA.loss.displayName).toBe('Economic Loss');
      expect(CATEGORY_METADATA.loss.unit).toBe('USD');
      expect(CATEGORY_METADATA.wind.unit).toBe('km/h');
    });
  });
});
