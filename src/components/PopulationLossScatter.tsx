'use client';

import { useMemo } from 'react';
import { Scatter } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { AggregatedEventData } from '@/types';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

interface PopulationLossScatterProps {
  data: AggregatedEventData[];
}

export default function PopulationLossScatter({ data }: PopulationLossScatterProps) {
  const chartData = useMemo(() => {
    const points = data
      .filter(d => d.totalAffectedPopulation && d.totalEconomicDamage)
      .map(d => ({
        x: d.totalAffectedPopulation || 0,
        y: d.totalEconomicDamage || 0,
        label: d.name,
      }));

    // Return early if no valid points
    if (points.length === 0) {
      return null;
    }

    // Calculate average for quadrant lines
    const avgPop = points.reduce((sum, p) => sum + p.x, 0) / points.length || 0;

    return {
      datasets: [
        {
          label: 'Districts',
          data: points,
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 9,
          pointStyle: 'circle' as const,
        },
        // Average reference lines (hidden points)
        {
          label: 'Average',
          data: [
            { x: avgPop, y: 0 },
            { x: avgPop, y: Math.max(...points.map(p => p.y)) },
          ],
          showLine: true,
          borderColor: 'rgba(107, 114, 128, 0.4)',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
        },
      ],
    };
  }, [data]);

  // Show message if no data
  if (!chartData) {
    return (
      <div className="flex items-center justify-center h-[220px] text-slate-400">
        <p className="text-xs">
          No data available. Districts need both population and economic damage values.
        </p>
      </div>
    );
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: 'rgba(255, 255, 255, 1)',
        bodyColor: 'rgba(255, 255, 255, 0.9)',
        borderColor: 'rgba(59, 130, 246, 0.5)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          title: (context: any) => {
            return context[0].raw.label || 'District';
          },
          label: (context: any) => {
            const point = context.raw;
            return [
              `Population: ${formatNumber(point.x)}`,
              `Economic Loss: ${formatCurrency(point.y)}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear' as const,
        beginAtZero: true,
        title: {
          display: true,
          text: 'Affected Population',
          color: 'rgba(107, 114, 128, 1)',
          font: {
            size: 13,
            weight: 600 as const,
          },
        },
        grid: {
          color: 'rgba(107, 114, 128, 0.1)',
        },
        ticks: {
          color: 'rgba(107, 114, 128, 0.8)',
          font: {
            size: 11,
          },
          callback: (value: any) => {
            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
            if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
            return value;
          },
        },
      },
      y: {
        type: 'linear' as const,
        beginAtZero: true,
        title: {
          display: true,
          text: 'Economic Damage (USD)',
          color: 'rgba(107, 114, 128, 1)',
          font: {
            size: 13,
            weight: 600 as const,
          },
        },
        grid: {
          color: 'rgba(107, 114, 128, 0.1)',
        },
        ticks: {
          color: 'rgba(107, 114, 128, 0.8)',
          font: {
            size: 11,
          },
          callback: (value: any) => {
            if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
            if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
            return `$${value}`;
          },
        },
      },
    },
  };

  return (
    <div className="w-full">
      <div className="h-[220px]">
        <Scatter data={chartData} options={options} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span>District Data Point</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5 border-t-2 border-dashed border-slate-500"></div>
          <span>Average Reference</span>
        </div>
      </div>
    </div>
  );
}
