"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bar, Radar, Scatter } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { formatCurrency, formatNumber } from "@/utils/formatters";
import { RegionalSummary, RegionalSummaryBySector } from "@/types";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler
);

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
export default function AdvancedCharts({
  regionalSummary,
  regionalSummaryBySector,
  maxRegions = 10,
}: AdvancedChartsProps) {
  const [showMatrixOverlay, setShowMatrixOverlay] = useState(false);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    setOverlayRoot(document.getElementById("map-overlay-root"));
  }, []);

  // 1. Heatmap Matrix: Sector × Region Loss Analysis
  const heatmapData = useMemo(() => {
    // Comprehensive validation
    if (!regionalSummaryBySector || 
        !Array.isArray(regionalSummaryBySector) || 
        regionalSummaryBySector.length === 0) {
      console.warn('AdvancedCharts: Invalid or empty regionalSummaryBySector data');
      return null;
    }

    // Validate data structure
    const hasValidStructure = regionalSummaryBySector.every(item => 
      item && 
      typeof item === 'object' && 
      'Region' in item && 
      'Sector' in item
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
          .reduce((sum, r) => sum + (r.Total_Loss || 0), 0)
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

    return {
      sectors,
      regions: regionsByLoss,
      matrix,
      maxValue: Math.max(...matrix.flat())
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
          total: sectorsData
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    return {
      labels: regionTotals.map(r => r.region),
      datasets: [{
        label: 'Total Loss (Millions USD)',
        data: regionTotals.map(r => r.total / 1000000),
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderRadius: 4,
      }]
    };
  }, [regionalSummary, regionalSummaryBySector]);

  // 2. Radar Chart: Multi-Sector Regional Profile (Top 5 Regions)
  const radarData = useMemo(() => {
    if (!regionalSummaryBySector || !Array.isArray(regionalSummaryBySector) || regionalSummaryBySector.length === 0) {
      console.warn('AdvancedCharts: Invalid data for radar chart');
      return null;
    }

    // Get top 5 regions by total loss
    const regionTotals = regionalSummary
      ?.filter(r => r.Region && r.Region.trim() !== '')
      .sort((a, b) => (Number(b.Total_Loss) || 0) - (Number(a.Total_Loss) || 0))
      .slice(0, 5)
      .map(r => r.Region) || [];

    // Get sectors (exclude Unknown to make the radar chart readable)
    const sectors = [...new Set(regionalSummaryBySector.map(r => r.Sector))].filter(s => s && s !== 'Unknown');

    // Color palette for regions
    const regionColors = [
      { bg: 'rgba(239, 68, 68, 0.2)', border: 'rgb(239, 68, 68)' },
      { bg: 'rgba(59, 130, 246, 0.2)', border: 'rgb(59, 130, 246)' },
      { bg: 'rgba(16, 185, 129, 0.2)', border: 'rgb(16, 185, 129)' },
      { bg: 'rgba(245, 158, 11, 0.2)', border: 'rgb(245, 158, 11)' },
      { bg: 'rgba(139, 92, 246, 0.2)', border: 'rgb(139, 92, 246)' },
    ];

    const datasets = regionTotals.map((region, idx) => {
      const data = sectors.map(sector => {
        const record = regionalSummaryBySector.find(
          r => r.Region === region && r.Sector === sector
        );
        return Number(record?.Total_Loss || 0) / 1000000; // Convert to millions
      });

      return {
        label: region,
        data,
        backgroundColor: regionColors[idx].bg,
        borderColor: regionColors[idx].border,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointHitRadius: 8,
        fill: true,
        pointBackgroundColor: regionColors[idx].border,
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: regionColors[idx].border,
        hidden: idx >= 3, // Default: show only top 3 regions
      };
    });

    return {
      labels: sectors,
      datasets,
    };
  }, [regionalSummaryBySector, regionalSummary]);

  // 3. Scatter Plot: Population vs Economic Loss
  const scatterData = useMemo(() => {
    if (!regionalSummary || !Array.isArray(regionalSummary) || regionalSummary.length === 0) {
      console.warn('AdvancedCharts: Invalid data for scatter plot');
      return null;
    }

    const data = regionalSummary
      .filter(r => r.Region && r.Region.trim() !== '')
      .map(region => ({
        x: Number(region.Total_Population) || 0,
        y: Number(region.Total_Loss) || 0,
        label: region.Region,
      }))
      .filter(d => d.x > 0 && d.y > 0);

    return {
      datasets: [
        {
          label: 'Regions',
          data,
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
        },
      ],
    };
  }, [regionalSummary]);

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
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: {
          font: { size: 9 },
          callback: (value: any) => `$${value.toFixed(1)}M`,
        },
      },
    },
  };

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'dataset' as const,
    },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          font: { size: 10 },
          padding: 10,
          usePointStyle: true,
          boxWidth: 8,
          boxHeight: 8,
        },
        onClick: (e: any, legendItem: any, legend: any) => {
          const index = legendItem.datasetIndex;
          const ci = legend.chart;
          const meta = ci.getDatasetMeta(index);
          
          // Toggle visibility
          meta.hidden = meta.hidden === null ? !ci.data.datasets[index].hidden : null;
          ci.update();
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const value = context.parsed.r;
            return `${label}: $${value.toFixed(2)}M`;
          },
        },
      },
    },
    scales: {
      r: {
        beginAtZero: true,
        pointLabels: {
          font: { size: 9 },
          color: 'rgba(226, 232, 240, 0.9)',
          callback: (label: any) => {
            const text = String(label);
            if (text.length <= 12) return text;
            const words = text.split(/\s+/);
            if (words.length === 1) return `${text.slice(0, 12)}…`;
            const lines: string[] = [];
            let line = '';
            for (const word of words) {
              const next = line ? `${line} ${word}` : word;
              if (next.length <= 12) {
                line = next;
              } else {
                if (line) lines.push(line);
                line = word;
                if (lines.length === 1) break;
              }
            }
            if (lines.length < 2 && line) lines.push(line);
            const trimmed = lines.slice(0, 2).map((l, idx) => {
              if (idx === 1 && l.length > 12) return `${l.slice(0, 12)}…`;
              return l.length > 12 ? `${l.slice(0, 12)}…` : l;
            });
            return trimmed;
          },
        },
        ticks: {
          font: { size: 9 },
          color: 'rgba(203, 213, 225, 0.85)',
          showLabelBackdrop: false,
          callback: (value: any) => `$${value.toFixed(0)}M`,
        },
        grid: { color: 'rgba(255,255,255,0.1)' },
        angleLines: { color: 'rgba(255,255,255,0.1)' },
      },
    },
  };

  const scatterOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const point = context.raw;
            return [
              point.label,
              `Population: ${formatNumber(point.x)}`,
              `Loss: ${formatCurrency(point.y)}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear' as const,
        position: 'bottom' as const,
        title: {
          display: true,
          text: 'Population',
          font: { size: 10, weight: 'bold' as const },
          color: 'rgba(226, 232, 240, 0.8)',
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: {
          font: { size: 9 },
          color: 'rgba(148, 163, 184, 0.85)',
          maxTicksLimit: 4,
          callback: (value: any) => {
            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
            if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
            return value;
          },
        },
      },
      y: {
        title: {
          display: true,
          text: 'Economic Loss',
          font: { size: 10, weight: 'bold' as const },
          color: 'rgba(226, 232, 240, 0.8)',
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: {
          font: { size: 9 },
          color: 'rgba(148, 163, 184, 0.85)',
          maxTicksLimit: 4,
          callback: (value: any) => `$${(value / 1000000).toFixed(1)}M`,
        },
      },
    },
  };

  const hasScatterPoints = !!scatterData?.datasets?.[0]?.data?.length;

  // Helper function to get color intensity based on value
  const getHeatmapColor = (value: number, maxValue: number) => {
    const intensity = value / maxValue;
    if (intensity === 0) return 'rgba(15, 23, 42, 0.5)'; // slate-900 for zero
    if (intensity < 0.2) return 'rgba(34, 197, 94, 0.3)'; // green-500
    if (intensity < 0.4) return 'rgba(251, 191, 36, 0.5)'; // amber-400
    if (intensity < 0.6) return 'rgba(249, 115, 22, 0.7)'; // orange-500
    if (intensity < 0.8) return 'rgba(239, 68, 68, 0.8)'; // red-500
    return 'rgba(185, 28, 28, 0.9)'; // red-700
  };

  return (
    <div className="space-y-6">
      {/* Regional Total Loss Bar Chart */}
      <div>
        <h4 className="text-sm font-semibold text-slate-100 mb-2">
          Total Loss by Region
        </h4>
        <p className="text-xs text-slate-400 mb-3">
          Top 6 regions by aggregate economic damage (Unknown sector excluded)
        </p>
        {regionalTotalData ? (
          <div className="h-56">
            <Bar 
              data={regionalTotalData} 
              options={regionalTotalOptions}
              aria-label="Bar chart showing total economic loss by region. Top 6 regions by aggregate damage across all sectors."
            />
          </div>
        ) : (
          <div className="text-xs text-slate-400">No regional totals available.</div>
        )}
      </div>

      {/* Heatmap Matrix */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-100 mb-1">
              Sector-Region Impact Matrix
            </h4>
            <p className="text-xs text-slate-400 mb-3">
              Heatmap showing loss distribution across sectors and regions (darker = higher loss)
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowMatrixOverlay(true)}
            className="text-xs px-2.5 py-1.5 rounded-md border border-slate-600/60 text-slate-200 bg-slate-900/60 hover:bg-slate-800/70 transition-colors"
            aria-label="Expand impact matrix"
          >
            Expand
          </button>
        </div>
        {heatmapData ? (
          <>
            <div className="overflow-x-auto pb-2">
              <div className="inline-block min-w-[520px]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-xs font-semibold text-slate-300 p-2 border border-slate-700 bg-slate-800 sticky left-0 z-10">Sector</th>
                      {heatmapData.regions.map((region, idx) => (
                        <th key={idx} className="text-xs font-semibold text-slate-300 p-2 border border-slate-700 bg-slate-800 min-w-[90px] truncate">
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
                            <div className="font-mono font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
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
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}></div>
                <span className="text-slate-400">None</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(34, 197, 94, 0.3)' }}></div>
                <span className="text-slate-400">Low</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(251, 191, 36, 0.5)' }}></div>
                <span className="text-slate-400">Moderate</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(249, 115, 22, 0.7)' }}></div>
                <span className="text-slate-400">High</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.8)' }}></div>
                <span className="text-slate-400">Very High</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(185, 28, 28, 0.9)' }}></div>
                <span className="text-slate-400">Critical</span>
              </div>
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-400">No matrix data available.</div>
        )}
      </div>

      {/* Scatter Plot */}
      <div>
        <h4 className="text-sm font-semibold text-slate-100 mb-2">
          Population vs Economic Loss
        </h4>
        <p className="text-xs text-slate-400 mb-3">
          Correlation analysis between population size and economic impact
        </p>
        {hasScatterPoints ? (
          <div className="h-64">
            <Scatter 
              data={scatterData!} 
              options={scatterOptions}
              aria-label="Scatter plot showing correlation between population size and economic loss. Each point represents a region."
            />
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-xs text-slate-400">
            No scatter data available for the current filters.
          </div>
        )}
      </div>

      {/* Radar Chart */}
      <div>
        <h4 className="text-sm font-semibold text-slate-100 mb-2">
          Multi-Sector Regional Profile
        </h4>
        <p className="text-xs text-slate-400 mb-3">
          Top 5 most impacted regions (excluding Unknown sector). Click legend to show/hide regions • Showing top 3 by default
        </p>
        {radarData ? (
          <div className="h-72">
            <Radar 
              data={radarData} 
              options={radarOptions}
              aria-label="Radar chart showing multi-sector impact profile for top 5 most affected regions. Each axis represents a different sector."
            />
          </div>
        ) : (
          <div className="text-xs text-slate-400">No radar profile available.</div>
        )}
      </div>
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
}

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
            <p className="text-xs text-slate-400">Sector loss by region (Millions USD)</p>
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
                  <th className="text-xs font-semibold text-slate-300 p-2 border border-slate-700 bg-slate-800 sticky left-0 z-10">Sector</th>
                  {heatmapData.regions.map((region, idx) => (
                    <th key={idx} className="text-xs font-semibold text-slate-300 p-2 border border-slate-700 bg-slate-800 min-w-[110px] truncate">
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
                        <div className="font-mono font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
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
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}></div>
              <span className="text-slate-400">None</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(34, 197, 94, 0.3)' }}></div>
              <span className="text-slate-400">Low</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(251, 191, 36, 0.5)' }}></div>
              <span className="text-slate-400">Moderate</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(249, 115, 22, 0.7)' }}></div>
              <span className="text-slate-400">High</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.8)' }}></div>
              <span className="text-slate-400">Very High</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(185, 28, 28, 0.9)' }}></div>
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

  return createPortal(
    <div className="fixed inset-0 z-[90]">{content}</div>,
    document.body
  );
}
