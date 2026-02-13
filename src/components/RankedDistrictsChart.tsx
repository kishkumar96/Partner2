"use client";

import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { formatCurrency, formatNumber } from "@/utils/formatters";
import { AggregatedEventData } from "@/types";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface RankedDistrictsChartProps {
  data: AggregatedEventData[];
  metric: "loss" | "population" | "risk";
  topN?: number;
}

export default function RankedDistrictsChart({
  data,
  metric,
  topN = 10,
}: RankedDistrictsChartProps) {
  const chartData = useMemo(() => {
    // Sort and take top N
    const sorted = [...data].sort((a, b) => {
      if (metric === "loss") {
        return (b.totalEconomicDamage || 0) - (a.totalEconomicDamage || 0);
      } else if (metric === "population") {
        return (b.totalAffectedPopulation || 0) - (a.totalAffectedPopulation || 0);
      } else {
        return (b.highRiskAreas || 0) - (a.highRiskAreas || 0);
      }
    });

    const topDistricts = sorted.slice(0, topN);

    const labels = topDistricts.map((d) => d.name);
    const values = topDistricts.map((d) => {
      if (metric === "loss") return d.totalEconomicDamage || 0;
      if (metric === "population") return d.totalAffectedPopulation || 0;
      return d.highRiskAreas || 0;
    });

    // Color gradient based on rank
    const backgroundColors = values.map((_, index) => {
      if (metric === "loss") {
        const opacity = 1 - (index / topN) * 0.6;
        return `rgba(220, 38, 38, ${opacity})`;
      } else if (metric === "population") {
        const opacity = 1 - (index / topN) * 0.6;
        return `rgba(249, 115, 22, ${opacity})`;
      } else {
        const opacity = 1 - (index / topN) * 0.6;
        return `rgba(234, 179, 8, ${opacity})`;
      }
    });

    return {
      labels,
      datasets: [
        {
          label:
            metric === "loss"
              ? "Economic Loss (USD)"
              : metric === "population"
              ? "Affected Population"
              : "High Risk Areas",
          data: values,
          backgroundColor: backgroundColors,
          borderColor: backgroundColors.map((c) => c.replace(/[\d.]+\)$/, "1)")),
          borderWidth: 2,
          borderRadius: 6,
          barThickness: 16,
          maxBarThickness: 18,
        },
      ],
    };
  }, [data, metric, topN]);

  const options = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    // Accessibility
    ariaLabel: metric === "loss" 
      ? `Bar chart showing top ${topN} districts by economic loss`
      : metric === "population"
      ? `Bar chart showing top ${topN} districts by affected population`
      : `Bar chart showing top ${topN} districts by high risk areas`,
    ariaDescription: `Horizontal bar chart ranking districts from highest to lowest ${metric === "loss" ? "economic damage" : metric === "population" ? "affected population" : "risk areas"}`,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: "rgba(17, 24, 39, 0.95)",
        titleColor: "rgba(255, 255, 255, 1)",
        bodyColor: "rgba(255, 255, 255, 0.9)",
        borderColor: "rgba(59, 130, 246, 0.5)",
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: {
          label: (context: any) => {
            const value = context.parsed.x;
            if (metric === "loss") {
              return `Loss: ${formatCurrency(value)}`;
            } else if (metric === "population") {
              return `Population: ${formatNumber(value)}`;
            } else {
              return `High Risk: ${value}`;
            }
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: "rgba(107, 114, 128, 0.1)",
          drawBorder: false,
        },
        ticks: {
          color: "rgba(148, 163, 184, 0.9)",
          font: {
            size: 10,
            weight: 500,
          },
          callback: (value: any) => {
            if (metric === "loss") {
              return formatCurrency(value).replace(".00", "");
            } else if (metric === "population") {
              if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
              return value;
            }
            return value;
          },
        },
      },
      y: {
        grid: {
          display: false,
        },
        ticks: {
          color: "rgba(226, 232, 240, 0.9)",
          font: {
            size: 10,
            weight: 600,
          },
          autoSkip: false,
          maxTicksLimit: topN,
          callback: function (value: any) {
            const label = (this as any).getLabelForValue(value);
            if (!label) return "";
            return label.length > 16 ? `${label.slice(0, 14)}…` : label;
          },
        },
      },
    },
  };

  return (
    <div className="w-full">
      <div style={{ height: `${topN * 30 + 60}px` }}>
        <Bar 
          data={chartData} 
          options={options}
          aria-label={metric === "loss" 
            ? `Bar chart showing top ${topN} districts by economic loss`
            : metric === "population"
            ? `Bar chart showing top ${topN} districts by affected population`
            : `Bar chart showing top ${topN} districts by high risk areas`}
        />
      </div>
    </div>
  );
}
