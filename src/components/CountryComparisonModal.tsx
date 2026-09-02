'use client';

/**
 * Side-by-side comparison of all four countries' headline impact figures.
 * Reuses the same loadAllRealData/fetchHazardScenarioRiskSummary pipeline
 * every single-country dashboard already relies on, rather than a bespoke
 * summary endpoint -- so a number shown here is guaranteed to match what
 * that country's own dashboard shows.
 */

import { useEffect, useRef, useState } from 'react';
import { X, TriangleAlert, Scale } from 'lucide-react';
import CountryFlag from '@/components/CountryFlag';
import { CountryCode, COUNTRIES } from '@/types/thredds';
import { getDefaultHazardScenario } from '@/data/realThreddsLayers';
import { loadAllRealData, fetchHazardScenarioRiskSummary } from '@/utils/realDataLoader';
import { formatCurrency, formatNumber } from '@/utils/formatters';

const ALL_COUNTRIES: CountryCode[] = ['VU', 'WS', 'TO', 'CK'];

interface CountryComparisonRow {
  countryCode: CountryCode;
  status: 'loading' | 'ready' | 'error';
  totalEconomicDamage: number;
  totalAffectedPopulation: number;
  topSector: string | null;
  topRegion: string | null;
  regionCount: number;
  hasHazardScenarioLayer: boolean;
  hasScenarioLinkedTotals: boolean;
}

function emptyRow(countryCode: CountryCode): CountryComparisonRow {
  return {
    countryCode,
    status: 'loading',
    totalEconomicDamage: 0,
    totalAffectedPopulation: 0,
    topSector: null,
    topRegion: null,
    regionCount: 0,
    hasHazardScenarioLayer: false,
    hasScenarioLinkedTotals: false,
  };
}

async function loadComparisonRow(countryCode: CountryCode): Promise<CountryComparisonRow> {
  // Deliberately the same full fetch (default flags) every single-country
  // dashboard uses -- trimming includeSupplementaryData/includeDamagedAssets
  // here looked like a safe optimization but silently zeroed out the
  // headline totals (they depend on nationalSummary/regionalSummary data
  // that those flags gate off). Correctness matters more than shaving one
  // request on a modal the user opens on demand.
  const result = await loadAllRealData({ countryCode });

  // Matches SummaryPanel's own csvTotals computation exactly (national
  // summary row's Total_Loss / Population_Exposed_To_Any_Hazard) rather
  // than result.events[0]'s totals, which run through a separate
  // region-geometry-enrichment path that doesn't always agree with it.
  const nationalRow = result.nationalSummary?.[0] as Record<string, unknown> | undefined;
  const totalEconomicDamage = Number(nationalRow?.Total_Loss) || 0;
  const totalAffectedPopulation = Number(nationalRow?.Population_Exposed_To_Any_Hazard) || 0;

  const regionalImpacts = (result.regionalImpactsData ?? []) as Array<{
    regionName: string;
    economicDamage: number;
  }>;
  const topRegionRow = [...regionalImpacts].sort((a, b) => b.economicDamage - a.economicDamage)[0];

  const impactBySector = (result.impactBySector ?? []) as Array<{
    Sector?: string;
    Total_Loss?: number;
  }>;
  const topSectorRow = [...impactBySector]
    .filter(row => row.Sector && row.Sector !== 'Unknown')
    .sort((a, b) => (Number(b.Total_Loss) || 0) - (Number(a.Total_Loss) || 0))[0];

  const hazardLayers = result.partnerHazardLayers ?? [];
  const hasHazardScenarioLayer = hazardLayers.some(layer => !!layer.hazardScenario);

  // Mirrors SummaryPanel's own priority exactly: a scenario-linked total
  // (RiskScenario row for the map's default scenario) wins over the static
  // national total when one exists, so this modal never shows a different
  // figure than the country's own dashboard does.
  let hasScenarioLinkedTotals = false;
  let scenarioEconomicDamage: number | null = null;
  let scenarioAffectedPopulation: number | null = null;
  if (hasHazardScenarioLayer) {
    const defaultScenario = getDefaultHazardScenario(hazardLayers);
    if (defaultScenario) {
      const scenarioSummary = await fetchHazardScenarioRiskSummary(countryCode, defaultScenario);
      if (scenarioSummary) {
        hasScenarioLinkedTotals = true;
        scenarioEconomicDamage = Number(scenarioSummary.total_loss) || 0;
        scenarioAffectedPopulation = Number(scenarioSummary.exposed_population) || 0;
      }
    }
  }

  return {
    countryCode,
    status: 'ready',
    totalEconomicDamage: scenarioEconomicDamage ?? totalEconomicDamage,
    totalAffectedPopulation: scenarioAffectedPopulation ?? totalAffectedPopulation,
    topSector: topSectorRow?.Sector ?? null,
    topRegion: topRegionRow?.regionName ?? null,
    regionCount: regionalImpacts.length,
    hasHazardScenarioLayer,
    hasScenarioLinkedTotals,
  };
}

