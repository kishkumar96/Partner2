"use client";

import { useMemo } from "react";
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
  regionalSummary: any[];
  regionalSummaryBySector: any[];
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
}: AdvancedChartsProps) {
  // 1. Stacked Bar Chart: Region × Sector Composition
  const stackedBarData = useMemo(() => {
    if (!regionalSummaryBySector || regionalSummaryBySector.length === 0) return null;

    // Get unique regions and sectors
    const regions = [...new Set(regionalSummaryBySector.map((r: any) => r.Region))].filter(Boolean).slice(0, 8);
    const sectors = [...new Set(regionalSummaryBySector.map((r: any) => r.Sector))].filter(Boolean);

    // Color palette for sectors
    const sectorColors: Record<string, string> = {
      Education: '#3b82f6',
      Infrastructure: '#ef4444',
      Residential: '#f59e0b',
      Productive: '#10b981',
      Public: '#8b5cf6',
      Other: '#6b7280',
      Unknown: '#9ca3af',
    };

    // Create dataset for each sector
    const datasets = sectors.map((sector: string) => {
      const data = regions.map((region: string) => {
        const record = regionalSummaryBySector.find(
          (r: any) => r.Region === region && r.Sector === sector
        );
        return Number(record?.Total_Loss || 0);
      });

      return {
        label: sector,
        data,
        backgroundColor: sectorColors[sector] || '#6b7280',
        borderWidth: 0,
      };
    });

    return {
      labels: regions,
      datasets,
    };
  }, [regionalSummaryBySector]);

  // 2. Radar Chart: Multi-Sector Regional Profile (Top 5 Regions)
  const radarData = useMemo(() => {
    if (!regionalSummaryBySector || regionalSummaryBySector.length === 0) return null;

    // Get top 5 regions by total loss
    const regionTotals = regionalSummary
      ?.filter((r: any) => r.Region && r.Region.trim() !== '')
      .sort((a: any, b: any) => (Number(b.Total_Loss) || 0) - (Number(a.Total_Loss) || 0))
      .slice(0, 5)
      .map((r: any) => r.Region) || [];

    // Get sectors
    const sectors = [...new Set(regionalSummaryBySector.map((r: any) => r.Sector))].filter(Boolean);

    // Color palette for regions
    const regionColors = [
      { bg: 'rgba(239, 68, 68, 0.2)', border: 'rgb(239, 68, 68)' },
      { bg: 'rgba(59, 130, 246, 0.2)', border: 'rgb(59, 130, 246)' },
      { bg: 'rgba(16, 185, 129, 0.2)', border: 'rgb(16, 185, 129)' },
      { bg: 'rgba(245, 158, 11, 0.2)', border: 'rgb(245, 158, 11)' },
      { bg: 'rgba(139, 92, 246, 0.2)', border: 'rgb(139, 92, 246)' },
    ];

    const datasets = regionTotals.map((region: string, idx: number) => {
      const data = sectors.map((sector: string) => {
        const record = regionalSummaryBySector.find(
          (r: any) => r.Region === region && r.Sector === sector
        );
        return Number(record?.Total_Loss || 0) / 1000; // Convert to thousands
      });

      return {
        label: region,
        data,
        backgroundColor: regionColors[idx].bg,
        borderColor: regionColors[idx].border,
        borderWidth: 2,
        pointBackgroundColor: regionColors[idx].border,
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: regionColors[idx].border,
      };
    });

    return {
      labels: sectors,
      datasets,
    };
  }, [regionalSummaryBySector, regionalSummary]);

  // 3. Scatter Plot: Population vs Economic Loss
  const scatterData = useMemo(() => {
    if (!regionalSummary || regionalSummary.length === 0) return null;

    const data = regionalSummary
      .filter((r: any) => r.Region && r.Region.trim() !== '')
      .map((region: any) => ({
        x: Number(region.Total_Population) || 0,
        y: Number(region.Total_Loss) || 0,
        label: region.Region,
      }))
      .filter((d: any) => d.x > 0 && d.y > 0);

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

  const stackedBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          font: { size: 10 },
          padding: 8,
          usePointStyle: true,
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            return `${label}: ${formatCurrency(value)}`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { font: { size: 9 } },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: {
          font: { size: 9 },
          callback: (value: any) => `$${(value / 1000000).toFixed(1)}M`,
        },
      },
    },
  };

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          font: { size: 9 },
          padding: 6,
          usePointStyle: true,
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const value = context.parsed.r;
            return `${label}: $${(value * 1000).toLocaleString()}`;
          },
        },
      },
    },
    scales: {
      r: {
        beginAtZero: true,
        ticks: {
          font: { size: 8 },
          callback: (value: any) => `$${value}K`,
        },
        grid: { color: 'rgba(255,255,255,0.1)' },
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
          font: { size: 11, weight: 'bold' as const },
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: {
          font: { size: 9 },
          callback: (value: any) => formatNumber(value),
        },
      },
      y: {
        title: {
          display: true,
          text: 'Economic Loss',
          font: { size: 11, weight: 'bold' as const },
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: {
          font: { size: 9 },
          callback: (value: any) => `$${(value / 1000000).toFixed(1)}M`,
        },
      },
    },
  };

  if (!stackedBarData || !radarData || !scatterData) {
    return (
      <div className="text-center py-8 text-gray-500">
        No data available for advanced charts
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stacked Bar Chart */}
      <div>
        <h4 className="text-sm font-semibold text-slate-100 mb-2">
          Regional Loss by Sector
        </h4>
        <p className="text-xs text-slate-400 mb-3">
          Stacked composition showing sector-level losses across top regions
        </p>
        <div className="h-64">
          <Bar data={stackedBarData} options={stackedBarOptions} />
        </div>
      </div>

      {/* Scatter Plot */}
      <div>
        <h4 className="text-sm font-semibold text-slate-100 mb-2">
          Population vs Economic Loss
        </h4>
        <p className="text-xs text-slate-400 mb-3">
          Correlation analysis between population size and economic impact
        </p>
        <div className="h-64">
          <Scatter data={scatterData} options={scatterOptions} />
        </div>
      </div>

      {/* Radar Chart */}
      <div>
        <h4 className="text-sm font-semibold text-slate-100 mb-2">
          Multi-Sector Regional Profile
        </h4>
        <p className="text-xs text-slate-400 mb-3">
          Comparative analysis of top 5 most impacted regions across all sectors
        </p>
        <div className="h-72">
          <Radar data={radarData} options={radarOptions} />
        </div>
      </div>
    </div>
  );
}
