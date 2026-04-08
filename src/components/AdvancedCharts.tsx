'use client';

import { useEffect, useMemo, useState, memo } from 'react';
import { createPortal } from 'react-dom';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

import { RegionalSummary, RegionalSummaryBySector } from '@/types';
import { SEVERITY_COLORS, UI_COLORS } from '@/theme/colors';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface AdvancedChartsProps {
  regionalSummary: RegionalSummary[];
  regionalSummaryBySector: RegionalSummaryBySector[];
  maxRegions?: number; // Allow caller to specify max regions to display
}

/**
 * Advanced analytics charts for disaster impact analysis
 * - Stacked bar: Region × Sector
 * - Radar: Multi-sector regional profile
 * - Scatter: Population vs Economic Loss
 */
const AdvancedCharts = memo(function AdvancedCharts({
  regionalSummary,
  regionalSummaryBySector,
  maxRegions = 10,
}: AdvancedChartsProps) {
  const [showMatrixOverlay, setShowMatrixOverlay] = useState(false);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);
  const [viewMode, setViewMode] = useState<'bar' | 'heatmap'>('heatmap');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    Promise.resolve().then(() => {
      setOverlayRoot(document.getElementById('map-overlay-root'));
    });
  }, []);

  // 1. Heatmap Matrix: Sector × Region Loss Analysis
  const heatmapData = useMemo(() => {
    // Comprehensive validation
    if (
      !regionalSummaryBySector ||
      !Array.isArray(regionalSummaryBySector) ||
      regionalSummaryBySector.length === 0
    ) {
      console.warn('AdvancedCharts: Invalid or empty regionalSummaryBySector data');
      return null;
    }

    // Validate data structure
    const hasValidStructure = regionalSummaryBySector.every(
      item => item && typeof item === 'object' && 'Region' in item && 'Sector' in item
    );

    if (!hasValidStructure) {
      console.error('AdvancedCharts: Data structure validation failed');
      return null;
    }

    // Sort by total loss descending to show most impacted regions
    const regionsByLoss = [...new Set(regionalSummaryBySector.map(r => r.Region))]
      .filter(Boolean)
      .map(region => ({
        name: region,
        totalLoss: regionalSummaryBySector
          .filter(r => r.Region === region)
          .reduce((sum, r) => sum + (r.Total_Loss || 0), 0),
      }))
      .sort((a, b) => b.totalLoss - a.totalLoss)
      .slice(0, maxRegions)
      .map(r => r.name);

    const sectors = ['Residential', 'Infrastructure', 'Public', 'Productive', 'Education', 'Other'];

    // Create matrix data
    const matrix = sectors.map(sector => {
      return regionsByLoss.map(region => {
        const record = regionalSummaryBySector.find(
          r => r.Region === region && r.Sector === sector
        );
        return Number(record?.Total_Loss || 0) / 1000000; // Convert to millions
      });
    });

    const flatMatrix = matrix.flat();
    const maxValue = flatMatrix.length ? Math.max(...flatMatrix) : 0;

    return {
      sectors,
      regions: regionsByLoss,
      matrix,
      maxValue,
    };
  }, [regionalSummaryBySector, maxRegions]);

  // 2. Simple Regional Total Bar Chart
  const regionalTotalData = useMemo(() => {
    if (!regionalSummary || !Array.isArray(regionalSummary) || regionalSummary.length === 0) {
      console.warn('AdvancedCharts: Invalid regionalSummary data');
      return null;
    }

    // Exclude Unknown sector from totals
    const regionTotals = regionalSummary
      .filter(r => r.Region && r.Region.trim() !== '')
      .map(r => {
        const sectorsData = regionalSummaryBySector
          .filter(s => s.Region === r.Region && s.Sector !== 'Unknown')
          .reduce((sum, s) => sum + (Number(s.Total_Loss) || 0), 0);
        return {
          region: r.Region,
          total: sectorsData,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    return {
      labels: regionTotals.map(r => r.region),
      datasets: [
        {
          label: 'Total Economic Damage (Millions USD)',
          data: regionTotals.map(r => r.total / 1000000),
          backgroundColor: SEVERITY_COLORS.critical.border,
          borderRadius: 4,
        },
      ],
    };
  }, [regionalSummary, regionalSummaryBySector]);

  const regionalTotalOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => `Loss: $${context.parsed.y.toFixed(2)}M`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 9 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: UI_COLORS.borderSubtle },
        ticks: {
          font: { size: 9 },
          callback: (value: any) => `$${value.toFixed(1)}M`,
        },
      },
    },
  };

  const getHeatmapColor = (value: number, maxValue: number) => {
    const intensity = value / maxValue;
    if (intensity === 0) return UI_COLORS.glassDark; // Dark background for zero
    if (intensity < 0.2) return 'rgba(34, 197, 94, 0.25)'; // green-500 (low)
    if (intensity < 0.4) return 'rgba(251, 191, 36, 0.45)'; // amber-400 (medium-low)
    if (intensity < 0.6) return 'rgba(249, 115, 22, 0.65)'; // orange-500 (medium)
    if (intensity < 0.8) return 'rgba(239, 68, 68, 0.8)'; // red-500 (high)
    return 'rgba(220, 38, 38, 0.9)'; // red-600 (critical)
  };

  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-100">Regional Economic Analysis</h4>
          <p className="text-xs text-slate-400 mt-1">
            {viewMode === 'heatmap'
              ? 'Sector-region Damage distribution (darker = higher Damage)'
              : 'Top regions by aggregate economic Damage'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setViewMode('heatmap')}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              viewMode === 'heatmap'
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600'
            }`}
          >
            Heatmap
          </button>
          <button
            type="button"
            onClick={() => setViewMode('bar')}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              viewMode === 'bar'
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600'
            }`}
          >
            Bar Chart
          </button>
        </div>
      </div>

      {viewMode === 'bar' && (
        <div>
          {regionalTotalData ? (
            <div className="h-56">
              <Bar data={regionalTotalData} options={regionalTotalOptions} />
            </div>
          ) : (
            <div className="text-xs text-slate-400">No regional totals available.</div>
          )}
        </div>
      )}

      {viewMode === 'heatmap' && (
        <div>
          <div className="flex items-end justify-end mb-3">
            <button
              type="button"
              onClick={() => setShowMatrixOverlay(true)}
              className="text-xs px-2.5 py-1.5 rounded-md border border-slate-600/60 text-slate-200 bg-slate-900/60 hover:bg-slate-800/70 transition-colors"
              aria-label="Expand impact matrix"
            >
              Expand Fullscreen
            </button>
          </div>
          {heatmapData ? (
            <>
              <div className="overflow-x-auto pb-2">
                <div className="inline-block min-w-[520px]">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="text-xs font-semibold text-slate-300 p-2 border border-slate-700 bg-slate-800 sticky left-0 z-10">
                          Sector
                        </th>
                        {heatmapData.regions.map((region, idx) => (
                          <th
                            key={idx}
                            className="text-xs font-semibold text-slate-300 p-2 border border-slate-700 bg-slate-800 min-w-[90px] truncate"
                          >
                            {region}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heatmapData.sectors.map((sector, sectorIdx) => (
                        <tr key={sectorIdx}>
                          <td className="text-xs font-semibold text-slate-300 p-2 border border-slate-700 bg-slate-800 sticky left-0 z-10">
                            {sector}
                          </td>
                          {heatmapData.matrix[sectorIdx].map((value, regionIdx) => (
                            <td
                              key={regionIdx}
                              className="text-xs text-center p-2 border border-slate-700 transition-all hover:ring-2 hover:ring-blue-500 cursor-default"
                              style={{
                                backgroundColor: getHeatmapColor(value, heatmapData.maxValue),
                              }}
                              title={`${sector} in ${heatmapData.regions[regionIdx]}: $${value.toFixed(2)}M`}
                            >
                              <div className="font-mono font-semibold text-slate-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.35)]">
                                {value > 0 ? `$${value.toFixed(1)}M` : '—'}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
                <span className="text-slate-400">Legend:</span>
                <div className="flex items-center gap-1">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}
                  ></div>
                  <span className="text-slate-400">None</span>
                </div>
                <div className="flex items-center gap-1">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: 'rgba(34, 197, 94, 0.3)' }}
                  ></div>
                  <span className="text-slate-400">Low</span>
                </div>
                <div className="flex items-center gap-1">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: 'rgba(251, 191, 36, 0.5)' }}
                  ></div>
                  <span className="text-slate-400">Moderate</span>
                </div>
                <div className="flex items-center gap-1">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: 'rgba(249, 115, 22, 0.7)' }}
                  ></div>
                  <span className="text-slate-400">High</span>
                </div>
                <div className="flex items-center gap-1">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.8)' }}
                  ></div>
                  <span className="text-slate-400">Very High</span>
                </div>
                <div className="flex items-center gap-1">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: 'rgba(185, 28, 28, 0.9)' }}
                  ></div>
                  <span className="text-slate-400">Critical</span>
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-400">No matrix data available.</div>
          )}
        </div>
      )}

      {showMatrixOverlay && heatmapData && (
        <ImpactMatrixOverlay
          heatmapData={heatmapData}
          onClose={() => setShowMatrixOverlay(false)}
          getHeatmapColor={getHeatmapColor}
          portalRoot={overlayRoot}
        />
      )}
    </div>
  );
});

