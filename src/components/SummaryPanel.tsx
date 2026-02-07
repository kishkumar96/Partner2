"use client";

import { useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  BarChart3,
  CheckCircle2,
  Flame,
  Home,
  Hourglass,
  MapPin,
  Navigation,
  Target,
  TrendingUp,
  Wheat,
  Wind,
  X,
} from "lucide-react";
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
import { Event, Hazard, SummaryStats, FilterState, District, Province, Sector } from "@/types";
import { CountryCode, COUNTRIES } from "@/types/thredds";
import { formatCurrency, formatNumber } from "@/utils/formatters";
import { computeFilteredData } from "../utils/filteredData";
import { StatsGrid } from "./StatsGrid";
import AdvancedCharts from "./AdvancedCharts";

// Interface for sector data with statistics
interface SectorStats {
  id: string;
  name: string;
  eventCount: number;
  affectedPopulation: number;
  economicDamage: number;
}

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
  sectors: Sector[];
  filters: FilterState;
  districts: District[];
  provinces: Province[];
  selectedCountry?: CountryCode | null;
  selectedRegion?: string | null;
  onRegionClear?: () => void;
  assetExposureData?: any;
  nationalSummary?: any[];
  regionalSummary?: any[];
  regionalSummaryBySector?: any[];
}

