'use client';

import { Waves } from 'lucide-react';
import { HazardScenarioSelection, HAZARD_SCENARIO_PRODUCT_LABELS } from '@/data/realThreddsLayers';

interface HazardScenarioBadgeProps {
  selection: HazardScenarioSelection | null;
  countryName: string;
  visible: boolean;
}

// Persistent, always-on-screen scenario context -- not a legend detail, a
// decision-record requirement: anyone viewing, exporting, or screenshotting
// this map must be able to see which dataset, sea-level-rise assumption, and
// return period/event it depicts without hunting through a filter panel.
// Deliberately renders as a real overlay in the map's own DOM (not a modal
// or tooltip) so an ad-hoc OS screenshot captures it the same way an on-screen
// viewing does. Kept in its own component so ExportButtons can mirror the
// same fields into the PDF via plain text, since the PDF's map image is a
// raw canvas grab that excludes all HTML overlays (see ExportButtons.tsx).
export default function HazardScenarioBadge({
  selection,
  countryName,
  visible,
}: HazardScenarioBadgeProps) {
  if (!visible || !selection) {
    return null;
  }

  const productLabel = HAZARD_SCENARIO_PRODUCT_LABELS[selection.product] ?? selection.product;
  const periodLabel =
    selection.returnPeriodYears !== null
      ? `${selection.returnPeriodYears}-year return period`
      : selection.eventLabel
        ? `Event: ${selection.eventLabel}`
        : null;

  return (
    <div
      className="absolute top-4 left-4 z-[24] max-w-[calc(100vw-2rem)] rounded-lg border border-blue-500/40 bg-slate-900/90 px-3 py-2 text-xs text-slate-200 shadow-lg backdrop-blur pointer-events-none"
      data-testid="hazard-scenario-badge"
    >
      <div className="flex items-center gap-1.5 font-semibold text-blue-300">
        <Waves className="w-3.5 h-3.5 flex-shrink-0" />
        <span>{countryName} &middot; Modelled hazard scenario</span>
      </div>
      <dl className="mt-1 space-y-0.5 text-slate-300">
        <div className="flex gap-1">
          <dt className="text-slate-400">Dataset:</dt>
          <dd>{productLabel}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-slate-400">Sea level rise:</dt>
          <dd>{selection.slrScenarioM} m</dd>
        </div>
        {periodLabel && (
          <div className="flex gap-1">
            <dt className="text-slate-400">
              {selection.returnPeriodYears !== null ? 'Return period:' : 'Event:'}
            </dt>
            <dd>
              {selection.returnPeriodYears !== null
                ? `${selection.returnPeriodYears} yr`
                : selection.eventLabel}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
