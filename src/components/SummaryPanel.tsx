"use client";

/**
 * ARCHITECTURAL NOTE: Cyclone Controls Encapsulation
 * 
 * Current Implementation: The cyclone animation control state (showCycloneControls)
 * is managed by the parent component and passed down as props.
 * This creates tight coupling between the parent page and SummaryPanel.
 * 
 * Recommended Refactor: Create a dedicated <CycloneControlManager /> component that:
 * - Self-manages its active/inactive state internally
 * - Listens to map events for cyclone track clicks
 * - Renders the timeline controls directly (no portal needed)
 * - Is rendered within the Cyclone tab when hasCycloneData is true
 * 
 * Benefits: Cleaner props interface, better separation of concerns, easier testing,
 * and improved maintainability.
 */

import { useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Database,
  DollarSign,
  Flame,
  Home,
  Hourglass,
  MapPin,
  Navigation,
  Target,
  TrendingUp,
  Users,
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
  Filler,
} from "chart.js";
import { Event, Hazard, SummaryStats, FilterState, District, Province, Sector, RegionalSummary, RegionalSummaryBySector } from "@/types";
import { CountryCode, COUNTRIES } from "@/types/thredds";
import { formatCurrency, formatNumber } from "@/utils/formatters";
import { computeFilteredData } from "../utils/filteredData";
import { StatsGrid } from "./StatsGrid";
import AdvancedCharts from "./AdvancedCharts";
import HeroMetric from "./HeroMetric";
import TopInsightsCards, { createDistrictInsights } from "./TopInsightsCards";
import RankedDistrictsChart from "./RankedDistrictsChart";
import { ScenarioComparison } from "./ScenarioSpreadIndicator";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface SummaryPanelProps {
  events: Event[];
  hazards?: Hazard[];
  sectors?: Sector[];
  filters: FilterState;
  districts: District[];
  provinces: Province[];
  selectedCountry?: CountryCode | null;
  selectedRegion?: string | null;
  onRegionClear?: () => void;
  hasCycloneData?: boolean;
  showCycloneControls?: boolean;
  assetExposureData?: any;
  nationalSummary?: any[];
  regionalSummary?: RegionalSummary[];
  regionalSummaryBySector?: RegionalSummaryBySector[];
  impactBySector?: any[];
}

