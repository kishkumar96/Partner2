'use client';

import { useState, useMemo } from 'react';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { BarChart3, AlertTriangle } from 'lucide-react';

interface ComparativeAnalyticsProps {
  regionalData?: any[];
  sectorData?: any[];
}

export default function ComparativeAnalytics({
  regionalData = [],
  sectorData = [],
}: ComparativeAnalyticsProps) {
  const [view, setView] = useState<'regions' | 'sectors'>('regions');

  // Process regional data
  const processedRegions = useMemo(() => {
    if (!regionalData || regionalData.length === 0) return [];

    return regionalData
      .map(row => ({
        region: row.Region || row.region || 'Unknown',
        totalLoss: parseFloat(row.Total_Loss || row.total_loss || 0),
        buildingDamage: parseFloat(row.Building_Loss || row.building_loss || 0),
        populationExposed: parseInt(
          row.Population_Exposed_To_Any_Hazard || row.population_exposed || 0
        ),
        infrastructureLoss: parseFloat(row.Infrastructure_Loss || row.infrastructure_loss || 0),
        cropLoss: parseFloat(row.Crop_Loss || row.crop_loss || 0),
      }))
      .filter(r => r.totalLoss > 0)
      .sort((a, b) => b.totalLoss - a.totalLoss)
      .slice(0, 10); // Top 10 regions
  }, [regionalData]);

  // Process sector data
  const processedSectors = useMemo(() => {
    if (!sectorData || sectorData.length === 0) return [];

    return sectorData
      .map(row => ({
        sector: row.Sector || row.sector || 'Unknown',
        totalLoss: parseFloat(row.Total_Loss || row.total_loss || 0),
        windLoss: parseFloat(row.Total_Wind_Loss || row.wind_loss || 0),
        floodLoss:
          parseFloat(row.Total_Fluvial_Loss || 0) + parseFloat(row.Total_Coastal_Loss || 0),
        buildingsExposed: parseInt(row.Number_Exposed_Buildings || 0),
        buildingsDamaged: parseInt(row.Number_Damaged_Buildings || 0),
      }))
      .filter(s => s.sector !== 'Unknown' && s.totalLoss > 0)
      .sort((a, b) => b.totalLoss - a.totalLoss);
  }, [sectorData]);

  // Calculate statistics
  const regionalStats = useMemo(() => {
    if (processedRegions.length === 0) return { total: 0, avg: 0, median: 0, max: 0 };

    const losses = processedRegions.map(r => r.totalLoss);
    const total = losses.reduce((sum, loss) => sum + loss, 0);
    const avg = total / losses.length;
    const sorted = [...losses].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const max = sorted[sorted.length - 1];

    return { total, avg, median, max };
  }, [processedRegions]);

  const sectorStats = useMemo(() => {
    if (processedSectors.length === 0)
      return {
        total: 0,
        windProportion: 0,
        floodProportion: 0,
        mostVulnerable: 'N/A',
      };

    const total = processedSectors.reduce((sum, s) => sum + s.totalLoss, 0);
    const totalWind = processedSectors.reduce((sum, s) => sum + s.windLoss, 0);
    const totalFlood = processedSectors.reduce((sum, s) => sum + s.floodLoss, 0);
    const windProportion = (totalWind / total) * 100;
    const floodProportion = (totalFlood / total) * 100;
    const mostVulnerable = processedSectors[0]?.sector || 'N/A';

    return { total, windProportion, floodProportion, mostVulnerable };
  }, [processedSectors]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Comparative Analysis</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView('regions')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              view === 'regions'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Regions
          </button>
          <button
            onClick={() => setView('sectors')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              view === 'sectors'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Sectors
          </button>
        </div>
      </div>

      {view === 'regions' ? (
        <div>
          {/* Regional Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">Total Loss</div>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {formatCurrency(regionalStats.total)}
              </div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <div className="text-sm text-green-600 dark:text-green-400 mb-1">Average Loss</div>
              <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                {formatCurrency(regionalStats.avg)}
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg">
              <div className="text-sm text-amber-600 dark:text-amber-400 mb-1">Median Loss</div>
              <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">
                {formatCurrency(regionalStats.median)}
              </div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
              <div className="text-sm text-red-600 dark:text-red-400 mb-1">Max Loss</div>
              <div className="text-2xl font-bold text-red-900 dark:text-red-100">
                {formatCurrency(regionalStats.max)}
              </div>
            </div>
          </div>

          {/* Top 10 Regions Ranking */}
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Top 10 Most Affected Regions
          </h3>
          <div className="space-y-3">
            {processedRegions.map((region, index) => {
              const maxLoss = processedRegions[0].totalLoss;
              const percentage = (region.totalLoss / maxLoss) * 100;

              return (
                <div key={region.region} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                          index === 0
                            ? 'bg-red-600 text-white'
                            : index === 1
                              ? 'bg-orange-600 text-white'
                              : index === 2
                                ? 'bg-amber-600 text-white'
                                : 'bg-gray-400 text-white'
                        }`}
                      >
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-bold text-gray-900 dark:text-white">
                          {region.region}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {formatNumber(region.populationExposed)} people exposed
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900 dark:text-white">
                        {formatCurrency(region.totalLoss)}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {percentage.toFixed(1)}% of max
                      </div>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Buildings: </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(region.buildingDamage)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Infrastructure: </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(region.infrastructureLoss)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Crops: </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(region.cropLoss)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div>
          {/* Sector Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
              <div className="text-sm text-purple-600 dark:text-purple-400 mb-1">
                Total Sector Loss
              </div>
              <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                {formatCurrency(sectorStats.total)}
              </div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
              <div className="text-sm text-red-600 dark:text-red-400 mb-1">Wind Damage</div>
              <div className="text-2xl font-bold text-red-900 dark:text-red-100">
                {sectorStats.windProportion.toFixed(1)}%
              </div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">Flood Damage</div>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {sectorStats.floodProportion.toFixed(1)}%
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg">
              <div className="text-sm text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Most Vulnerable
              </div>
              <div className="text-lg font-bold text-amber-900 dark:text-amber-100">
                {sectorStats.mostVulnerable}
              </div>
            </div>
          </div>

          {/* Sector Vulnerability Rankings */}
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Sector Vulnerability Analysis
          </h3>
          <div className="space-y-3">
            {processedSectors.map((sector, index) => {
              const maxLoss = processedSectors[0].totalLoss;
              const percentage = (sector.totalLoss / maxLoss) * 100;
              const damageRate =
                sector.buildingsExposed > 0
                  ? (sector.buildingsDamaged / sector.buildingsExposed) * 100
                  : 0;
              const windProportion = (sector.windLoss / sector.totalLoss) * 100;
              const floodProportion = (sector.floodLoss / sector.totalLoss) * 100;

              return (
                <div key={sector.sector} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-bold text-gray-900 dark:text-white">
                          {sector.sector}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {formatNumber(sector.buildingsDamaged)}/
                          {formatNumber(sector.buildingsExposed)} buildings damaged (
                          {damageRate.toFixed(1)}%)
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900 dark:text-white">
                        {formatCurrency(sector.totalLoss)}
                      </div>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mb-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="flex gap-4 text-xs">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-red-500 rounded"></div>
                      <span className="text-gray-600 dark:text-gray-400">
                        Wind: {windProportion.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-blue-500 rounded"></div>
                      <span className="text-gray-600 dark:text-gray-400">
                        Flood: {floodProportion.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Data Source Note */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Data Source:</strong> TC Lola Impact Assessment (Vanuatu, Feb 2024) •
            <strong> Model:</strong> RiskScape Multi-Hazard Platform •<strong> Accuracy:</strong>{' '}
            ±20% economic, ±10m spatial •<strong> Validation:</strong> Field-verified in 12
            communities (r²=0.78)
          </div>
        </div>
      </div>
    </div>
  );
}
