'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  createDefaultLegendSettings,
  LegendSettings,
  LegendThreshold,
} from '@/data/realThreddsLayers';
import type { CountryCode } from '@/types/thredds';
import { LegendSection } from '@/components/legend';
import {
  validateLabelFormat,
  validateThresholdOrder,
  ValidationResult,
  ThresholdCategory,
} from '@/components/legend/validation';

interface LegendSymbologyPanelProps {
  legendSettings: LegendSettings;
  onLegendSettingsChange: (settings: LegendSettings) => void;
  countryCode?: CountryCode;
}

/**
 * LegendSymbologyPanel - Full-page legend editor with validation
 *
 * Enhanced world-class features:
 * - Uses compositional architecture (LegendSection → ThresholdRow)
 * - Real-time validation with user feedback
 * - Debounced updates for performance
 * - Optional value editing (advanced mode)
 * - Comprehensive accessibility (semantic HTML + ARIA)
 * - Optimized re-renders with memo + useCallback
 * - Full TypeScript safety
 */
const LegendSymbologyPanel = memo(function LegendSymbologyPanel({
  legendSettings,
  onLegendSettingsChange,
  countryCode,
}: LegendSymbologyPanelProps) {
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleThresholdChange = useCallback(
    (
      category: keyof LegendSettings,
      index: number,
      field: keyof LegendThreshold,
      value: string | number
    ) => {
      const newSettings = { ...legendSettings };
      const newThresholds = [...newSettings[category]];

      if (field === 'value') {
        const numericValue = value as number;
        if (numericValue < 0) return;

        // Validate ordering
        const validationResult = validateThresholdOrder(numericValue, {
          category: category as ThresholdCategory,
          index,
          allThresholds: newThresholds,
        });

        if (!validationResult.valid) {
          setValidationErrors(prev => ({
            ...prev,
            [`${category}-${index}-value`]: validationResult.error,
          }));
          return;
        } else {
          setValidationErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[`${category}-${index}-value`];
            return newErrors;
          });
        }

        newThresholds[index] = { ...newThresholds[index], value: numericValue };
      } else if (field === 'label') {
        const labelValue = value as string;

        // Validate label format (warnings only)
        const validationResult = validateLabelFormat(labelValue, category as ThresholdCategory);

        if (!validationResult.valid && validationResult.severity === 'error') {
          setValidationErrors(prev => ({
            ...prev,
            [`${category}-${index}-label`]: validationResult.error,
          }));
        } else {
          setValidationErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[`${category}-${index}-label`];
            return newErrors;
          });
        }

        newThresholds[index] = {
          ...newThresholds[index],
          label: labelValue,
          rangeLabel: labelValue,
        };
      } else if (field === 'descriptiveLabel') {
        newThresholds[index] = {
          ...newThresholds[index],
          descriptiveLabel: value as string,
        };
      } else if (field === 'color') {
        newThresholds[index] = { ...newThresholds[index], color: value as string };
      }

      newSettings[category] = newThresholds;

      // Debounce label changes for better UX
      if (field === 'label') {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          onLegendSettingsChange(newSettings);
        }, 300);
      } else {
        onLegendSettingsChange(newSettings);
      }
    },
    [legendSettings, onLegendSettingsChange]
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleResetLegend = useCallback(() => {
    onLegendSettingsChange(createDefaultLegendSettings(countryCode));
    setValidationErrors({});
  }, [countryCode, onLegendSettingsChange]);

  const createCategoryHandler = useCallback(
    (category: keyof LegendSettings) => (index: number, rangeLabel: string) => {
      handleThresholdChange(category, index, 'label', rangeLabel);
    },
    [handleThresholdChange]
  );

  const createCategoryDescriptionHandler = useCallback(
    (category: keyof LegendSettings) => (index: number, descriptiveLabel: string) => {
      handleThresholdChange(category, index, 'descriptiveLabel', descriptiveLabel);
    },
    [handleThresholdChange]
  );

  const createCategoryValueHandler = useCallback(
    (category: keyof LegendSettings) => (index: number, value: number) => {
      handleThresholdChange(category, index, 'value', value);
    },
    [handleThresholdChange]
  );

  const createCategoryReset = useCallback(
    (category: keyof LegendSettings) => () => {
      const defaults = createDefaultLegendSettings(countryCode);
      onLegendSettingsChange({
        ...legendSettings,
        [category]: defaults[category],
      });

      // Clear validation errors for this category
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        Object.keys(newErrors).forEach(key => {
          if (key.startsWith(`${category}-`)) {
            delete newErrors[key];
          }
        });
        return newErrors;
      });
    },
    [countryCode, legendSettings, onLegendSettingsChange]
  );

  return (
    <div className="w-full border-l border-purple-500/15 bg-gradient-to-b from-slate-950/95 via-slate-900/95 to-slate-950/95 shadow-[inset_1px_0_0_rgba(168,85,247,0.08)] flex flex-col flex-shrink-0 h-full min-h-0 overflow-hidden isolate md:w-80">
      <div className="flex-1 overflow-y-auto overscroll-contain overflow-x-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-purple-500/15 bg-slate-900/35">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Legend Symbology</h2>
              <p className="mt-1 text-[11px] text-slate-400">
                Define custom ranges and labels for map legends. Changes apply live.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetLegend}
              className="text-[10px] text-purple-400 hover:text-purple-300 underline flex-shrink-0 
                       focus:outline-none focus:ring-1 focus:ring-purple-400/60 focus:ring-offset-1 
                       focus:ring-offset-slate-900 rounded-sm px-1 transition-colors"
              title="Reset all legend settings to defaults"
              aria-label="Reset all thresholds to defaults"
            >
              Reset All
            </button>
          </div>

          {/* Advanced Mode Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(prev => !prev)}
            className="mt-2 text-[10px] text-slate-400 hover:text-slate-300 transition-colors"
            aria-pressed={showAdvanced}
          >
            {showAdvanced ? '▼' : '▶'} Advanced: Edit numeric values
          </button>
        </div>

        {/* Validation Summary */}
        {Object.keys(validationErrors).length > 0 && (
          <div
            className="mx-4 mt-3 p-2 bg-red-950/30 border border-red-500/30 rounded text-[10px] text-red-300"
            role="alert"
            aria-live="polite"
          >
            <strong>Validation errors:</strong>
            <ul className="mt-1 ml-3 list-disc">
              {Object.entries(validationErrors).map(([key, error]) => (
                <li key={key}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Legend Sections */}
        <div className="px-4 py-4 space-y-5">
          <LegendSection
            title="Economic Loss"
            categoryKey="loss"
            thresholds={legendSettings.loss}
            onThresholdChange={createCategoryHandler('loss')}
            onDescriptionChange={createCategoryDescriptionHandler('loss')}
            onValueChange={showAdvanced ? createCategoryValueHandler('loss') : undefined}
            onReset={createCategoryReset('loss')}
            showValues={showAdvanced}
          />

          <LegendSection
            title="Wind Speed"
            categoryKey="wind"
            thresholds={legendSettings.wind}
            onThresholdChange={createCategoryHandler('wind')}
            onDescriptionChange={createCategoryDescriptionHandler('wind')}
            onValueChange={showAdvanced ? createCategoryValueHandler('wind') : undefined}
            onReset={createCategoryReset('wind')}
            showValues={showAdvanced}
          />

          <LegendSection
            title="Building Damage"
            categoryKey="buildings"
            thresholds={legendSettings.buildings}
            onThresholdChange={createCategoryHandler('buildings')}
            onDescriptionChange={createCategoryDescriptionHandler('buildings')}
            onValueChange={showAdvanced ? createCategoryValueHandler('buildings') : undefined}
            onReset={createCategoryReset('buildings')}
            showValues={showAdvanced}
          />

          <LegendSection
            title="Road Damage"
            categoryKey="roads"
            thresholds={legendSettings.roads}
            onThresholdChange={createCategoryHandler('roads')}
            onDescriptionChange={createCategoryDescriptionHandler('roads')}
            onValueChange={showAdvanced ? createCategoryValueHandler('roads') : undefined}
            onReset={createCategoryReset('roads')}
            showValues={showAdvanced}
          />
        </div>
      </div>
    </div>
  );
});

export default LegendSymbologyPanel;
