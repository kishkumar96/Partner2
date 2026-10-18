'use client';

import { Download, Info } from 'lucide-react';
import { describeHazardScenario, HazardScenarioSelection } from '@/data/realThreddsLayers';
import type { HazardScenarioBreakdownRow } from '@/utils/realDataLoader';
import { formatCurrency, formatNumber, formatPercent } from '@/utils/formatters';

const SECTOR_PREFIXES: Record<string, string> = {
  Build: 'Buildings',
  Infra: 'Infrastructure',
};

/** "Build-Residential" -> "Buildings · Residential"; other names unchanged. */
export function formatScenarioSectorName(name: string): string {
  if (!name) return 'Unspecified';
  const [prefix, ...rest] = name.split('-');
  const group = SECTOR_PREFIXES[prefix];
  return group && rest.length > 0 ? `${group} · ${rest.join('-')}` : name;
}

function sharePercent(value: number, total: number): string {
  return total > 0 ? formatPercent((value / total) * 100) : '—';
}

const th = 'px-4 py-2 text-xs font-medium text-slate-400 uppercase tracking-wider';
const td = 'px-4 py-3 text-sm';

interface ScenarioBreakdownTableProps {
  dimension: 'sector' | 'asset_type';
  rows: HazardScenarioBreakdownRow[];
  scenario: HazardScenarioSelection;
  onExport: (rows: Record<string, unknown>[], filename: string, headers: string[]) => void;
}

/**
 * National loss for the selected hazard scenario, by sector or asset type
 * (RiskScenarioBreakdown rows). Losses here are inundation losses, so there
 * is no wind/total split like the baseline event tables have.
 */
export default function ScenarioBreakdownTable({
  dimension,
  rows,
  scenario,
  onExport,
}: ScenarioBreakdownTableProps) {
  const isSector = dimension === 'sector';
  const totalLoss = rows.reduce((sum, row) => sum + row.totalLoss, 0);
  const label = isSector ? 'Sector' : 'Asset Type';

  const exportRows = () => {
    const data = rows.map(row =>
      isSector
        ? { Sector: formatScenarioSectorName(row.name), Loss: row.totalLoss }
        : {
            'Asset Type': row.name || 'Unspecified',
            Sector: formatScenarioSectorName(row.sector),
            'Exposed Count': row.exposedCount ?? '',
            'Exposed Value': row.exposedValue ?? '',
            'Average Inundation Depth (m)': row.averageInundationDepth ?? '',
            Loss: row.totalLoss,
          }
    );
    onExport(
      data,
      `scenario-economic-${isSector ? 'sector' : 'asset'}`,
      Object.keys(data[0] || {})
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="text-sm text-slate-400">
          National loss by {label.toLowerCase()} for the selected hazard scenario.
          <div className="text-[10px] text-slate-400 mt-1">
            {describeHazardScenario(scenario).join(' · ')}
          </div>
        </div>
        <button
          onClick={exportRows}
          className="px-3 py-1 text-xs rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20 transition-colors"
          title="Export to CSV"
        >
          <span className="inline-flex items-center gap-1">
            <Download className="w-3 h-3" aria-hidden="true" />
            Export
          </span>
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-700/60">
          <thead>
            <tr>
              <th className={`${th} text-left`}>{label}</th>
              {!isSector && <th className={`${th} text-left`}>Sector</th>}
              {!isSector && <th className={`${th} text-right`}>Exposed</th>}
              {!isSector && <th className={`${th} text-right`}>Exposed Value</th>}
              {!isSector && <th className={`${th} text-right`}>Avg. Depth</th>}
              <th className={`${th} text-right`}>Loss</th>
              <th className={`${th} text-right`}>Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60">
            {rows.map((row, index) => (
              <tr key={`${row.name}-${row.sector}-${index}`} className="hover:bg-white/5">
                <td className={`${td} text-slate-100 font-medium`}>
                  {isSector ? formatScenarioSectorName(row.name) : row.name || 'Unspecified'}
                </td>
                {!isSector && (
                  <td className={`${td} text-slate-200`}>{formatScenarioSectorName(row.sector)}</td>
                )}
                {!isSector && (
                  <td className={`${td} text-slate-200 text-right`}>
                    {row.exposedCount !== null ? formatNumber(row.exposedCount) : '—'}
                  </td>
                )}
                {!isSector && (
                  <td className={`${td} text-slate-200 text-right`}>
                    {row.exposedValue !== null ? formatCurrency(row.exposedValue) : '—'}
                  </td>
                )}
                {!isSector && (
                  <td className={`${td} text-slate-200 text-right`}>
                    {row.averageInundationDepth !== null
                      ? `${row.averageInundationDepth.toFixed(2)} m`
                      : '—'}
                  </td>
                )}
                <td className={`${td} text-slate-100 text-right font-bold`}>
                  {formatCurrency(row.totalLoss)}
                </td>
                <td className={`${td} text-slate-300 text-right`}>
                  {sharePercent(row.totalLoss, totalLoss)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-900/40 border-t-2 border-slate-700">
            <tr>
              <td className={`${td} font-bold text-slate-100`} colSpan={isSector ? 1 : 5}>
                TOTAL
              </td>
              <td className={`${td} font-bold text-slate-100 text-right`}>
                {formatCurrency(totalLoss)}
              </td>
              <td className={`${td} font-bold text-slate-100 text-right`}>
                {totalLoss > 0 ? '100%' : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

interface ScenarioBaselineNoticeProps {
  scenario: HazardScenarioSelection;
  scenarioRiskSummary: Record<string, unknown> | null;
  /** What this tab shows instead, e.g. "island figures" */
  subject: string;
  /** Why it can't follow the scenario */
  reason: string;
}

/**
 * Shown on tabs whose data has no per-scenario version, so their figures
 * aren't mistaken for the scenario selected on the map.
 */
export function ScenarioBaselineNotice({
  scenario,
  scenarioRiskSummary,
  subject,
  reason,
}: ScenarioBaselineNoticeProps) {
  const totalLoss = Number(scenarioRiskSummary?.total_loss);
  const exposedPopulation = Number(scenarioRiskSummary?.exposed_population);
  const hasTotals = scenarioRiskSummary !== null && Number.isFinite(totalLoss);

  return (
    <div
      role="note"
      className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
    >
      <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-300" aria-hidden="true" />
      <div>
        <div>
          <strong>Baseline analysis:</strong>{' '}
          {`These ${subject} don’t change with the hazard scenario selected on the map. ${reason}`}
        </div>
        {hasTotals && (
          <div className="mt-1 text-amber-200/90">
            Selected scenario ({describeHazardScenario(scenario).join(' · ')}), national:{' '}
            <strong>{formatCurrency(totalLoss)}</strong> loss
            {Number.isFinite(exposedPopulation) && (
              <>
                , <strong>{formatNumber(exposedPopulation)}</strong> people exposed
              </>
            )}
            .
          </div>
        )}
      </div>
    </div>
  );
}
