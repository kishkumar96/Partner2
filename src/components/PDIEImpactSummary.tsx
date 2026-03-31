'use client';

import { formatCurrency, formatNumber } from '@/utils/formatters';

interface ImpactBySector {
  Total_Loss?: number | string | null;
  [key: string]: unknown;
}

interface NationalSummary {
  Buildings_Exposed_To_Any_Hazard?: number | string | null;
  Damaged_Buildings?: number | string | null;
  [key: string]: unknown;
}

interface PDIEImpactSummaryProps {
  impactBySector?: ImpactBySector[];
  nationalSummary?: NationalSummary[];
  isLoading?: boolean;
}

export default function PDIEImpactSummary({
  impactBySector = [],
  nationalSummary = [],
}: PDIEImpactSummaryProps): React.ReactElement {
  const totalLoss = impactBySector.length
    ? impactBySector.reduce(
        (sum: number, row: ImpactBySector) => sum + Number(row.Total_Loss || 0),
        0
      )
    : 0;

  const totalExposed = Number(nationalSummary?.[0]?.Buildings_Exposed_To_Any_Hazard || 0);
  const totalDamaged = Number(nationalSummary?.[0]?.Damaged_Buildings || 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel glass-panel-hover rounded-xl p-6 border-l-4 border-neon-coral">
          <h3 className="text-sm font-semibold tracking-widest text-slate-300 uppercase">
            Total Economic Damage
          </h3>
          <p className="text-3xl font-bold mt-2 text-neon-coral">{formatCurrency(totalLoss)}</p>
        </div>

        <div className="glass-panel glass-panel-hover rounded-xl p-6 border-l-4 border-neon-amber">
          <h3 className="text-sm font-semibold tracking-widest text-slate-300 uppercase">
            Buildings Exposed
          </h3>
          <p className="text-3xl font-bold mt-2 text-neon-amber">{formatNumber(totalExposed)}</p>
        </div>

        <div className="glass-panel glass-panel-hover rounded-xl p-6 border-l-4 border-neon-purple">
          <h3 className="text-sm font-semibold tracking-widest text-slate-300 uppercase">
            Buildings Damaged
          </h3>
          <p className="text-3xl font-bold mt-2 text-neon-purple">{formatNumber(totalDamaged)}</p>
        </div>
      </div>

      {/* Tables moved to SummaryPanel (right sidebar) for better visibility */}
      <div className="glass-panel rounded-xl p-6 animate-fadeSlide">
        <h3 className="text-lg font-semibold text-slate-100 mb-4">✓ Detailed Impact Analysis</h3>
        <p className="text-sm text-slate-300">
          The Impact by Sector and Impact by Asset Type tables are now permanently visible in the
          right sidebar for quick reference.
        </p>
      </div>
    </div>
  );
}
