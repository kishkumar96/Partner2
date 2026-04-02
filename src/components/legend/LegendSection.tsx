'use client';

import { memo, useCallback } from 'react';
import ThresholdRow from './ThresholdRow';
import type { LegendThreshold } from '@/data/realThreddsLayers';

export interface LegendSectionProps {
  title: string;
  categoryKey: string;
  thresholds: LegendThreshold[];
  onThresholdChange: (index: number, rangeLabel: string) => void;
  onDescriptionChange?: (index: number, descriptiveLabel: string) => void;
  onValueChange?: (index: number, value: number) => void;
  onReset: () => void;
  readonly?: boolean;
  showValues?: boolean;
  helpText?: string;
  'aria-labelledby'?: string;
}

/**
 * LegendSection - Reusable section component for legend categories
 *
 * Features:
 * - Grouped threshold management
 * - Individual reset capability
 * - Optional read-only mode
 * - Optional value editing (showValues prop)
 * - Semantic HTML with proper ARIA
 */
const LegendSection = memo(function LegendSection({
  title,
  categoryKey,
  thresholds,
  onThresholdChange,
  onDescriptionChange,
  onValueChange,
  onReset,
  readonly = false,
  showValues = false,
  helpText,
  'aria-labelledby': ariaLabelledBy,
}: LegendSectionProps) {
  const headingId = `legend-section-${categoryKey}`;

  const handleThresholdLabelChange = useCallback(
    (index: number) => (value: string) => {
      onThresholdChange(index, value);
    },
    [onThresholdChange]
  );

  const handleThresholdValueChange = useCallback(
    (index: number) => (value: number) => {
      if (onValueChange) {
        onValueChange(index, value);
      }
    },
    [onValueChange]
  );

  const handleThresholdDescriptionChange = useCallback(
    (index: number) => (value: string) => {
      onDescriptionChange?.(index, value);
    },
    [onDescriptionChange]
  );

  return (
    <fieldset className="border-none p-0 m-0" aria-labelledby={ariaLabelledBy || headingId}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <legend
          id={headingId}
          className="text-[10px] font-bold text-slate-300 uppercase tracking-wide"
        >
          {title}
        </legend>
        {!readonly && (
          <button
            type="button"
            onClick={onReset}
            className="text-[9px] text-purple-400 hover:text-purple-300 underline 
                     focus:outline-none focus:ring-1 focus:ring-purple-400/60 focus:ring-offset-1 
                     focus:ring-offset-slate-900 rounded-sm px-1
                     transition-colors"
            title={`Reset ${title} to default thresholds`}
            aria-label={`Reset ${title} thresholds to defaults`}
          >
            Reset
          </button>
        )}
      </div>

      {helpText && (
        <p className="text-[10px] text-slate-400 italic mb-2" role="note">
          {helpText}
        </p>
      )}

      <div className="space-y-1.5" role="list" aria-label={`${title} thresholds`}>
        {thresholds.map((threshold, index) => (
          <div key={`${categoryKey}-${index}`} role="listitem">
            <ThresholdRow
              threshold={threshold}
              index={index}
              categoryLabel={title}
              onChange={handleThresholdLabelChange(index)}
              onDescriptionChange={handleThresholdDescriptionChange(index)}
              onValueChange={showValues ? handleThresholdValueChange(index) : undefined}
              readonly={readonly}
              showValue={showValues}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
});

export default LegendSection;
