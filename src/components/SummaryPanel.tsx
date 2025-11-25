"use client";

import { useMemo } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
} from "chart.js";
import { Event, Hazard, SummaryStats, FilterState } from "@/types";
import { formatCurrency, formatNumber, getHazardColor } from "@/utils/formatters";
import { filterEvents } from "@/utils/filterUtils";
import { monthlyDamageData } from "@/data/mockData";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler
);

interface SummaryPanelProps {
  events: Event[];
  hazards: Hazard[];
  filters: FilterState;
}

export default function SummaryPanel({ events, hazards, filters }: SummaryPanelProps) {
  // Apply filters to events using shared utility
  const filteredEvents = useMemo(
    () => filterEvents(events, filters),
    [events, filters]
  );

  // Calculate summary statistics from filtered events
  const stats: SummaryStats = useMemo(
    () => ({
      totalEvents: filteredEvents.length,
      totalAffectedPopulation: filteredEvents.reduce(
        (sum, e) => sum + e.affectedPopulation,
        0
      ),
      totalEconomicDamage: filteredEvents.reduce((sum, e) => sum + e.economicDamage, 0),
      highRiskAreas: filteredEvents.filter(
        (e) => e.severity === "high" || e.severity === "critical"
      ).length,
    }),
    [filteredEvents]
  );

  // Data for hazard distribution pie chart based on filtered events
  const hazardCounts = useMemo(
    () =>
      hazards.map((hazard) => ({
        name: hazard.name,
        count: filteredEvents.filter((e) => e.hazardId === hazard.id).length,
        color: hazard.color,
      })),
    [hazards, filteredEvents]
  );

  // Data for damage by hazard bar chart based on filtered events
  const damageByHazard = useMemo(
    () =>
      hazards.map((hazard) => ({
        name: hazard.name,
        damage: filteredEvents
          .filter((e) => e.hazardId === hazard.id)
          .reduce((sum, e) => sum + e.economicDamage, 0),
        color: hazard.color,
      })),
    [hazards, filteredEvents]
  );

  const pieChartData = {
    labels: hazardCounts.map((h) => h.name),
    datasets: [
      {
        data: hazardCounts.map((h) => h.count),
        backgroundColor: hazardCounts.map((h) => h.color),
        borderWidth: 2,
        borderColor: "#fff",
      },
    ],
  };

  // Data for monthly damage trend chart - filter based on selected hazards
  const lineChartData = useMemo(() => {
    const datasets = [];
    
    const floodSelected = filters.selectedHazards.length === 0 || filters.selectedHazards.includes("flood");
    const droughtSelected = filters.selectedHazards.length === 0 || filters.selectedHazards.includes("drought");
    const cycloneSelected = filters.selectedHazards.length === 0 || filters.selectedHazards.includes("cyclone");
    
    if (floodSelected) {
      datasets.push({
        label: "Flood",
        data: monthlyDamageData.map((d) => d.flood),
        borderColor: getHazardColor("flood"),
        backgroundColor: `${getHazardColor("flood")}20`,
        fill: true,
        tension: 0.4,
      });
    }
    if (droughtSelected) {
      datasets.push({
        label: "Drought",
        data: monthlyDamageData.map((d) => d.drought),
        borderColor: getHazardColor("drought"),
        backgroundColor: `${getHazardColor("drought")}20`,
        fill: true,
        tension: 0.4,
      });
    }
    if (cycloneSelected) {
      datasets.push({
        label: "Cyclone",
        data: monthlyDamageData.map((d) => d.cyclone),
        borderColor: getHazardColor("cyclone"),
        backgroundColor: `${getHazardColor("cyclone")}20`,
        fill: true,
        tension: 0.4,
      });
    }
    
    return {
      labels: monthlyDamageData.map((d) => d.month),
      datasets,
    };
  }, [filters.selectedHazards]);

  const barChartData = {
    labels: damageByHazard.map((h) => h.name),
    datasets: [
      {
        label: "Economic Damage (Millions)",
        data: damageByHazard.map((h) => h.damage / 1000000),
        backgroundColor: damageByHazard.map((h) => h.color),
        borderRadius: 4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: "rgba(0,0,0,0.05)",
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          usePointStyle: true,
          padding: 15,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: "rgba(0,0,0,0.05)",
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  return (
    <div className="w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 overflow-y-auto flex-shrink-0">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Summary Dashboard
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Showing {filteredEvents.length} of {events.length} events
        </p>
      </div>

      {/* Summary Cards */}
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 rounded-xl p-4">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">
              Total Events
            </p>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-1">
              {stats.totalEvents}
            </p>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 rounded-xl p-4">
            <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">
              High Risk
            </p>
            <p className="text-2xl font-bold text-red-900 dark:text-red-100 mt-1">
              {stats.highRiskAreas}
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 rounded-xl p-4">
          <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">
            Affected Population
          </p>
          <p className="text-2xl font-bold text-purple-900 dark:text-purple-100 mt-1">
            {formatNumber(stats.totalAffectedPopulation)}
          </p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/30 rounded-xl p-4">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">
            Total Economic Damage
          </p>
          <p className="text-2xl font-bold text-amber-900 dark:text-amber-100 mt-1">
            {formatCurrency(stats.totalEconomicDamage)}
          </p>
        </div>
      </div>

      {/* Hazard Distribution Chart */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Events by Hazard Type
        </h3>
        <div 
          className="h-40"
          role="img"
          aria-label={`Doughnut chart showing distribution of ${stats.totalEvents} events by hazard type: ${hazardCounts.map(h => `${h.name}: ${h.count}`).join(', ')}`}
        >
          <Doughnut
            data={pieChartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: "right",
                  labels: {
                    usePointStyle: true,
                    padding: 10,
                    font: { size: 10 },
                  },
                },
              },
            }}
          />
        </div>
      </div>

      {/* Damage by Hazard Bar Chart */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Economic Damage by Hazard
        </h3>
        <div 
          className="h-40"
          role="img"
          aria-label={`Bar chart showing economic damage by hazard type: ${damageByHazard.map(h => `${h.name}: $${(h.damage / 1000000).toFixed(1)}M`).join(', ')}`}
        >
          <Bar data={barChartData} options={chartOptions} />
        </div>
      </div>

      {/* Monthly Trend Chart */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Monthly Damage Trend
        </h3>
        <div 
          className="h-48"
          role="img"
          aria-label="Line chart showing monthly damage trends for flood, drought, and cyclone hazards throughout the year"
        >
          <Line data={lineChartData} options={lineChartOptions} />
        </div>
      </div>
    </div>
  );
}
