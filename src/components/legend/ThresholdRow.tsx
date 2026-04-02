'use client';

import { memo, useCallback, useId } from 'react';
import type { LegendThreshold } from '@/data/realThreddsLayers';

export interface ThresholdRowProps {
  threshold: LegendThreshold;
  index: number;
  categoryLabel: string;
  onChange: (value: string) => void;
  readonly?: boolean;
  showValue?: boolean;
  onValueChange?: (value: number) => void;
  className?: string;
}

/**
 * ThresholdRow - Atomic component for a single legend threshold entry
 *
 * Features:
 * - Color swatch with accessible label
 * - Editable text label input
 * - Optional value editing for advanced use
 * - Full keyboard navigation support
 * - WCAG AA compliant
 */
const ThresholdRow = memo(function ThresholdRow({
  threshold,
  index,
  categoryLabel,
  onChange,
  readonly = false,
  showValue = false,
  onValueChange,
  className = '',
}: ThresholdRowProps) {
  const labelId = useId();
  const valueId = useId();
  const isInfinite = !isFinite(threshold.value);

  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const handleValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const numValue = Number(e.target.value);
      if (onValueChange && !isNaN(numValue) && numValue >= 0) {
        onValueChange(numValue);
      }
    },
    [onValueChange]
  );

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Color Swatch with accessible description */}
      <div
        role="img"
        aria-label={`Color indicator: ${threshold.color} for ${categoryLabel} range ${index + 1}`}
        className="w-5 h-5 rounded border border-slate-600/40 flex-shrink-0 transition-transform hover:scale-110"
        style={{ backgroundColor: threshold.color }}
        title={threshold.color}
      />

      {/* Optional Value Input (for advanced editing) */}
      {showValue && (
        <div className="w-20">
          <label htmlFor={valueId} className="sr-only">
            {categoryLabel} threshold {index + 1} numeric value
          </label>
          <input
            id={valueId}
            type="number"
            value={isInfinite ? '' : threshold.value}
            onChange={handleValueChange}
            disabled={readonly || isInfinite || !onValueChange}
            min="0"
            step="any"
            placeholder={isInfinite ? '∞' : 'Value'}
            className="w-full px-2 py-1 text-[11px] border border-slate-600/60 rounded bg-slate-950/50 text-white 
                     focus:border-purple-400/60 focus:outline-none focus:ring-1 focus:ring-purple-400/30
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
            aria-describedby={isInfinite ? `${valueId}-help` : undefined}
          />
          {isInfinite && (
            <span id={`${valueId}-help`} className="sr-only">
              This is the upper bound threshold with no maximum value
            </span>
          )}
        </div>
      )}

      {/* Label Input */}
      <div className="flex-1">
        <label htmlFor={labelId} className="sr-only">
          {categoryLabel} threshold {index + 1} display label
        </label>
        <input
          id={labelId}
          type="text"
          value={threshold.label}
          onChange={handleLabelChange}
          disabled={readonly}
          placeholder="Label"
          className="w-full px-2 py-1 text-[11px] border border-slate-600/60 rounded bg-slate-950/50 text-white 
                   focus:border-purple-400/60 focus:outline-none focus:ring-1 focus:ring-purple-400/30
                   disabled:opacity-60 disabled:cursor-not-allowed
                   transition-colors placeholder:text-slate-600"
          aria-label={`${categoryLabel} threshold ${index + 1} label`}
        />
      </div>
    </div>
  );
});

export default ThresholdRow;