function ImpactMatrixOverlay({
  heatmapData,
  onClose,
  getHeatmapColor,
  portalRoot,
}: {
  heatmapData: {
    sectors: string[];
    regions: string[];
    matrix: number[][];
    maxValue: number;
  };
  onClose: () => void;
  getHeatmapColor: (value: number, maxValue: number) => string;
  portalRoot: HTMLElement | null;
}) {
  const content = (
    <div className="absolute inset-0 pointer-events-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center">
      <div className="w-[min(920px,92vw)] max-h-[84vh] rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Impact Matrix</h3>
            <p className="text-xs text-slate-400">Sector Damage by region (Millions USD)</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-2.5 py-1.5 rounded-md border border-slate-600/60 text-slate-200 bg-slate-900/60 hover:bg-slate-800/70 transition-colors"
            aria-label="Close impact matrix"
          >
            Close
          </button>
        </div>

        <div className="p-4 overflow-auto max-h-[calc(84vh-60px)]">
          <div className="inline-block min-w-[860px]">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-xs font-semibold text-slate-300 p-2 border border-slate-700 bg-slate-800 sticky left-0 z-10">
                    Sector
                  </th>
                  {heatmapData.regions.map((region, idx) => (
                    <th
                      key={idx}
                      className="text-xs font-semibold text-slate-300 p-2 border border-slate-700 bg-slate-800 min-w-[110px] truncate"
                    >
                      {region}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapData.sectors.map((sector, sectorIdx) => (
                  <tr key={sectorIdx}>
                    <td className="text-xs font-semibold text-slate-300 p-2 border border-slate-700 bg-slate-800 sticky left-0 z-10">
                      {sector}
                    </td>
                    {heatmapData.matrix[sectorIdx].map((value, regionIdx) => (
                      <td
                        key={regionIdx}
                        className="text-xs text-center p-2 border border-slate-700 transition-all hover:ring-2 hover:ring-blue-500 cursor-default"
                        style={{
                          backgroundColor: getHeatmapColor(value, heatmapData.maxValue),
                        }}
                        title={`${sector} in ${heatmapData.regions[regionIdx]}: $${value.toFixed(2)}M`}
                      >
                        <div className="font-mono font-semibold text-slate-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.35)]">
                          {value > 0 ? `$${value.toFixed(1)}M` : '—'}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4 text-xs">
            <span className="text-slate-400">Legend:</span>
            <div className="flex items-center gap-1">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}
              ></div>
              <span className="text-slate-400">None</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: 'rgba(34, 197, 94, 0.3)' }}
              ></div>
              <span className="text-slate-400">Low</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: 'rgba(251, 191, 36, 0.5)' }}
              ></div>
              <span className="text-slate-400">Moderate</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: 'rgba(249, 115, 22, 0.7)' }}
              ></div>
              <span className="text-slate-400">High</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.8)' }}
              ></div>
              <span className="text-slate-400">Very High</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: 'rgba(185, 28, 28, 0.9)' }}
              ></div>
              <span className="text-slate-400">Critical</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (portalRoot) {
    return createPortal(content, portalRoot);
  }

  return createPortal(<div className="fixed inset-0 z-[90]">{content}</div>, document.body);
}

export default AdvancedCharts;
