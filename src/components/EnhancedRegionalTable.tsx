'use client';

import { formatCurrency, formatNumber } from '@/utils/formatters';

interface RegionalData {
  id: string;
  name: string;
  economicLoss: number;
  populationAffected: number;
  assetsExposed: number;
  assetsDamaged: number;
  area: number;
  totalPopulation: number;
}

interface EnhancedRegionalTableProps {
  data: RegionalData[];
  nationalTotal: number;
  showDerivedMetrics?: boolean;
}

export default function EnhancedRegionalTable({
  data,
  nationalTotal,
  showDerivedMetrics = false,
}: EnhancedRegionalTableProps) {
  // Sort by economic loss descending
  const sortedData = [...data].sort((a, b) => b.economicLoss - a.economicLoss);

  // Calculate derived metrics
  const calculateDerivedMetrics = (region: RegionalData) => {
    return {
      damageRate:
        region.assetsExposed > 0 ? (region.assetsDamaged / region.assetsExposed) * 100 : 0,
      lossPerCapita:
        region.populationAffected > 0 ? region.economicLoss / region.populationAffected : 0,
      contributionToTotal: nationalTotal > 0 ? (region.economicLoss / nationalTotal) * 100 : 0,
      populationDensity: region.area > 0 ? region.totalPopulation / region.area : 0,
    };
  };

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-white/10">
        <h3 className="text-lg font-semibold text-white">Regional Analysis</h3>
        {showDerivedMetrics && (
          <p className="text-sm text-white/60 mt-1">
            Including damage rates and per-capita impacts
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="text-left p-3 text-white/80 font-medium">Region</th>
              <th className="text-right p-3 text-white/80 font-medium">Economic Loss</th>
              <th className="text-right p-3 text-white/80 font-medium">Population Affected</th>
              <th className="text-right p-3 text-white/80 font-medium">Assets Exposed</th>
              <th className="text-right p-3 text-white/80 font-medium">Assets Damaged</th>
              {showDerivedMetrics && (
                <>
                  <th className="text-right p-3 text-white/80 font-medium">Damage Rate</th>
                  <th className="text-right p-3 text-white/80 font-medium">Loss per Capita</th>
                  <th className="text-right p-3 text-white/80 font-medium">% of Total</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((region, idx) => {
              const metrics = showDerivedMetrics ? calculateDerivedMetrics(region) : null;

              return (
                <tr
                  key={region.id}
                  className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                    idx % 2 === 0 ? 'bg-white/0' : 'bg-white/[0.02]'
                  }`}
                >
                  <td className="p-3 text-white font-medium">{region.name}</td>
                  <td className="p-3 text-right text-white">
                    {formatCurrency(region.economicLoss)}
                  </td>
                  <td className="p-3 text-right text-white/80">
                    {formatNumber(region.populationAffected)}
                  </td>
                  <td className="p-3 text-right text-white/80">
                    {formatNumber(region.assetsExposed)}
                  </td>
                  <td className="p-3 text-right text-white/80">
                    {formatNumber(region.assetsDamaged)}
                  </td>
                  {showDerivedMetrics && metrics && (
                    <>
                      <td className="p-3 text-right text-white/80">
                        {metrics.damageRate.toFixed(1)}%
                      </td>
                      <td className="p-3 text-right text-white/80">
                        {formatCurrency(metrics.lossPerCapita)}
                      </td>
                      <td className="p-3 text-right text-white/80">
                        {metrics.contributionToTotal.toFixed(1)}%
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-white/5 border-t border-white/10">
            <tr>
              <td className="p-3 text-white font-semibold">Total</td>
              <td className="p-3 text-right text-white font-semibold">
                {formatCurrency(nationalTotal)}
              </td>
              <td className="p-3 text-right text-white/80 font-semibold">
                {formatNumber(sortedData.reduce((sum, r) => sum + r.populationAffected, 0))}
              </td>
              <td className="p-3 text-right text-white/80 font-semibold">
                {formatNumber(sortedData.reduce((sum, r) => sum + r.assetsExposed, 0))}
              </td>
              <td className="p-3 text-right text-white/80 font-semibold">
                {formatNumber(sortedData.reduce((sum, r) => sum + r.assetsDamaged, 0))}
              </td>
              {showDerivedMetrics && (
                <>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3 text-right text-white/80 font-semibold">100.0%</td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