export default function CountryComparisonModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Record<CountryCode, CountryComparisonRow>>(
    () =>
      Object.fromEntries(ALL_COUNTRIES.map(code => [code, emptyRow(code)])) as Record<
        CountryCode,
        CountryComparisonRow
      >
  );

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Same focus-management pattern as MapAccessibleFeatures: move focus in
  // on open, back to whatever triggered it on close -- otherwise a keyboard
  // or screen-reader user has no indication focus went anywhere, and Tab
  // keeps walking the page behind the modal instead of its own content.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      closeButtonRef.current?.focus();
    } else {
      previouslyFocusedRef.current?.focus();
    }
  }, [open]);

  const getFocusableElements = () => {
    if (!dialogRef.current) return [];
    return Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => !el.hasAttribute('disabled'));
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  useEffect(() => {
    if (!open) return;

    setRows(
      Object.fromEntries(ALL_COUNTRIES.map(code => [code, emptyRow(code)])) as Record<
        CountryCode,
        CountryComparisonRow
      >
    );

    let cancelled = false;
    ALL_COUNTRIES.forEach(code => {
      loadComparisonRow(code)
        .then(row => {
          if (!cancelled) setRows(prev => ({ ...prev, [code]: row }));
        })
        .catch(() => {
          if (!cancelled) {
            setRows(prev => ({ ...prev, [code]: { ...emptyRow(code), status: 'error' } }));
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const rowList = ALL_COUNTRIES.map(code => rows[code]);
  const maxDamage = Math.max(1, ...rowList.map(r => r.totalEconomicDamage));

  return (
    <div
      ref={dialogRef}
      onKeyDown={handleDialogKeyDown}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-countries-title"
    >
      <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/98 to-slate-950/98 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700/50 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 id="compare-countries-title" className="text-lg font-bold text-slate-100">
                Compare countries
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Same figures as each country&apos;s own dashboard, side by side
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close compare countries"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Economic damage bars */}
          <div className="space-y-2.5">
            {rowList.map(row => (
              <div key={row.countryCode} className="flex items-center gap-3">
                <div className="w-28 flex items-center gap-2 flex-shrink-0">
                  <CountryFlag countryCode={row.countryCode} className="h-4 w-6 rounded-[3px]" />
                  <span className="text-xs text-slate-300 truncate">
                    {COUNTRIES[row.countryCode].name}
                  </span>
                </div>
                <div className="flex-1 h-6 rounded-md bg-slate-800/60 overflow-hidden">
                  {row.status === 'ready' && (
                    <div
                      className="h-full rounded-md bg-gradient-to-r from-red-500/70 to-red-400/70 transition-all duration-500"
                      style={{
                        width: `${Math.max(3, (row.totalEconomicDamage / maxDamage) * 100)}%`,
                      }}
                    />
                  )}
                </div>
                <div className="w-28 text-right text-xs font-mono text-slate-200 flex-shrink-0">
                  {row.status === 'loading'
                    ? '…'
                    : row.status === 'error'
                      ? 'unavailable'
                      : formatCurrency(row.totalEconomicDamage)}
                </div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-700/50">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800/60 text-slate-400">
                  <th className="text-left font-semibold px-3 py-2">Country</th>
                  <th className="text-right font-semibold px-3 py-2">Economic damage</th>
                  <th className="text-right font-semibold px-3 py-2">Affected population</th>
                  <th className="text-left font-semibold px-3 py-2">Top sector</th>
                  <th className="text-left font-semibold px-3 py-2">Top region</th>
                  <th className="text-left font-semibold px-3 py-2">Scenario data</th>
                </tr>
              </thead>
              <tbody>
                {rowList.map(row => (
                  <tr key={row.countryCode} className="border-t border-slate-700/40 text-slate-200">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <CountryFlag
                          countryCode={row.countryCode}
                          className="h-3.5 w-5 rounded-[3px]"
                        />
                        {COUNTRIES[row.countryCode].name}
                      </div>
                    </td>
                    {row.status === 'loading' ? (
                      <td colSpan={5} className="px-3 py-2.5 text-slate-500">
                        Loading…
                      </td>
                    ) : row.status === 'error' ? (
                      <td colSpan={5} className="px-3 py-2.5 text-red-400">
                        Couldn&apos;t load this country&apos;s data
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-right font-mono">
                          {formatCurrency(row.totalEconomicDamage)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          {formatNumber(row.totalAffectedPopulation)}
                        </td>
                        <td className="px-3 py-2.5">{row.topSector ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          {row.topRegion ?? '—'}
                          {row.regionCount > 0 && (
                            <span className="text-slate-500"> ({row.regionCount} total)</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.hasScenarioLinkedTotals ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                              Scenario-linked
                            </span>
                          ) : row.hasHazardScenarioLayer ? (
                            <span className="inline-flex items-center gap-1 text-amber-400">
                              Map layer only
                            </span>
                          ) : (
                            <span className="text-slate-500">Not available</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <TriangleAlert className="w-3.5 h-3.5 text-amber-300 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] leading-snug text-amber-200">
              &quot;Scenario-linked&quot; means the economic-damage figure updates when you change
              the map&apos;s sea-level-rise / return-period selector. &quot;Map layer only&quot;
              means real flood-hazard tiles exist for that scenario, but the dollar figures shown
              are the country&apos;s static total, not tied to it — that needs loss modeling that
              hasn&apos;t been done for that country yet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
