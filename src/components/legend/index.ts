/**
 * Legend Components Module
 *
 * Compositional architecture for legend symbology editing:
 * - ThresholdRow: Atomic component for single threshold
 * - LegendSection: Group of thresholds with reset
 * - CollapsibleLegendPanel: Full collapsible UI
 *
 * Usage:
 *   import { CollapsibleLegendPanel } from '@/components/legend';
 *
 *   <CollapsibleLegendPanel
 *     legendSettings={settings}
 *     onLegendSettingsChange={handleChange}
 *     countryCode={code}
 *   />
 */

export { default as ThresholdRow } from './ThresholdRow';
export type { ThresholdRowProps } from './ThresholdRow';

export { default as LegendSection } from './LegendSection';
export type { LegendSectionProps } from './LegendSection';

export { default as CollapsibleLegendPanel } from './CollapsibleLegendPanel';
export type { CollapsibleLegendPanelProps } from './CollapsibleLegendPanel';