export default function SummaryPanel({
  events,
  hazards,
  sectors,
  filters,
  districts,
  provinces,
  selectedCountry = null,
  selectedRegion = null,
  onRegionClear,
  assetExposureData = null,
  nationalSummary = [],
  regionalSummary = [],
  regionalSummaryBySector = [],
}: SummaryPanelProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "exposure" | "damage" | "analytics">("summary");

  const { filteredEvents, aggregatedEventData } = useMemo(
    () =>
      computeFilteredData({
        events,
        filters,
        districts,
        provinces,
      }),
    [events, filters, districts, provinces]
  );

  // Calculate summary statistics DIRECTLY from filtered events (not aggregated data)
  // This ensures stats are always accurate even when district/province IDs don't match
  const stats: SummaryStats = useMemo(
    () => ({
      totalEvents: filteredEvents.length,
      totalAffectedPopulation: filteredEvents.reduce((sum, e) => sum + e.affectedPopulation, 0),
      totalEconomicDamage: filteredEvents.reduce((sum, e) => sum + e.economicDamage, 0),
      highRiskAreas: filteredEvents.filter(e => e.severity >= 4).length,
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

  // Data for per-sector visualization using sectors from props
  const sectorData: SectorStats[] = useMemo(() => {
    return sectors.map((sector): SectorStats => {
      const sectorEvents = filteredEvents.filter((e) => e.sectorId === sector.id);
      return {
        id: sector.id,
        name: sector.name,
        eventCount: sectorEvents.length,
        affectedPopulation: sectorEvents.reduce((sum, e) => sum + e.affectedPopulation, 0),
        economicDamage: sectorEvents.reduce((sum, e) => sum + e.economicDamage, 0),
      };
    });
  }, [sectors, filteredEvents]);

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

  const sectorBarChartData = {
    labels: sectorData.map((s) => s.name),
    datasets: [
      {
        label: "Economic Damage (Millions)",
        data: sectorData.map((s) => s.economicDamage / 1000000),
        backgroundColor: sectors.map((s) => s.color),
        borderRadius: 6,
      },
    ],
  };



  // Asset type breakdown chart data
  const assetTypeChartData = useMemo(() => {
    if (!assetExposureData || !assetExposureData.stats) {
      return null;
    }
    
    const assetTypes = Object.entries(assetExposureData.stats.byType)
      .sort(([, a]: any, [, b]: any) => b - a)
      .slice(0, 5); // Top 5 asset types
    
    const colors = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6'];
    
    return {
      labels: assetTypes.map(([type]) => type),
      datasets: [
        {
          data: assetTypes.map(([, count]) => count),
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#fff',
        },
      ],
    };
  }, [assetExposureData]);

  // Process wind intensity data from national summary
  const windIntensityData = useMemo(() => {
    if (!nationalSummary || nationalSummary.length === 0) return null;
    
    const data = nationalSummary[0];
    const ranges = [
      {
        label: '<83',
        buildings: Number(data['Wind_Gusts_kmph.range_<_83.Buildings']) || 0,
        population: Number(data['Wind_Gusts_kmph.range_<_83.Population']) || 0,
      },
      {
        label: '83-125',
        buildings: Number(data['Wind_Gusts_kmph.range_83_125.Buildings']) || 0,
        population: Number(data['Wind_Gusts_kmph.range_83_125.Population']) || 0,
      },
      {
        label: '125-164',
        buildings: Number(data['Wind_Gusts_kmph.range_125_164.Buildings']) || 0,
        population: Number(data['Wind_Gusts_kmph.range_125_164.Population']) || 0,
      },
      {
        label: '164-224',
        buildings: Number(data['Wind_Gusts_kmph.range_164_224.Buildings']) || 0,
        population: Number(data['Wind_Gusts_kmph.range_164_224.Population']) || 0,
      },
      {
        label: '224-280',
        buildings: Number(data['Wind_Gusts_kmph.range_224_280.Buildings']) || 0,
        population: Number(data['Wind_Gusts_kmph.range_224_280.Population']) || 0,
      },
      {
        label: '280+',
        buildings: Number(data['Wind_Gusts_kmph.range_280_+.Buildings']) || 0,
        population: Number(data['Wind_Gusts_kmph.range_280_+.Population']) || 0,
      },
    ];

    return {
      labels: ranges.map(r => r.label),
      datasets: [
        {
          label: 'Buildings',
          data: ranges.map(r => r.buildings),
          backgroundColor: '#3b82f6',
          borderRadius: 4,
        },
        {
          label: 'Population',
          data: ranges.map(r => r.population),
          backgroundColor: '#8b5cf6',
          borderRadius: 4,
        },
      ],
    };
  }, [nationalSummary]);

  // Temporal trend data - events by year
  const temporalTrendData = useMemo(() => {
    const yearCounts: { [key: number]: number } = {};
    
    filteredEvents.forEach((event) => {
      if (event.date) {
        const year = new Date(event.date).getFullYear();
        yearCounts[year] = (yearCounts[year] || 0) + 1;
      }
    });
    
    const years = Object.keys(yearCounts)
      .map(Number)
      .sort((a, b) => a - b);
    
    // Create cumulative dataset
    let cumulative = 0;
    const cumulativeData = years.map(year => {
      cumulative += yearCounts[year];
      return cumulative;
    });
    
    return {
      labels: years.map(y => y.toString()),
      datasets: [
        {
          label: 'Cumulative Events',
          data: cumulativeData,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#06b6d4',
          pointBorderColor: '#fff',
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    };
  }, [filteredEvents]);

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

  // Show "No Data Available" state if no events exist
  if (events.length === 0) {
    return (
      <aside className="w-96 flex-shrink-0 bg-surface dark:bg-surface border-l border-borderGlow overflow-y-auto">
        <div className="p-6">
          <div className="glass-panel rounded-xl p-8 text-center space-y-4">
            <BarChart3 className="w-14 h-14 mx-auto text-slate-300" />
            <h3 className="text-xl font-semibold text-slate-200">
              No Impact Data Available
            </h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              {selectedCountry ? (
                <>
                  PDIE model outputs for <span className="font-semibold text-slate-300">{COUNTRIES[selectedCountry].name}</span> have not been processed yet. Only hazard visualization layers are currently available.
                </>
              ) : (
                "Select a country to view impact data and analysis."
              )}
            </p>
            <div className="pt-4 border-t border-slate-700">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Available: Cyclone track data and WMS hazard layers</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                <Hourglass className="w-4 h-4 text-amber-400" />
                <span>Pending: Impact analysis and economic damage data</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <div className="w-80 h-full glass-panel border-l border-borderGlow flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="p-4 space-y-3 border-b border-borderGlow bg-surface/95 backdrop-blur-sm flex-shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            Summary Dashboard
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {filteredEvents.length === events.length
              ? `${filteredEvents.length} ${filteredEvents.length === 1 ? 'District' : 'Districts'} Analyzed`
              : `Showing ${filteredEvents.length} of ${events.length} districts`
            }
          </p>
        </div>
        
        {/* Region Selection Indicator */}
        {selectedRegion && (
          <div className="bg-neon-amber/10 border border-neon-amber/30 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-neon-amber flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {selectedRegion}
              </span>
              <span className="text-xs text-slate-400">Filtering by region</span>
            </div>
            {onRegionClear && (
              <button
                onClick={onRegionClear}
                className="text-slate-400 hover:text-slate-200 transition-colors"
                aria-label="Clear region selection"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        
        {/* Tab Navigation */}
        <div className="flex gap-2 border-t border-borderGlow pt-3">
          {[
            { id: "summary", label: "Summary", icon: BarChart3 },
            { id: "exposure", label: "Exposure", icon: Home },
            { id: "damage", label: "Damage", icon: Flame },
            { id: "analytics", label: "Analytics", icon: TrendingUp },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50"
                  : "bg-slate-700/20 text-slate-300 hover:bg-slate-700/40 border border-transparent"
              }`}
              title={tab.label}
            >
              <tab.icon className="w-4 h-4 mx-auto" />
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Summary Tab */}
        {activeTab === "summary" && (
          <div className="space-y-4 p-4">
            {/* Additional Impact Metrics */}
            {nationalSummary && nationalSummary.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-panel rounded-xl p-4 border border-borderGlow/50">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Households Affected
                      </p>
                      <p className="text-2xl font-semibold text-slate-100 mt-1">
                        {formatNumber(nationalSummary[0]?.Exposed_Households || 0)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        of {formatNumber(nationalSummary[0]?.Total_Households || 0)} total
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-purple-400/15 text-purple-300 flex items-center justify-center">
                      <Home className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div className="glass-panel rounded-xl p-4 border border-borderGlow/50">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Roads Damaged
                      </p>
                      <p className="text-2xl font-semibold text-slate-100 mt-1">
                        {Number(nationalSummary[0]?.Damaged_Road_km || 0).toFixed(1)} km
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {formatCurrency(nationalSummary[0]?.Road_Loss || 0)} loss
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-orange-400/15 text-orange-300 flex items-center justify-center">
                      <Navigation className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div className="glass-panel rounded-xl p-4 border border-borderGlow/50">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Agricultural Loss
                      </p>
                      <p className="text-2xl font-semibold text-slate-100 mt-1">
                        {formatCurrency(nationalSummary[0]?.Crop_Loss || 0)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        of {formatCurrency(nationalSummary[0]?.Total_Crop_Value || 0)} value
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-green-400/15 text-green-300 flex items-center justify-center">
                      <Wheat className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div className="glass-panel rounded-xl p-4 border border-borderGlow/50">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Peak Wind Speed
                      </p>
                      <p className="text-2xl font-semibold text-slate-100 mt-1">
                        {Number(nationalSummary[0]?.Max_Wind_Gusts || 0).toFixed(0)} km/h
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Category 4+ hurricane
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-cyan-400/15 text-cyan-300 flex items-center justify-center">
                      <Wind className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Mission Control Stats Grid */}
            <StatsGrid
              totalEconomicDamage={stats.totalEconomicDamage}
              buildingsExposed={nationalSummary?.[0]?.Buildings_Exposed_To_Any_Hazard || 0}
              buildingsDamaged={nationalSummary?.[0]?.Damaged_Buildings || 0}
              populationAffected={stats.totalAffectedPopulation}
              infrastructureItems={assetExposureData?.stats?.total || 785}
              eventCount={stats.totalEvents}
              assetStats={assetExposureData?.stats?.criticalInfrastructure}
            />

            {/* Top 5 Impacted Districts */}
            {aggregatedEventData && aggregatedEventData.length > 0 && (
              <div className="glass-panel rounded-xl p-4 animate-fadeSlide">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-neon-amber" />
                  <h4 className="text-sm font-semibold text-slate-100">Top 5 Impacted Districts</h4>
                </div>
                <div className="space-y-2">
                  {aggregatedEventData
                    .sort((a, b) => b.totalEconomicDamage - a.totalEconomicDamage)
                    .slice(0, 5)
                    .map((district, idx) => (
                      <div key={district.id} className="flex items-center justify-between text-xs p-2 hover:bg-slate-700/30 rounded-lg transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-neon-amber">{idx + 1}</span>
                          <span className="text-slate-300">{district.name}</span>
                        </div>
                        <span className="text-neon-coral font-semibold">{formatCurrency(district.totalEconomicDamage)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Exposure Tab */}
        {activeTab === "exposure" && (
          <div className="space-y-4 p-4">
            {/* Temporal Trend Chart */}
            {temporalTrendData && (
              <div>
                <h4 className="text-sm font-semibold text-slate-100 mb-3">Events Over Time</h4>
                <div className="text-xs text-slate-400 mb-2">Cumulative impact events by year</div>
                <div className="h-48">
                  <Line
                    data={temporalTrendData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          display: true,
                          labels: { font: { size: 10 } },
                        },
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          grid: { color: "rgba(255,255,255,0.05)" },
                          ticks: { font: { size: 9 } },
                        },
                        x: {
                          grid: { display: false },
                          ticks: { font: { size: 9 } },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            )}

            {/* Asset Type Breakdown Chart */}
            {assetTypeChartData && (
              <div>
                <h4 className="text-sm font-semibold text-slate-100 mb-3">Exposed Assets by Type</h4>
                <div className="text-xs text-slate-400 mb-3">
                  Showing {assetExposureData.stats.total} individual assets
                </div>
                <div className="h-40">
                  <Doughnut
                    data={assetTypeChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: "right",
                          labels: {
                            usePointStyle: true,
                            padding: 8,
                            font: { size: 9 },
                          },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            )}
            
            {/* Wind Exposure Distribution */}
            {assetExposureData && (
              <div className="glass-panel rounded-xl p-4">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-3">Wind Exposure Levels</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Extreme (&gt;200 km/h)</span>
                    <span className="text-red-400 font-semibold">{assetExposureData.stats.windExposure.extreme}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-red-600" style={{ width: `${(assetExposureData.stats.windExposure.extreme / assetExposureData.stats.total) * 100}%` }} />
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">High (150-200)</span>
                    <span className="text-orange-400 font-semibold">{assetExposureData.stats.windExposure.high}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-600" style={{ width: `${(assetExposureData.stats.windExposure.high / assetExposureData.stats.total) * 100}%` }} />
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Moderate (100-150)</span>
                    <span className="text-yellow-400 font-semibold">{assetExposureData.stats.windExposure.moderate}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-600" style={{ width: `${(assetExposureData.stats.windExposure.moderate / assetExposureData.stats.total) * 100}%` }} />
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Low (&lt;100 km/h)</span>
                    <span className="text-green-400 font-semibold">{assetExposureData.stats.windExposure.low}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-green-600" style={{ width: `${(assetExposureData.stats.windExposure.low / assetExposureData.stats.total) * 100}%` }} />
                  </div>
                </div>
              </div>
            )}

            {/* Wind Intensity Distribution Chart */}
            {windIntensityData && (
              <div>
                <h4 className="text-sm font-semibold text-slate-100 mb-3">Wind Intensity Distribution</h4>
                <div className="text-xs text-slate-400 mb-2">Buildings & population by wind speed</div>
                <div className="h-56">
                  <Bar
                    data={windIntensityData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: "bottom" as const,
                          labels: {
                            usePointStyle: true,
                            padding: 10,
                            font: { size: 9 },
                          },
                        },
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          grid: {
                            color: "rgba(255,255,255,0.05)",
                          },
                          ticks: {
                            font: { size: 9 },
                          },
                        },
                        x: {
                          grid: {
                            display: false,
                          },
                          ticks: {
                            font: { size: 9 },
                          },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Damage Tab */}
        {activeTab === "damage" && (
          <div className="space-y-4 p-4">
            {/* Sector Analysis */}
            {sectorData.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-100 mb-3">Impact by Sector</h4>
                <div className="h-40 mb-4">
                  <Bar data={sectorBarChartData} options={chartOptions} />
                </div>
              </div>
            )}

            {/* Events by Hazard */}
            <div>
              <h4 className="text-sm font-semibold text-slate-100 mb-3">Events by Hazard Type</h4>
              <div className="h-40 mb-4">
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
                          padding: 8,
                          font: { size: 9 },
                        },
                      },
                    },
                  }}
                />
              </div>
            </div>

            {/* Damage by Hazard */}
            <div>
              <h4 className="text-sm font-semibold text-slate-100 mb-3">Economic Damage by Hazard</h4>
              <div className="h-40">
                <Bar data={barChartData} options={chartOptions} />
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <div className="space-y-4 p-4">
            <AdvancedCharts
              regionalSummary={regionalSummary}
              regionalSummaryBySector={regionalSummaryBySector}
            />
          </div>
        )}

      </div>
    </div>
  );
}
