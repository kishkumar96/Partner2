'use client';

import { memo, useCallback, useState } from 'react';
import { Palette, ChevronDown } from 'lucide-react';
import LegendSection from './LegendSection';
import type { LegendSettings } from '@/data/realThreddsLayers';
import { createDefaultLegendSettings } from '@/data/realThreddsLayers';
import type { CountryCode } from '@/types/thredds';

export interface CollapsibleLegendPanelProps {
  legendSettings: LegendSettings;
  onLegendSettingsChange: (settings: LegendSettings) => void;
  countryCode?: CountryCode;
  /** Controlled expanded state (if provided, component is controlled) */
  isExpanded?: boolean;
  /** Callback when expand/collapse is triggered (for controlled mode) */
  onToggle?: () => void;
  /** Default expanded state for uncontrolled mode */
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * CollapsibleLegendPanel - Collapsible panel for legend symbology editing
 *
 * World-class features:
 * - Compositional architecture (Panel → Section → Row)
 * - Proper ARIA for accordion pattern
 * - Keyboard navigation (Space/Enter to toggle)
 * - Granular reset controls per section
 * - Debounced updates with validation
 * - Full TypeScript safety
 * - Optimized re-renders with memo
 */
const CollapsibleLegendPanel = memo(function CollapsibleLegendPanel({
  legendSettings,
  onLegendSettingsChange,
  countryCode,
  isExpanded: controlledExpanded,
  onToggle,
  defaultExpanded = false,
  className = '',
}: CollapsibleLegendPanelProps) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(defaultExpanded);

  // Use controlled state if provided, otherwise use internal state
  const isControlled = controlledExpanded !== undefined;
  const isExpanded = isControlled ? controlledExpanded : uncontrolledExpanded;

  const panelId = 'legend-symbology-panel';
  const headingId = 'legend-symbology-heading';

  const togglePanel = useCallback(() => {
    if (isControlled) {
      onToggle?.();
    } else {
      setUncontrolledExpanded(prev => !prev);
    }
  }, [isControlled, onToggle]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        togglePanel();
      }
    },
    [togglePanel]
  );

  // Handler factories for each category
  const createCategoryHandler = useCallback(
    (category: keyof LegendSettings) => (index: number, rangeLabel: string) => {
      const newThresholds = [...legendSettings[category]];
      newThresholds[index] = {
        ...newThresholds[index],
        label: rangeLabel,
        rangeLabel,
      };
      onLegendSettingsChange({
        ...legendSettings,
        [category]: newThresholds,
      });
    },
    [legendSettings, onLegendSettingsChange]
  );

  const createCategoryDescriptionHandler = useCallback(
    (category: keyof LegendSettings) => (index: number, descriptiveLabel: string) => {
      const newThresholds = [...legendSettings[category]];
      newThresholds[index] = { ...newThresholds[index], descriptiveLabel };
      onLegendSettingsChange({
        ...legendSettings,
        [category]: newThresholds,
      });
    },
    [legendSettings, onLegendSettingsChange]
  );

  const createCategoryReset = useCallback(
    (category: keyof LegendSettings) => () => {
      if (!countryCode) return;
      const defaults = createDefaultLegendSettings(countryCode);
      onLegendSettingsChange({
        ...legendSettings,
        [category]: defaults[category],
      });
    },
    [countryCode, legendSettings, onLegendSettingsChange]
  );

  return (
    <div
      className={`mx-3 mt-2 rounded-xl border border-slate-700/50 bg-slate-900/45 overflow-hidden ${className}`}
    >
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={togglePanel}
        onKeyDown={handleKeyDown}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 bg-slate-900/60 px-3 py-2.5 text-left 
                 transition-colors hover:bg-slate-800/70 group
                 focus:outline-none focus:ring-2 focus:ring-purple-400/60 focus:ring-inset"
      >
        <Palette className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" aria-hidden="true" />
        <h3
          id={headingId}
          className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors"
        >
          Legend Symbology
        </h3>
        {!isExpanded && (
          <span className="text-[10px] text-slate-400 ml-auto mr-2">Custom thresholds</span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 
                    ${isExpanded ? 'rotate-180' : ''} 
                    ${!isExpanded ? 'ml-auto' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headingId}
          className="px-4 pb-3 border-t border-slate-700/40 bg-slate-900/35"
        >
          <p className="mt-3 mb-4 text-[11px] text-slate-400">
            Define custom ranges and labels for map legends. Changes apply instantly to map binning
            and legend display.
          </p>

          <div className="space-y-4">
            {/* Economic Loss Section */}
            <LegendSection
              title="Economic Loss"
              categoryKey="loss"
              thresholds={legendSettings.loss}
              onThresholdChange={createCategoryHandler('loss')}
              onDescriptionChange={createCategoryDescriptionHandler('loss')}
              onReset={createCategoryReset('loss')}
              aria-labelledby={`${headingId}-loss`}
            />

            {/* Wind Speed Section */}
            <LegendSection
              title="Wind Speed"
              categoryKey="wind"
              thresholds={legendSettings.wind}
              onThresholdChange={createCategoryHandler('wind')}
              onDescriptionChange={createCategoryDescriptionHandler('wind')}
              onReset={createCategoryReset('wind')}
              aria-labelledby={`${headingId}-wind`}
            />

            {/* Building Damage Section */}
            <LegendSection
              title="Building Damage"
              thresholds={legendSettings.buildings}
              categoryKey="buildings"
              onThresholdChange={createCategoryHandler('buildings')}
              onDescriptionChange={createCategoryDescriptionHandler('buildings')}
              onReset={createCategoryReset('buildings')}
              helpText="Edit the labels shown for damaged building legend ranges."
              aria-labelledby={`${headingId}-buildings`}
            />

            {/* Road Damage Section */}
            <LegendSection
              title="Road Damage"
              categoryKey="roads"
              thresholds={legendSettings.roads}
              onThresholdChange={createCategoryHandler('roads')}
              onDescriptionChange={createCategoryDescriptionHandler('roads')}
              onReset={createCategoryReset('roads')}
              helpText="Edit the labels shown for damaged road legend ranges."
              aria-labelledby={`${headingId}-roads`}
            />
          </div>
        </div>
      )}
    </div>
  );
});

export default CollapsibleLegendPanel;