export default function SummaryPanel({
  events,
  filters,
  districts,
  provinces,
  selectedCountry = null,
  selectedRegion = null,
  onRegionClear,
  hasCycloneData = false,
  showCycloneControls = false,
  assetExposureData = null,
  nationalSummary = [],
  regionalSummary = [],
  regionalSummaryBySector = [],
  impactBySector = [],
}: SummaryPanelProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "exposure" | "damage" | "analytics" | "cyclone">("summary");
  const isSummaryTab = activeTab === "summary";
  
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

  // Filter CSV data based on sector filters (Tier 1 + Tier 2)
  const filteredImpactBySector = useMemo(() => {
    if (!impactBySector || impactBySector.length === 0) return [];
    if (filters.selectedSectors.length === 0) return impactBySector;
    return impactBySector.filter(row => filters.selectedSectors.includes(row.Sector));
  }, [impactBySector, filters.selectedSectors]);

  const filteredRegionalSummaryBySector = useMemo(() => {
    if (!regionalSummaryBySector || regionalSummaryBySector.length === 0) return [];
    if (filters.selectedSectors.length === 0) return regionalSummaryBySector;
    return regionalSummaryBySector.filter(row => filters.selectedSectors.includes(row.Sector));
  }, [regionalSummaryBySector, filters.selectedSectors]);

  // Derive regional totals from filtered sector data (Tier 2)
  const derivedRegionalSummary = useMemo(() => {
    if (filteredRegionalSummaryBySector.length === 0) return regionalSummary || [];
    
    const regionTotals = filteredRegionalSummaryBySector.reduce((acc: any, row: any) => {
      const region = row.Region;
      if (!acc[region]) {
        acc[region] = {
          Region: region,
          Total_Loss: 0,
          Total_Population: 0,
          Total_Buildings: 0,
          Damaged_Buildings: 0,
        };
      }
      acc[region].Total_Loss += Number(row.Total_Loss || 0);
      acc[region].Total_Population += Number(row.Total_Population || 0);
      acc[region].Total_Buildings += Number(row.Total_Buildings || 0);
      acc[region].Damaged_Buildings += Number(row.Number_Damaged_Buildings || 0);
      return acc;
    }, {});
    
    return Object.values(regionTotals) as RegionalSummary[];
  }, [filteredRegionalSummaryBySector, regionalSummary]);

  // Check if filters are active (Tier 3)
  const hasActiveFilters = useMemo(
    () => filters.selectedSectors.length > 0 || filters.selectedHazards.length > 0,
    [filters.selectedSectors.length, filters.selectedHazards.length]
  );

  // Calculate summary statistics DIRECTLY from filtered events (not aggregated data)
  // This ensures stats are always accurate even when district/province IDs don't match
  const stats: SummaryStats = useMemo(
    () => ({
      totalEvents: filteredEvents.length,
      totalAffectedPopulation: filteredEvents.reduce((sum, e) => sum + (e.totalAffectedPopulation || 0), 0),
      totalEconomicDamage: filteredEvents.reduce((sum, e) => sum + (e.totalEconomicDamage || 0), 0),
      // FIX: severity is a string union, not a number - check for 'high' or 'critical'
      highRiskAreas: filteredEvents.filter(e => e.severity === 'high' || e.severity === 'critical').length,
    }),
    [filteredEvents]
  );

  const analyticsHighlights = useMemo(() => {
    if (!aggregatedEventData || aggregatedEventData.length === 0) return null;
    const totalLoss = aggregatedEventData.reduce((sum, d) => sum + d.totalEconomicDamage, 0);
    const totalPop = aggregatedEventData.reduce((sum, d) => sum + d.totalAffectedPopulation, 0);
    const topDistrict = [...aggregatedEventData].sort((a, b) => b.totalEconomicDamage - a.totalEconomicDamage)[0];
    const top5Share = (() => {
      const top5 = [...aggregatedEventData]
        .sort((a, b) => b.totalEconomicDamage - a.totalEconomicDamage)
        .slice(0, 5)
        .reduce((sum, d) => sum + d.totalEconomicDamage, 0);
      return totalLoss > 0 ? (top5 / totalLoss) * 100 : 0;
    })();

    return {
      totalLoss,
      totalPop,
      topDistrict,
      top5Share,
      lossPerPerson: totalPop > 0 ? totalLoss / totalPop : 0,
    };
  }, [aggregatedEventData]);

  // Real sector data from CSV (using filtered data)
  const realSectorChartData = useMemo(() => {
    if (!filteredImpactBySector || filteredImpactBySector.length === 0) {
      return null;
    }

    // Filter out Unknown sector and sort by total loss
    const sortedSectors = [...filteredImpactBySector]
      .filter(s => s.Sector !== 'Unknown')
      .sort((a, b) => (b.Total_Loss || 0) - (a.Total_Loss || 0));

    // Define colors for each sector
    const sectorColors: { [key: string]: string } = {
      'Residential': '#ef4444',
      'Infrastructure': '#f59e0b',
      'Public': '#3b82f6',
      'Productive': '#10b981',
      'Education': '#8b5cf6',
      'Other': '#6b7280',
    };

    return {
      labels: sortedSectors.map(s => s.Sector),
      datasets: [
        {
          label: 'Economic Loss (Millions USD)',
          data: sortedSectors.map(s => (s.Total_Loss || 0) / 1000000),
          backgroundColor: sortedSectors.map(s => sectorColors[s.Sector] || '#6b7280'),
          borderRadius: 6,
        },
      ],
    };
  }, [filteredImpactBySector]);

  // Asset type breakdown chart data
  const assetTypeChartData = useMemo(() => {
    if (
      !assetExposureData ||
      !assetExposureData.stats ||
      !assetExposureData.stats.byType ||
      typeof assetExposureData.stats.byType !== "object"
    ) {
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

  // Regional impact comparison - economic loss by region
  const regionalComparisonData = useMemo(() => {
    if (!derivedRegionalSummary || derivedRegionalSummary.length === 0) {
      return null;
    }

    const sortedRegions = [...derivedRegionalSummary]
      .sort((a: RegionalSummary, b: RegionalSummary) => (b.Total_Loss || 0) - (a.Total_Loss || 0))
      .slice(0, 6); // Top 6 regions

    return {
      labels: sortedRegions.map((r: RegionalSummary) => r.Region || 'Unknown'),
      datasets: [
        {
          label: 'Economic Loss (Millions USD)',
          data: sortedRegions.map((r: RegionalSummary) => (r.Total_Loss || 0) / 1000000),
          backgroundColor: [
            'rgba(239, 68, 68, 0.8)',
            'rgba(249, 115, 22, 0.8)',
            'rgba(251, 191, 36, 0.8)',
            'rgba(59, 130, 246, 0.8)',
            'rgba(34, 197, 94, 0.8)',
            'rgba(168, 85, 247, 0.8)'
          ],
          borderRadius: 4,
        },
      ],
    };
  }, [derivedRegionalSummary]);

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
      <aside className="w-80 max-w-[min(320px,calc(100vw-40px))] flex flex-col flex-shrink-0 glass-panel border-l border-white/10 h-full min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
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
    <div className="w-80 max-w-[min(320px,calc(100vw-40px))] h-full min-h-0 glass-panel border-l border-white/10 flex flex-col flex-shrink-0 overflow-hidden z-50">
      {/* Header */}
      <div className="p-4 space-y-3 border-b border-borderGlow bg-surface/95 backdrop-blur-sm flex-shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            Summary Dashboard
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {filteredEvents.length === events.length
              ? `${filteredEvents.length} ${filteredEvents.length === 1 ? 'District' : 'Districts'}`
              : `${filteredEvents.length} of ${events.length} districts`
            }
          </p>
          {/* Active Filters Indicator */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-start gap-1.5 px-2 py-1 mt-2 bg-blue-500/10 border border-blue-500/30 rounded-md">
              <BarChart3 className="w-3 h-3 text-blue-400" />
              <span className="text-xs font-medium text-blue-300 break-words max-w-full">
                {filters.selectedSectors.length > 0 ? filters.selectedSectors.join(', ') : ''}
                {filters.selectedSectors.length > 0 && filters.selectedHazards.length > 0 ? ' • ' : ''}
                {filters.selectedHazards.length > 0 ? filters.selectedHazards.join(', ') : ''}
              </span>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-1 border-t border-slate-700/50 pt-3">
          {[
            { id: "summary", label: "Summary", icon: BarChart3 },
            { id: "exposure", label: "Exposure", icon: Home },
            { id: "damage", label: "Damage", icon: Flame },
            { id: "analytics", label: "Analytics", icon: TrendingUp },
            ...(hasCycloneData ? [{ id: "cyclone", label: "Cyclone", icon: Wind }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`min-w-[92px] flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[11px] font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-blue-500/20 text-blue-300 border-2 border-blue-500/50 shadow-lg shadow-blue-500/20"
                  : "bg-slate-700/20 text-slate-400 hover:bg-slate-700/40 hover:text-slate-200 border-2 border-transparent"
              }`}
              title={tab.label}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline truncate">{tab.label}</span>
            </button>
          ))}
        </div>
        
        {/* Region Selection Indicator */}
        {selectedRegion && (
          <div className="bg-neon-amber/10 border border-neon-amber/30 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-neon-amber flex items-center gap-2 min-w-0">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{selectedRegion}</span>
              </span>
              <span className="text-xs text-slate-400 truncate">Filtering by region</span>
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
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 space-y-4">
        {/* Summary Tab - Always mounted, visibility controlled by CSS */}
        <div className={isSummaryTab ? "space-y-4" : "hidden"}>
          <div className="space-y-4">
            {/* Hero Metrics */}
            <div className="space-y-3">
              {/* Total Economic Loss */}
              <HeroMetric
                label="Total Economic Loss"
                value={formatCurrency(stats.totalEconomicDamage)}
                subtitle={`Across ${filteredEvents.length} district${filteredEvents.length !== 1 ? 's' : ''}`}
                icon={DollarSign}
                color="red"
              />

              {/* Affected Population */}
              <HeroMetric
                label="Affected Population"
                value={formatNumber(nationalSummary?.[0]?.Exposed_Population || stats.totalAffectedPopulation)}
                subtitle={nationalSummary?.[0]?.Total_Population 
                  ? `${((nationalSummary[0].Exposed_Population / nationalSummary[0].Total_Population * 100) || 0).toFixed(1)}% of total population`
                  : `${filteredEvents.length} district${filteredEvents.length !== 1 ? 's' : ''} affected`
                }
                icon={Users}
                color="orange"
              />

          {/* High Risk Districts */}
          <HeroMetric
            label="High Risk Districts"
            value={stats.highRiskAreas}
            subtitle={aggregatedEventData.length > 0
              ? `${((stats.highRiskAreas / aggregatedEventData.length * 100)).toFixed(0)}% of total districts`
              : 'No districts analyzed'
            }
            icon={Target}
            color="amber"
          />
        </div>

        {/* Disclaimer for National Stats */}
        {hasActiveFilters && nationalSummary && nationalSummary.length > 0 && (
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200">
              <span className="font-semibold">Note:</span> National-level statistics below show <span className="font-bold">all sectors</span> (unfiltered). Detailed sections reflect your active filters.
            </p>
          </div>
        )}

        {/* Summary Details - Collapsible */}
        <div className="space-y-4">
          <div className="space-y-4">
            {/* Top Insights - Analytical Highlights */}
            {aggregatedEventData && aggregatedEventData.length > 0 && (
              <div className="glass-panel rounded-xl p-3 border border-slate-700/50 bg-slate-800/50">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-amber-300" aria-hidden="true" />
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                    Key Insights
                  </h3>
                </div>
                
                <div className="space-y-3 text-xs">
                  {(() => {
                    const topDistrict = aggregatedEventData
                      .sort((a, b) => b.totalEconomicDamage - a.totalEconomicDamage)[0];
                    const totalDamage = aggregatedEventData.reduce((sum, d) => sum + d.totalEconomicDamage, 0);
                    const topDistrictShare = (topDistrict.totalEconomicDamage / totalDamage * 100);
                    const avgDamagePerDistrict = totalDamage / aggregatedEventData.length;
                    const highImpactDistricts = aggregatedEventData.filter(d => 
                      d.totalEconomicDamage > avgDamagePerDistrict * 1.5
                    ).length;
                    
                    return (
                      <>
                        <div className="flex items-start gap-2 p-2 bg-slate-800/50 rounded-lg">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                          <div>
                            <span className="text-slate-300 font-medium">{topDistrict.name}</span>
                            <span className="text-slate-400"> accounts for </span>
                            <span className="text-red-400 font-bold">{topDistrictShare.toFixed(1)}%</span>
                            <span className="text-slate-400"> of total damage — highest vulnerability</span>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-2 p-2 bg-slate-800/50 rounded-lg">
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                          <div>
                            <span className="text-orange-400 font-bold">{highImpactDistricts} districts</span>
                            <span className="text-slate-400"> exceed </span>
                            <span className="text-slate-300">150% of average</span>
                            <span className="text-slate-400"> damage — concentrated impact pattern</span>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-2 p-2 bg-slate-800/50 rounded-lg">
                          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0" />
                          <div>
                            <span className="text-slate-400">Average damage per district: </span>
                            <span className="text-cyan-400 font-bold font-mono">{formatCurrency(avgDamagePerDistrict)}</span>
                            <span className="text-slate-400"> — use for prioritization</span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {aggregatedEventData && aggregatedEventData.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Impact Highlights</h4>
                <TopInsightsCards
                  insights={createDistrictInsights(aggregatedEventData)}
                  className="grid-cols-1 md:grid-cols-1 lg:grid-cols-1 xl:grid-cols-1"
                />
              </div>
            )}
            
            {/* Additional Impact Metrics */}
            {nationalSummary && nationalSummary.length > 0 && (
              <div className="grid grid-cols-1 gap-3">
                <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Households Affected
                      </p>
                      <p className="text-2xl font-bold text-blue-400 mt-1 tabular-nums">
                        {formatNumber(nationalSummary[0]?.Exposed_Households || 0)}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        of {formatNumber(nationalSummary[0]?.Total_Households || 0)} total
                        <span className="text-blue-400 font-semibold ml-1">
                          ({((nationalSummary[0]?.Exposed_Households / nationalSummary[0]?.Total_Households * 100) || 0).toFixed(1)}%)
                        </span>
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-blue-400/10 text-blue-400 flex items-center justify-center flex-shrink-0">
                      <Home className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Roads Damaged
                      </p>
                      <p className="text-2xl font-bold text-orange-400 mt-1 tabular-nums">
                        {Number(nationalSummary[0]?.Damaged_Road_km || 0).toFixed(1)} km
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        of {Number(nationalSummary[0]?.Total_Road_km || 0).toFixed(1)} km total
                        <span className="text-orange-400 font-semibold ml-1">
                          ({((nationalSummary[0]?.Damaged_Road_km / nationalSummary[0]?.Total_Road_km * 100) || 0).toFixed(1)}%)
                        </span>
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-orange-400/10 text-orange-400 flex items-center justify-center flex-shrink-0">
                      <Navigation className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Agricultural Loss
                      </p>
                      <p className="text-2xl font-bold text-green-400 mt-1 tabular-nums">
                        {formatCurrency(nationalSummary[0]?.Crop_Loss || 0)}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        of {formatCurrency(nationalSummary[0]?.Total_Crop_Value || 0)} value
                        <span className="text-green-400 font-semibold ml-1">
                          ({((nationalSummary[0]?.Crop_Loss / nationalSummary[0]?.Total_Crop_Value * 100) || 0).toFixed(1)}%)
                        </span>
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-green-400/10 text-green-400 flex items-center justify-center flex-shrink-0">
                      <Wheat className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Peak Wind Speed
                      </p>
                      <p className="text-2xl font-bold text-cyan-400 mt-1 tabular-nums">
                        {Number(nationalSummary[0]?.Max_Wind_Gusts || 0).toFixed(0)} km/h
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Category 4+ hurricane
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-cyan-400/10 text-cyan-400 flex items-center justify-center flex-shrink-0">
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
              buildingsDamaged={impactBySector && impactBySector.length > 0 ? impactBySector.reduce((sum: number, s: any) => sum + (s.Number_Damaged_Buildings || 0), 0) : 0}
              populationAffected={stats.totalAffectedPopulation}
              infrastructureItems={assetExposureData?.stats?.total || 785}
              eventCount={stats.totalEvents}
              assetStats={assetExposureData?.stats?.criticalInfrastructure}
            />

            {/* Top 5 Impacted Districts */}
            {aggregatedEventData && aggregatedEventData.length > 0 && (() => {
              const nationalTotal = aggregatedEventData.reduce((sum, d) => sum + d.totalEconomicDamage, 0);
              const top5Districts = aggregatedEventData
                .sort((a, b) => b.totalEconomicDamage - a.totalEconomicDamage)
                .slice(0, 5);
              const top5Total = top5Districts.reduce((sum, d) => sum + d.totalEconomicDamage, 0);
              const top5Share = (top5Total / nationalTotal * 100).toFixed(1);
              
              return (
                <div className="glass-panel rounded-xl p-3 border border-slate-700/50 animate-fadeSlide">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Top 5 Impacted Districts</h4>
                    <span className="text-xs text-slate-500 ml-auto">Analysis-ready metrics</span>
                  </div>
                  
                  {/* Table Header */}
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-700">
                    <span>#</span>
                    <span className="ml-2">District</span>
                    <span className="ml-auto">Damage</span>
                  </div>
                  
                  {/* Table Rows */}
                  <div className="space-y-2 mt-2">
                    {top5Districts.map((district, idx) => {
                      const shareOfTotal = ((district.totalEconomicDamage / nationalTotal) * 100).toFixed(1);
                      
                      return (
                        <div key={district.id} className="p-2 rounded-lg hover:bg-slate-700/30 transition-colors">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-amber-400 text-sm w-4 text-center">{idx + 1}</span>
                            <span className="text-slate-200 font-semibold text-sm truncate" title={district.name}>
                              {district.name}
                            </span>
                            <span className="ml-auto text-red-400 font-bold text-sm whitespace-nowrap">
                              {formatCurrency(district.totalEconomicDamage)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs">
                            <span className="text-blue-400">Pop. {formatNumber(district.totalAffectedPopulation)}</span>
                            <span className={`font-bold ${
                              parseFloat(shareOfTotal) > 15 ? 'text-red-400' :
                              parseFloat(shareOfTotal) > 10 ? 'text-orange-400' :
                              parseFloat(shareOfTotal) > 5 ? 'text-yellow-400' :
                              'text-green-400'
                            }`}>
                              {shareOfTotal}% share
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Totals Row */}
                  <div className="mt-2 pt-2 border-t border-slate-600">
                    <div className="p-2 bg-slate-700/50 rounded-lg">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-bold">Top 5 Total</span>
                        <span className="text-white font-bold">{formatCurrency(top5Total)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                        <span>Pop. {formatNumber(top5Districts.reduce((sum, d) => sum + d.totalAffectedPopulation, 0))}</span>
                        <span className="text-cyan-400 font-bold">{top5Share}%</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Legend */}
                  <div className="mt-3 pt-3 border-t border-slate-700 text-xs text-slate-400">
                    <div className="flex flex-col gap-1">
                      <div>
                        <span className="font-semibold">% Share:</span> Portion of national damage
                      </div>
                      <div>
                        <span className="text-amber-400 font-semibold">Top 5 = {top5Share}% of total impact</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
          </div>
        </div>

        {/* Exposure Tab - Always mounted, visibility controlled by CSS */}
        <div className={activeTab === "exposure" ? "space-y-4" : "hidden"}>
            {/* Regional Comparison Chart */}
            {regionalComparisonData && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Most Affected Regions</h4>
                <div className="text-xs text-slate-400 mb-2">Economic loss by administrative region</div>
                <div className="h-48">
                  <Bar
                    data={regionalComparisonData}
                    options={{
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
                          grid: { color: "rgba(255,255,255,0.05)" },
                          ticks: { 
                            font: { size: 9 },
                            callback: function(value) {
                              return '$' + value + 'M';
                            }
                          },
                          title: {
                            display: true,
                            text: 'Economic Loss (USD)',
                            font: { size: 10 },
                            color: 'rgba(255,255,255,0.6)'
                          }
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
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Exposed Assets by Type</h4>
                <div className="text-xs text-slate-400 mb-3">
                  Showing {assetExposureData.stats.total} individual assets
                </div>
                <div className="h-40">
                  <Bar
                    data={assetTypeChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      indexAxis: 'y',
                      plugins: {
                        legend: {
                          display: false,
                        },
                      },
                      scales: {
                        x: {
                          beginAtZero: true,
                          grid: {
                            color: "rgba(255,255,255,0.05)",
                          },
                          ticks: {
                            font: { size: 9 },
                          },
                        },
                        y: {
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
            
            {/* Wind Exposure Distribution */}
            {assetExposureData && (
              <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Wind Exposure Levels</h4>
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
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Wind Intensity Distribution</h4>
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

        {/* Damage Tab - Always mounted, visibility controlled by CSS */}
        <div className={activeTab === "damage" ? "space-y-4" : "hidden"}>
            {derivedRegionalSummary && derivedRegionalSummary.length > 0 && (
              <ScenarioComparison
                metrics={[
                  {
                    best: derivedRegionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Total_Loss) || 0), 0) * 0.7,
                    forecast: derivedRegionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Total_Loss) || 0), 0),
                    worst: derivedRegionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Total_Loss) || 0), 0) * 1.5,
                    label: "Total Economic Loss",
                    unit: "currency",
                  },
                  {
                    best: derivedRegionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Damaged_Buildings) || 0), 0) * 0.6,
                    forecast: derivedRegionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Damaged_Buildings) || 0), 0),
                    worst: derivedRegionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Damaged_Buildings) || 0), 0) * 1.8,
                    label: "Buildings Damaged",
                  },
                ]}
                className="mb-4"
              />
            )}
            {derivedRegionalSummary && derivedRegionalSummary.length > 0 && (
              <div className="grid grid-cols-1 gap-3">
                <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
                  <div className="text-xs font-semibold text-red-300 uppercase tracking-wide mb-2">
                    Most Impacted Region
                  </div>
                  <div className="text-base font-bold text-slate-100">
                    {derivedRegionalSummary
                      .filter((r: any) => r.Region && r.Region.trim() !== '')
                      .sort((a: any, b: any) => (Number(b.Total_Loss) || 0) - (Number(a.Total_Loss) || 0))[0]?.Region || 'N/A'}
                  </div>
                  <div className="text-xs text-red-400 mt-1">
                    {formatCurrency(
                      derivedRegionalSummary
                        .filter((r: any) => r.Region && r.Region.trim() !== '')
                        .sort((a: any, b: any) => (Number(b.Total_Loss) || 0) - (Number(a.Total_Loss) || 0))[0]?.Total_Loss || 0
                    )} loss
                  </div>
                </div>

                <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
                  <div className="text-xs font-semibold text-orange-300 uppercase tracking-wide mb-2">
                    Avg Loss Per Capita
                  </div>
                  <div className="text-base font-bold text-slate-100">
                    ${(
                      derivedRegionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Total_Loss) || 0), 0) /
                      derivedRegionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Total_Population) || 1), 0)
                    ).toFixed(0)}
                  </div>
                  <div className="text-xs text-orange-400 mt-1">Per person</div>
                </div>

                <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
                  <div className="text-xs font-semibold text-yellow-300 uppercase tracking-wide mb-2">
                    Avg Damage Rate
                  </div>
                  <div className="text-base font-bold text-slate-100">
                    {(
                      (derivedRegionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Damaged_Buildings) || 0), 0) /
                      derivedRegionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Total_Buildings) || 1), 0)) *
                      100
                    ).toFixed(1)}%
                  </div>
                  <div className="text-xs text-yellow-400 mt-1">Of all buildings</div>
                </div>

                <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
                  <div className="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-2">
                    Total Roads Damaged
                  </div>
                  <div className="text-base font-bold text-slate-100">
                    {derivedRegionalSummary
                      .reduce((sum: number, r: any) => sum + (Number(r.Damaged_Road_km) || 0), 0)
                      .toFixed(1)} km
                  </div>
                  <div className="text-xs text-blue-400 mt-1">Across all regions</div>
                </div>
              </div>
            )}
            {/* Sector Analysis */}
            {realSectorChartData && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Impact by Sector</h4>
                <div className="h-40 mb-4">
                  <Bar data={realSectorChartData} options={chartOptions} />
                </div>
              </div>
            )}

            {/* Building Damage Distribution by Loss Range */}
            {impactBySector && impactBySector.length > 0 && (() => {
              const totalData = impactBySector.reduce((acc: any, sector: any) => {
                acc.range_1_100 += sector['By_Loss.range_1_100.Number'] || 0;
                acc.range_100_1000 += sector['By_Loss.range_100_1000.Number'] || 0;
                acc.range_1000_10000 += sector['By_Loss.range_1000_10000.Number'] || 0;
                acc.range_10000_100000 += sector['By_Loss.range_10000_100000.Number'] || 0;
                acc.range_100000_plus += sector['By_Loss.range_100000_+.Number'] || 0;
                return acc;
              }, { range_1_100: 0, range_100_1000: 0, range_1000_10000: 0, range_10000_100000: 0, range_100000_plus: 0 });

              const lossRangeData = {
                labels: ['$1-100', '$100-1K', '$1K-10K', '$10K-100K', '$100K+'],
                datasets: [{
                  label: 'Buildings',
                  data: [
                    totalData.range_1_100,
                    totalData.range_100_1000,
                    totalData.range_1000_10000,
                    totalData.range_10000_100000,
                    totalData.range_100000_plus
                  ],
                  backgroundColor: [
                    'rgba(34, 197, 94, 0.8)',
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(251, 191, 36, 0.8)',
                    'rgba(249, 115, 22, 0.8)',
                    'rgba(239, 68, 68, 0.8)'
                  ],
                  borderRadius: 4,
                }]
              };

              return (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Building Damage Distribution</h4>
                  <div className="h-40 mb-4">
                    <Bar data={lossRangeData} options={{
                      ...chartOptions,
                      scales: {
                        ...chartOptions.scales,
                        y: {
                          ...chartOptions.scales.y,
                          title: {
                            display: true,
                            text: 'Number of Buildings',
                            font: { size: 10 },
                            color: 'rgba(255,255,255,0.6)'
                          }
                        }
                      }
                    }} />
                  </div>
                </div>
              );
            })()}

            {/* Building Exposure Status */}
            {impactBySector && impactBySector.length > 0 && (() => {
              const totalBuildings = impactBySector.reduce((sum: number, s: any) => sum + (s.Total_Number_Buildings || 0), 0);
              const exposedBuildings = impactBySector.reduce((sum: number, s: any) => sum + (s.Number_Exposed_Buildings || 0), 0);
              const damagedBuildings = impactBySector.reduce((sum: number, s: any) => sum + (s.Number_Damaged_Buildings || 0), 0);
              const unaffectedBuildings = totalBuildings - exposedBuildings;

              const exposureData = {
                labels: ['Damaged', 'Exposed (Undamaged)', 'Unaffected'],
                datasets: [{
                  label: 'Buildings',
                  data: [
                    damagedBuildings,
                    exposedBuildings - damagedBuildings,
                    unaffectedBuildings
                  ],
                  backgroundColor: [
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(251, 191, 36, 0.8)',
                    'rgba(34, 197, 94, 0.8)'
                  ],
                  borderRadius: 4,
                }]
              };

              return (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Building Exposure Status</h4>
                  <div className="grid grid-cols-1 gap-2 mb-3">
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                      <div className="text-xs text-slate-400 mb-1">Damaged</div>
                      <div className="text-lg font-bold text-red-400">{formatNumber(damagedBuildings)}</div>
                      <div className="text-xs text-slate-500">{((damagedBuildings/totalBuildings)*100).toFixed(1)}%</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                      <div className="text-xs text-slate-400 mb-1">Exposed</div>
                      <div className="text-lg font-bold text-amber-400">{formatNumber(exposedBuildings)}</div>
                      <div className="text-xs text-slate-500">{((exposedBuildings/totalBuildings)*100).toFixed(1)}%</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                      <div className="text-xs text-slate-400 mb-1">Total</div>
                      <div className="text-lg font-bold text-slate-300">{formatNumber(totalBuildings)}</div>
                      <div className="text-xs text-slate-500">100%</div>
                    </div>
                  </div>
                  <div className="h-40">
                    <Bar data={exposureData} options={chartOptions} />
                  </div>
                </div>
              );
            })()}

            {/* Asset Value at Risk */}
            {impactBySector && impactBySector.length > 0 && (() => {
              const totalValue = impactBySector.reduce((sum: number, s: any) => sum + (s.Total_Value || 0), 0);
              const exposedValue = impactBySector.reduce((sum: number, s: any) => sum + (s.Total_Exposed_Value || 0), 0);
              const totalLoss = impactBySector.reduce((sum: number, s: any) => sum + (s.Total_Loss || 0), 0);

              return (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Asset Value Analysis</h4>
                  <div className="space-y-3">
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-slate-400">Total Asset Value</span>
                        <span className="text-sm font-bold text-slate-200">{formatCurrency(totalValue)}</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div className="bg-slate-400 h-2 rounded-full" style={{ width: '100%' }}></div>
                      </div>
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-3 border border-amber-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-amber-400">Exposed Value</span>
                        <span className="text-sm font-bold text-amber-300">{formatCurrency(exposedValue)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                        <span>{((exposedValue/totalValue)*100).toFixed(1)}% of total</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${(exposedValue/totalValue)*100}%` }}></div>
                      </div>
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-3 border border-red-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-red-400">Total Loss</span>
                        <span className="text-sm font-bold text-red-300">{formatCurrency(totalLoss)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                        <span>{((totalLoss/totalValue)*100).toFixed(2)}% of total</span>
                        <span>{((totalLoss/exposedValue)*100).toFixed(1)}% of exposed</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div className="bg-red-500 h-2 rounded-full transition-all" style={{ width: `${(totalLoss/totalValue)*100}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
        </div>

        {/* Analytics Tab - Always mounted, visibility controlled by CSS */}
        <div className={activeTab === "analytics" ? "space-y-4" : "hidden"}>
          <div className="glass-panel rounded-xl p-4 border border-slate-700/50 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-800/40">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Analytics Studio</h3>
                <p className="text-xs text-slate-400">Pattern discovery across exposure, loss, and sectoral risk.</p>
              </div>
              <div className="text-[11px] text-slate-400 px-2 py-1 rounded-full border border-slate-700/60 bg-slate-900/60">
                Model signal view
              </div>
            </div>

            {analyticsHighlights && (
              <div className="mt-4 grid grid-cols-1 gap-3">
                <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Total loss</div>
                  <div className="text-lg font-bold text-slate-100">{formatCurrency(analyticsHighlights.totalLoss)}</div>
                  <div className="text-xs text-slate-400">${analyticsHighlights.top5Share.toFixed(1)}% concentrated in top 5 districts</div>
                </div>
                <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Loss intensity</div>
                  <div className="text-lg font-bold text-slate-100">{formatCurrency(analyticsHighlights.lossPerPerson)}</div>
                  <div className="text-xs text-slate-400">Per affected person (modelled)</div>
                </div>
                {analyticsHighlights.topDistrict && (
                  <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Primary hotspot</div>
                    <div className="text-sm font-semibold text-slate-100 truncate">{analyticsHighlights.topDistrict.name}</div>
                    <div className="text-xs text-slate-400">{formatCurrency(analyticsHighlights.topDistrict.totalEconomicDamage)} loss</div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-2 text-xs">
              <div className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2">
                <span className="text-slate-400">Signal: Loss concentration</span>
                <span className="text-amber-300 font-semibold">High</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2">
                <span className="text-slate-400">Signal: Population exposure</span>
                <span className="text-blue-300 font-semibold">Elevated</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2">
                <span className="text-slate-400">Signal: Sector skew</span>
                <span className="text-emerald-300 font-semibold">Mixed</span>
              </div>
            </div>
          </div>

          {aggregatedEventData && aggregatedEventData.length > 0 && (
            <div className="space-y-4">
              <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Top Districts by Loss</h4>
                <RankedDistrictsChart data={aggregatedEventData} metric="loss" topN={8} />
              </div>
              <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Top Districts by Population</h4>
                <RankedDistrictsChart data={aggregatedEventData} metric="population" topN={8} />
              </div>
            </div>
          )}

          <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Sector and Regional Structure</h4>
            <AdvancedCharts
              regionalSummary={derivedRegionalSummary}
              regionalSummaryBySector={filteredRegionalSummaryBySector}
            />
          </div>
        </div>

        {/* Cyclone Tab - Always mounted, visibility controlled by CSS */}
        <div className={activeTab === "cyclone" ? "space-y-4" : "hidden"}>
          {hasCycloneData && (
            <>
              {/* Cyclone Animation Controls Note */}
              <div className="glass-panel rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Wind className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-semibold text-slate-100">Cyclone Timeline Controls</h3>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded border ${
                    showCycloneControls
                      ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
                      : "text-amber-300 bg-amber-500/10 border-amber-500/30"
                  }`}>
                    {showCycloneControls ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Open the <span className="font-semibold text-blue-300">Filters</span> panel and use the <span className="font-semibold text-blue-300">Cyclone</span> tab to access the timeline controls.
                </p>
              </div>

            </>
          )}
        </div>
      </div>
    </div>
  );
}
