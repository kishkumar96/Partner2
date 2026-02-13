"use client";

import { useMemo, useState, type ReactNode } from "react";
import EnhancedRegionalTable from "./EnhancedRegionalTable";
import ComparativeAnalytics from "./ComparativeAnalytics";
import BuildingsTable from "./BuildingsTable";
import RoadsTable from "./RoadsTable";
import {
  Event,
  Hazard,
  Sector,
  ExposureData,
  EconomicDamageData,
  FilterState,
  District,
  Province,
} from "@/types";
import { formatCurrency, formatNumber } from "@/utils/formatters";
import { computeFilteredData } from "../utils/filteredData";
import { aggregateEventsByLevel } from "@/utils/filterUtils";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Circle,
  DollarSign,
  Download,
  Info,
  Lightbulb,
  Users,
  Construction,
} from "lucide-react";

interface BottomTabsProps {
  events: Event[];
  hazards: Hazard[];
  sectors: Sector[];
  exposureData: ExposureData[];
  economicDamageData: EconomicDamageData[]; // Combined for backward compatibility
  sectorEconomicData?: any[]; // Sector-level economic data
  assetEconomicData?: any[]; // Asset-level economic data
  impactByAssetType?: any[];
  impactBySector?: any[];
  regionalSummary?: any[];
  filters: FilterState;
  districts: District[];
  provinces: Province[];
  damagedBuildings?: GeoJSON.FeatureCollection | null;
  damagedRoads?: GeoJSON.FeatureCollection | null;
  onZoomToAsset?: (coordinates: [number, number], zoom?: number) => void;
}

type TabType = "exposure" | "economic-sector" | "economic-asset" | "events" | "details" | "damage" | "analytics" | "buildings" | "roads";

export default function BottomTabs({
  events,
  hazards,
  sectors,
  exposureData,
  economicDamageData,
  sectorEconomicData = [],
  assetEconomicData = [],
  impactByAssetType = [],
  impactBySector = [],
  regionalSummary = [],
  filters,
  districts,
  provinces,
  damagedBuildings = null,
  damagedRoads = null,
  onZoomToAsset,
}: BottomTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("events");
  const [impactBreakdownView, setImpactBreakdownView] = useState<"aggregation" | "sector" | "hazard">("aggregation");
  const [exposureBreakdownView, setExposureBreakdownView] = useState<"detailed" | "by-region" | "by-sector">("detailed");

  // Export to CSV helper function
  const exportToCSV = (data: any[], filename: string, headers: string[]) => {
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const value = row[h] ?? '';
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
      }).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Helper functions (defined before useMemo hooks that use them)
  const getHazardName = (hazardId: string) =>
    hazards.find((h) => h.id === hazardId)?.name || hazardId;

  const getSectorName = (sectorId: string) =>
    sectors.find((s) => s.id === sectorId)?.name || sectorId;

  const getHazardColor = (hazardId: string) =>
    hazards.find((h) => h.id === hazardId)?.color || "#64748b";

  const getAggregationLabel = () => {
    if (impactBreakdownView === "sector") return "Sector";
    if (impactBreakdownView === "hazard") return "Hazard";
    return filters.aggregationLevel === "district" ? "District" : 
           filters.aggregationLevel === "province" ? "Province" : "National";
  };

  const getSeverityBadge = (highRisk: number, total: number) => {
    if (total === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">
          <Circle className="w-3 h-3" aria-hidden="true" />
          N/A
        </span>
      );
    }

    const percentage = (highRisk / total) * 100;
    if (percentage > 50) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-100 text-red-700">
          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
          HIGH
        </span>
      );
    }
    if (percentage > 20) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-700">
          <AlertCircle className="w-3 h-3" aria-hidden="true" />
          MED
        </span>
      );
    }
    if (percentage > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-100 text-green-700">
          <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
          LOW
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">
        <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
        SAFE
      </span>
    );
  };

  const {
    filteredEvents,
    filteredExposureData,
    filteredEconomicDamageData,
    filteredSectorEconomicData,
    filteredAssetEconomicData,
  } = useMemo(
    () => {
      const result = computeFilteredData({
        events,
        exposureData,
        economicDamageData,
        filters,
        districts,
        provinces,
      });
      
      // Filter sector and asset economic data using the same logic
      const filteredSector = sectorEconomicData.filter((data) => {
        if (filters.selectedHazards.length > 0 && !filters.selectedHazards.includes(data.hazardId)) return false;
        if (filters.selectedSectors.length > 0 && !filters.selectedSectors.includes(data.sectorId)) return false;
        // Date filtering: check if data.year falls within the date range
        if (filters.dateRange.start || filters.dateRange.end) {
          const dataYear = data.year || 2023;
          const startYear = filters.dateRange.start ? new Date(filters.dateRange.start).getFullYear() : 0;
          const endYear = filters.dateRange.end ? new Date(filters.dateRange.end).getFullYear() : 9999;
          if (dataYear < startYear || dataYear > endYear) return false;
        }
        return true;
      });
      
      const filteredAsset = assetEconomicData.filter((data) => {
        if (filters.selectedHazards.length > 0 && !filters.selectedHazards.includes(data.hazardId)) return false;
        if (filters.selectedSectors.length > 0 && !filters.selectedSectors.includes(data.sectorId)) return false;
        // Date filtering: check if data.year falls within the date range
        if (filters.dateRange.start || filters.dateRange.end) {
          const dataYear = data.year || 2023;
          const startYear = filters.dateRange.start ? new Date(filters.dateRange.start).getFullYear() : 0;
          const endYear = filters.dateRange.end ? new Date(filters.dateRange.end).getFullYear() : 9999;
          if (dataYear < startYear || dataYear > endYear) return false;
        }
        return true;
      });
      
      return {
        ...result,
        filteredSectorEconomicData: filteredSector,
        filteredAssetEconomicData: filteredAsset,
      };
    },
    [events, exposureData, economicDamageData, sectorEconomicData, assetEconomicData, filters, districts, provinces]
  );

  // Impact data based on current aggregation level (respects filter)
  const impactData = useMemo(
    () => aggregateEventsByLevel(filteredEvents, filters.aggregationLevel, districts, provinces, false),
    [filteredEvents, filters.aggregationLevel, districts, provinces]
  );

  // Calculate national totals for summary cards
  const nationalSummary = useMemo(() => {
    const totalPopulation = impactData.reduce((sum, d) => sum + d.totalAffectedPopulation, 0);
    const totalLoss = impactData.reduce((sum, d) => sum + d.totalEconomicDamage, 0);
    const totalHighRisk = impactData.reduce((sum, d) => sum + d.highRiskAreas, 0);
    const totalEvents = impactData.reduce((sum, d) => sum + d.totalEvents, 0);
    return { totalPopulation, totalLoss, totalHighRisk, totalEvents, regionCount: impactData.length };
  }, [impactData]);

  // Breakdown by sector
  const sectorBreakdown = useMemo(() => {
    const breakdown = new Map<string, { events: number; population: number; loss: number }>();
    filteredEvents.forEach(event => {
      const sectorId = event.sectorId || 'unknown';
      const current = breakdown.get(sectorId) || { events: 0, population: 0, loss: 0 };
      current.events += 1;
      // Use totalAffectedPopulation and totalEconomicDamage for aggregated events
      current.population += event.totalAffectedPopulation || 0;
      current.loss += event.totalEconomicDamage || 0;
      breakdown.set(sectorId, current);
    });
    return Array.from(breakdown.entries())
      .filter(([sectorId]) => sectorId !== 'unknown')
      .map(([sectorId, data]) => ({
        id: sectorId,
        name: getSectorName(sectorId),
        totalEvents: data.events,
        totalAffectedPopulation: data.population,
        totalEconomicDamage: data.loss,
        highRiskAreas: 0,
        percentage: nationalSummary.totalLoss > 0 ? (data.loss / nationalSummary.totalLoss * 100) : 0
      })).sort((a, b) => b.totalEconomicDamage - a.totalEconomicDamage);
  }, [filteredEvents, nationalSummary.totalLoss]);

  // Breakdown by hazard
  const hazardBreakdown = useMemo(() => {
    const breakdown = new Map<string, { events: number; population: number; loss: number }>();
    filteredEvents.forEach(event => {
      const hazardId = event.hazardId;
      const current = breakdown.get(hazardId) || { events: 0, population: 0, loss: 0 };
      current.events += 1;
      current.population += event.totalAffectedPopulation || 0;
      current.loss += event.totalEconomicDamage || 0;
      breakdown.set(hazardId, current);
    });
    return Array.from(breakdown.entries()).map(([hazardId, data]) => ({
      id: hazardId,
      name: getHazardName(hazardId),
      totalEvents: data.events,
      totalAffectedPopulation: data.population,
      totalEconomicDamage: data.loss,
      highRiskAreas: 0,
      percentage: nationalSummary.totalLoss > 0 ? (data.loss / nationalSummary.totalLoss * 100) : 0
    })).sort((a, b) => b.totalEconomicDamage - a.totalEconomicDamage);
  }, [filteredEvents, nationalSummary.totalLoss]);

  // Select data based on breakdown view
  const displayData = useMemo(() => {
    if (impactBreakdownView === "sector") return sectorBreakdown;
    if (impactBreakdownView === "hazard") return hazardBreakdown;
    return impactData;
  }, [impactBreakdownView, sectorBreakdown, hazardBreakdown, impactData]);

  // Exposure aggregation and totals
  const { exposureDisplayData, exposureTotals } = useMemo(() => {
    if (exposureBreakdownView === "by-region") {
      const regionMap = new Map<string, { population: number; buildings: number; assets: number; entries: number }>();
      filteredExposureData.forEach(exp => {
        const region = exp.region || 'Unknown';
        const current = regionMap.get(region) || { population: 0, buildings: 0, assets: 0, entries: 0 };
        current.population += exp.population || 0;
        current.buildings += (exp.buildingCount || exp.infrastructure || 0);
        current.assets += exp.assets || 0;
        current.entries += 1;
        regionMap.set(region, current);
      });
      const data = Array.from(regionMap.entries()).map(([region, totals]) => ({
        id: region,
        region,
        sectorId: 'aggregated',
        hazardId: 'aggregated',
        population: totals.population,
        buildingCount: totals.buildings,
        assets: totals.assets,
        entries: totals.entries
      }));
      return { 
        exposureDisplayData: data.sort((a, b) => b.assets - a.assets), 
        exposureTotals: {
          population: data.reduce((sum, d) => sum + d.population, 0),
          buildings: data.reduce((sum, d) => sum + d.buildingCount, 0),
          assets: data.reduce((sum, d) => sum + d.assets, 0)
        }
      };
    } else if (exposureBreakdownView === "by-sector") {
      const sectorMap = new Map<string, { population: number; buildings: number; assets: number; entries: number }>();
      filteredExposureData.forEach(exp => {
        const sector = exp.sectorId;
        const current = sectorMap.get(sector) || { population: 0, buildings: 0, assets: 0, entries: 0 };
        current.population += exp.population || 0;
        current.buildings += (exp.buildingCount || exp.infrastructure || 0);
        current.assets += exp.assets || 0;
        current.entries += 1;
        sectorMap.set(sector, current);
      });
      const data = Array.from(sectorMap.entries()).map(([sectorId, totals]) => ({
        id: sectorId,
        region: 'All Regions',
        sectorId,
        hazardId: 'aggregated',
        population: totals.population,
        buildingCount: totals.buildings,
        assets: totals.assets,
        entries: totals.entries
      }));
      return { 
        exposureDisplayData: data.sort((a, b) => b.assets - a.assets),
        exposureTotals: {
          population: data.reduce((sum, d) => sum + d.population, 0),
          buildings: data.reduce((sum, d) => sum + d.buildingCount, 0),
          assets: data.reduce((sum, d) => sum + d.assets, 0)
        }
      };
    }
    // Detailed view
    return { 
      exposureDisplayData: filteredExposureData,
      exposureTotals: {
        population: filteredExposureData.reduce((sum, d) => sum + (d.population || 0), 0),
        buildings: filteredExposureData.reduce((sum, d) => sum + (d.buildingCount || d.infrastructure || 0), 0),
        assets: filteredExposureData.reduce((sum, d) => sum + (d.assets || 0), 0)
      }
    };
  }, [filteredExposureData, exposureBreakdownView]);

  // Economic totals and percentages
  const sectorEconomicTotals = useMemo(() => {
    const total = filteredSectorEconomicData.reduce((sum, d) => sum + (d.totalLoss || 0), 0);
    return {
      directLoss: filteredSectorEconomicData.reduce((sum, d) => sum + (d.directLoss || 0), 0),
      indirectLoss: filteredSectorEconomicData.reduce((sum, d) => sum + (d.indirectLoss || 0), 0),
      totalLoss: total,
      buildings: filteredSectorEconomicData.reduce((sum, d) => sum + (d.buildingCount || 0), 0)
    };
  }, [filteredSectorEconomicData]);

  const assetEconomicTotals = useMemo(() => {
    const total = filteredAssetEconomicData.reduce((sum, d) => sum + (d.totalLoss || 0), 0);
    return {
      directLoss: filteredAssetEconomicData.reduce((sum, d) => sum + (d.directLoss || 0), 0),
      indirectLoss: filteredAssetEconomicData.reduce((sum, d) => sum + (d.indirectLoss || 0), 0),
      totalLoss: total,
      assetCount: filteredAssetEconomicData.reduce((sum, d) => sum + (d.assetCount || 0), 0)
    };
  }, [filteredAssetEconomicData]);

  // Filtered data for Details tab (respecting filters)
  const filteredImpactByAssetType = useMemo(() => {
    if (!impactByAssetType || impactByAssetType.length === 0) return [];
    return impactByAssetType; // CSV doesn't contain sector/hazard fields for filtering
  }, [impactByAssetType]);

  const filteredImpactBySector = useMemo(() => {
    if (!impactBySector || impactBySector.length === 0) return [];
    // Could filter by sector if filters.selectedSectors is active and matches CSV Sector field
    if (filters.selectedSectors.length > 0) {
      return impactBySector.filter((row: any) => {
        const sectorName = row.Sector || '';
        // Match sector name against selected sector IDs (find sector by name)
        const matchingSector = sectors.find(s => s.name === sectorName);
        return matchingSector && filters.selectedSectors.includes(matchingSector.id);
      });
    }
    return impactBySector;
  }, [impactBySector, filters.selectedSectors, sectors]);

  // Filtered regional summary for Damage tab
  const filteredRegionalSummary = useMemo(() => {
    if (!regionalSummary || regionalSummary.length === 0) return [];
    // Note: regionalSummary.csv is pre-aggregated across all sectors/hazards
    // It doesn't contain sector/hazard breakdown, so we can't filter by those dimensions
    // This represents total damage regardless of filter selections
    return regionalSummary;
  }, [regionalSummary]);

  const tabs: { id: TabType; label: ReactNode }[] = [
    { 
      id: "events", 
      label: `Impact (${displayData.length || 0})`
    },
    { 
      id: "exposure", 
      label: filteredExposureData.length === exposureData.length
        ? `Exposure (${filteredExposureData.length})`
        : `Exposure (${filteredExposureData.length}/${exposureData.length})`
    },
    { 
      id: "economic-sector", 
      label: filteredSectorEconomicData.length === sectorEconomicData.length
        ? `Economic by Sector (${filteredSectorEconomicData.length})`
        : `Economic by Sector (${filteredSectorEconomicData.length}/${sectorEconomicData.length})`
    },
    { 
      id: "economic-asset", 
      label: filteredAssetEconomicData.length === assetEconomicData.length
        ? `Economic by Asset (${filteredAssetEconomicData.length})`
        : `Economic by Asset (${filteredAssetEconomicData.length}/${assetEconomicData.length})`
    },
    { id: "details", label: "Details" },
    { id: "damage", label: `Damage (${regionalSummary.length})` },
    {
      id: "buildings",
      label: (
        <span className="inline-flex items-center gap-1">
          <Building2 className="w-3 h-3" aria-hidden="true" />
          Buildings
        </span>
      ),
    },
    {
      id: "roads",
      label: (
        <span className="inline-flex items-center gap-1">
          <Construction className="w-3 h-3" aria-hidden="true" />
          Roads
        </span>
      ),
    },
    {
      id: "analytics",
      label: (
        <span className="inline-flex items-center gap-1">
          <BarChart3 className="w-3 h-3" aria-hidden="true" />
          Analytics
        </span>
      ),
    },
  ];

  return (
    <div className="h-72 lg:h-80 glass-panel border-t border-white/10 flex flex-col overflow-hidden min-h-0">
      {/* Tab Headers - Reduced padding */}
      <div className="flex border-b border-white/10 px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content - Consistent spacing */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {activeTab === "events" && (
          <div className="space-y-4">
            {/* Summary Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="glass-panel rounded-lg p-3 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span className="text-xs text-slate-400 uppercase">People Affected</span>
                </div>
                <div className="text-xl font-bold text-slate-100">{formatNumber(nationalSummary.totalPopulation)}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Across {nationalSummary.regionCount} {filters.aggregationLevel === "district" ? "districts" : filters.aggregationLevel === "province" ? "provinces" : "regions"}
                </div>
              </div>
              
              <div className="glass-panel rounded-lg p-3 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-slate-400 uppercase">Economic Loss</span>
                </div>
                <div className="text-xl font-bold text-slate-100">{formatCurrency(nationalSummary.totalLoss)}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Total damage estimate
                </div>
              </div>
              
              <div className="glass-panel rounded-lg p-3 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="w-4 h-4 text-orange-400" />
                  <span className="text-xs text-slate-400 uppercase">Impact Entries</span>
                </div>
                <div className="text-xl font-bold text-slate-100">{nationalSummary.totalEvents}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Regional × sector records
                </div>
              </div>
              
              <div className="glass-panel rounded-lg p-3 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-xs text-slate-400 uppercase">High Risk</span>
                </div>
                <div className="text-xl font-bold text-slate-100">{nationalSummary.totalHighRisk}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {nationalSummary.totalEvents > 0 ? `${((nationalSummary.totalHighRisk / nationalSummary.totalEvents) * 100).toFixed(0)}% of entries` : "No data"}
                </div>
              </div>
            </div>

            {/* Breakdown View Toggle */}
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-200">
                Impact Breakdown
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setImpactBreakdownView("aggregation")}
                  className={`px-3 py-1 text-xs rounded border transition-colors ${
                    impactBreakdownView === "aggregation"
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/50"
                      : "bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600"
                  }`}
                >
                  By {filters.aggregationLevel === "district" ? "District" : filters.aggregationLevel === "province" ? "Province" : "Region"}
                </button>
                <button
                  onClick={() => setImpactBreakdownView("sector")}
                  className={`px-3 py-1 text-xs rounded border transition-colors ${
                    impactBreakdownView === "sector"
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/50"
                      : "bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600"
                  }`}
                >
                  By Sector
                </button>
                <button
                  onClick={() => setImpactBreakdownView("hazard")}
                  className={`px-3 py-1 text-xs rounded border transition-colors ${
                    impactBreakdownView === "hazard"
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/50"
                      : "bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600"
                  }`}
                >
                  By Hazard
                </button>
                <button
                  onClick={() => {
                    const dataToExport = displayData.map(data => ({
                      [getAggregationLabel()]: data.name,
                      'Impact Entries': data.totalEvents,
                      'Population': data.totalAffectedPopulation,
                      'Economic Loss': data.totalEconomicDamage,
                      ...((impactBreakdownView === "sector" || impactBreakdownView === "hazard") ? { 'Percentage': ((data as any).percentage || 0).toFixed(1) + '%' } : {}),
                      'High Risk Areas': data.highRiskAreas
                    }));
                    exportToCSV(dataToExport, `impact-${impactBreakdownView}`, Object.keys(dataToExport[0] || {}));
                  }}
                  className="px-3 py-1 text-xs rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20 transition-colors"
                  title="Export to CSV"
                >
                  <span className="inline-flex items-center gap-1">
                    <Download className="w-3 h-3" aria-hidden="true" />
                    Export
                  </span>
                </button>
              </div>
            </div>

            {/* Multi-Row Breakdown Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-700/60">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      {getAggregationLabel()}
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Impact Entries
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Population
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Economic Loss
                    </th>
                    {(impactBreakdownView === "sector" || impactBreakdownView === "hazard") && (
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                        % of Total
                      </th>
                    )}
                    <th className="px-4 py-2 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Severity
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {displayData.map((data) => (
                    <tr
                      key={data.id}
                      className="hover:bg-white/5"
                    >
                      <td className="px-4 py-3 text-sm text-slate-100 font-medium">
                        {data.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-100 text-right">
                        {data.totalEvents}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-100 text-right">
                        {formatNumber(data.totalAffectedPopulation)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-100 text-right font-medium">
                        {formatCurrency(data.totalEconomicDamage)}
                      </td>
                      {(impactBreakdownView === "sector" || impactBreakdownView === "hazard") && (
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {(data as any).percentage?.toFixed(1)}%
                        </td>
                      )}
                      <td className="px-4 py-3 text-center">
                        {getSeverityBadge(data.highRiskAreas, data.totalEvents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {displayData.length > 1 && (
                  <tfoot className="bg-slate-900/40 border-t-2 border-slate-700">
                    <tr>
                      <td className="px-4 py-3 text-sm font-bold text-slate-100">
                        TOTAL
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                        {nationalSummary.totalEvents}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                        {formatNumber(nationalSummary.totalPopulation)}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                        {formatCurrency(nationalSummary.totalLoss)}
                      </td>
                      {(impactBreakdownView === "sector" || impactBreakdownView === "hazard") && (
                        <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                          100%
                        </td>
                      )}
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Context Note */}
            {filters.aggregationLevel === "national" && displayData.length === 1 && impactBreakdownView === "aggregation" && (
              <div className="text-xs text-slate-400 px-4 py-2 bg-slate-900/30 rounded border border-slate-700/50">
                <span className="inline-flex items-center gap-1">
                  <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
                  <strong>Tip:</strong>
                </span>{" "}
                Toggle to "By Province" or "By District" in filters, or use the breakdown buttons above to see comparative analysis across regions, sectors, or hazards.
              </div>
            )}
          </div>
        )}

        {activeTab === "exposure" && (
          <div className="space-y-4">
            {/* Breakdown View Toggle */}
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-200">
                Exposure Data ({exposureDisplayData.length} {exposureBreakdownView === "detailed" ? "entries" : exposureBreakdownView === "by-region" ? "regions" : "sectors"})
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setExposureBreakdownView("detailed")}
                  className={`px-3 py-1 text-xs rounded border transition-colors ${
                    exposureBreakdownView === "detailed"
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/50"
                      : "bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600"
                  }`}
                >
                  Detailed
                </button>
                <button
                  onClick={() => setExposureBreakdownView("by-region")}
                  className={`px-3 py-1 text-xs rounded border transition-colors ${
                    exposureBreakdownView === "by-region"
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/50"
                      : "bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600"
                  }`}
                >
                  By Region
                </button>
                <button
                  onClick={() => setExposureBreakdownView("by-sector")}
                  className={`px-3 py-1 text-xs rounded border transition-colors ${
                    exposureBreakdownView === "by-sector"
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/50"
                      : "bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600"
                  }`}
                >
                  By Sector
                </button>
                <button
                  onClick={() => {
                    const dataToExport = exposureDisplayData.map(exp => ({
                      Region: exp.region,
                      Sector: getSectorName(exp.sectorId),
                      Hazard: exp.hazardId === 'aggregated' ? 'All' : getHazardName(exp.hazardId),
                      Population: exp.population,
                      Buildings: exp.buildingCount,
                      'Value at Risk': exp.assets,
                      ...((exp as any).entries ? { Entries: (exp as any).entries } : {})
                    }));
                    exportToCSV(dataToExport, 'exposure-data', Object.keys(dataToExport[0] || {}));
                  }}
                  className="px-3 py-1 text-xs rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20 transition-colors"
                  title="Export to CSV"
                >
                  <span className="inline-flex items-center gap-1">
                    <Download className="w-3 h-3" aria-hidden="true" />
                    Export
                  </span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700/60">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Region
                  </th>
                  {exposureBreakdownView === "detailed" && (
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Sector
                    </th>
                  )}
                  {exposureBreakdownView === "by-sector" && (
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Sector
                    </th>
                  )}
                  {exposureBreakdownView === "detailed" && (
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Hazard
                    </th>
                  )}
                  {exposureBreakdownView !== "detailed" && (
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Entries
                    </th>
                  )}
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Population
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Buildings
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Value at Risk
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {exposureDisplayData.map((exposure, index) => (
                  <tr
                    key={exposure.id || `exposure-${index}`}
                    className="hover:bg-white/5"
                  >
                    <td className="px-4 py-3 text-sm text-slate-100 font-medium">
                      {exposure.region || 'Unknown'}
                    </td>
                    {exposureBreakdownView === "detailed" && (
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {getSectorName(exposure.sectorId)}
                      </td>
                    )}
                    {exposureBreakdownView === "by-sector" && (
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {getSectorName(exposure.sectorId)}
                      </td>
                    )}
                    {exposureBreakdownView === "detailed" && (
                      <td className="px-4 py-3 text-sm text-slate-100">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                          style={{ backgroundColor: getHazardColor(exposure.hazardId) }}
                          aria-hidden="true"
                        />
                        {getHazardName(exposure.hazardId)}
                      </td>
                    )}
                    {exposureBreakdownView !== "detailed" && (
                      <td className="px-4 py-3 text-sm text-slate-300 text-right">
                        {(exposure as any).entries}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-slate-100 text-right">
                      {formatNumber(exposure.population)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right">
                      {formatNumber(exposure.buildingCount || (exposure as any).infrastructure)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right font-medium">
                      {formatCurrency(exposure.assets)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900/40 border-t-2 border-slate-700">
                <tr>
                  <td className="px-4 py-3 text-sm font-bold text-slate-100">
                    TOTAL
                  </td>
                  {(exposureBreakdownView === "detailed" || exposureBreakdownView === "by-sector") && (
                    <td className="px-4 py-3"></td>
                  )}
                  {exposureBreakdownView === "detailed" && (
                    <td className="px-4 py-3"></td>
                  )}
                  {exposureBreakdownView !== "detailed" && (
                    <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                      {exposureDisplayData.length}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                    {formatNumber(exposureTotals.population)}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                    {formatNumber(exposureTotals.buildings)}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                    {formatCurrency(exposureTotals.assets)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          </div>
        )}

        {activeTab === "economic-sector" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-4 py-2">
              <div className="text-sm text-slate-400">
                Economic losses aggregated by sector. For asset-specific details, see the "Economic by Asset" tab.
              </div>
              <button
                onClick={() => {
                  const dataToExport = filteredSectorEconomicData.map(damage => ({
                    Region: damage.region || 'National',
                    Sector: getSectorName(damage.sectorId),
                    Hazard: getHazardName(damage.hazardId),
                    'Direct Loss': damage.directLoss,
                    'Indirect Loss': damage.indirectLoss,
                    'Total Loss': damage.totalLoss,
                    'Percentage': sectorEconomicTotals.totalLoss > 0 ? ((damage.totalLoss / sectorEconomicTotals.totalLoss) * 100).toFixed(2) + '%' : '0%',
                    Buildings: damage.buildingCount || 0,
                    Year: damage.year
                  }));
                  exportToCSV(dataToExport, 'economic-sector', Object.keys(dataToExport[0] || {}));
                }}
                className="px-3 py-1 text-xs rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20 transition-colors"
                title="Export to CSV"
              >
                <span className="inline-flex items-center gap-1">
                  <Download className="w-3 h-3" aria-hidden="true" />
                  Export
                </span>
              </button>
            </div>
            <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700/60">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Region
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Sector
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Hazard
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Direct Loss
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Indirect Loss
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Total Loss
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider bg-blue-500/10">
                    % of Total
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Buildings
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Year
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {filteredSectorEconomicData.map((damage, index) => (
                  <tr
                    key={damage.id || `damage-sector-${index}`}
                    className="hover:bg-white/5"
                  >
                    <td className="px-4 py-3 text-sm text-slate-100 font-medium">
                      {damage.region || 'National'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {getSectorName(damage.sectorId)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                        style={{ backgroundColor: getHazardColor(damage.hazardId) }}
                        aria-hidden="true"
                      />
                      {getHazardName(damage.hazardId)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right">
                      {formatCurrency(damage.directLoss)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right">
                      {formatCurrency(damage.indirectLoss)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right font-bold">
                      {formatCurrency(damage.totalLoss)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right bg-blue-500/10">
                      {sectorEconomicTotals.totalLoss > 0 ? ((damage.totalLoss / sectorEconomicTotals.totalLoss) * 100).toFixed(1) : '0.0'}%
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">
                      {formatNumber(damage.buildingCount || 0)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-center">
                      {damage.year}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900/40 border-t-2 border-slate-700">
                <tr>
                  <td className="px-4 py-3 text-sm font-bold text-slate-100" colSpan={3}>
                    TOTAL
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                    {formatCurrency(sectorEconomicTotals.directLoss)}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                    {formatCurrency(sectorEconomicTotals.indirectLoss)}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                    {formatCurrency(sectorEconomicTotals.totalLoss)}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right bg-blue-500/10">
                    100%
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                    {formatNumber(sectorEconomicTotals.buildings)}
                  </td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          </div>
        )}

        {activeTab === "economic-asset" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-4 py-2">
              <div className="text-sm text-slate-400">
                Economic losses by individual asset type. For sector-level aggregates, see the "Economic by Sector" tab.
              </div>
              <button
                onClick={() => {
                  const dataToExport = filteredAssetEconomicData.map(damage => ({
                    'Asset Type': damage.assetType || 'Unknown',
                    Sector: getSectorName(damage.sectorId),
                    Hazard: getHazardName(damage.hazardId),
                    Count: damage.assetCount || 0,
                    'Direct Loss': damage.directLoss,
                    'Indirect Loss': damage.indirectLoss,
                    'Total Loss': damage.totalLoss,
                    'Percentage': assetEconomicTotals.totalLoss > 0 ? ((damage.totalLoss / assetEconomicTotals.totalLoss) * 100).toFixed(2) + '%' : '0%',
                    Year: damage.year
                  }));
                  exportToCSV(dataToExport, 'economic-asset', Object.keys(dataToExport[0] || {}));
                }}
                className="px-3 py-1 text-xs rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20 transition-colors"
                title="Export to CSV"
              >
                <span className="inline-flex items-center gap-1">
                  <Download className="w-3 h-3" aria-hidden="true" />
                  Export
                </span>
              </button>
            </div>
            <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700/60">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Asset Type
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Sector
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Hazard
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Count
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Direct Loss
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Indirect Loss
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Total Loss
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider bg-blue-500/10">
                    % of Total
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Year
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {filteredAssetEconomicData.map((damage, index) => (
                  <tr
                    key={damage.id || `damage-asset-${index}`}
                    className="hover:bg-white/5"
                  >
                    <td className="px-4 py-3 text-sm text-slate-100 font-medium">
                      {damage.assetType || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {getSectorName(damage.sectorId)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                        style={{ backgroundColor: getHazardColor(damage.hazardId) }}
                        aria-hidden="true"
                      />
                      {getHazardName(damage.hazardId)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right">
                      {formatNumber(damage.assetCount || 0)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right">
                      {formatCurrency(damage.directLoss)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right">
                      {formatCurrency(damage.indirectLoss)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right font-bold">
                      {formatCurrency(damage.totalLoss)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right bg-blue-500/10">
                      {assetEconomicTotals.totalLoss > 0 ? ((damage.totalLoss / assetEconomicTotals.totalLoss) * 100).toFixed(1) : '0.0'}%
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-center">
                      {damage.year}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900/40 border-t-2 border-slate-700">
                <tr>
                  <td className="px-4 py-3 text-sm font-bold text-slate-100" colSpan={3}>
                    TOTAL
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                    {formatNumber(assetEconomicTotals.assetCount)}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                    {formatCurrency(assetEconomicTotals.directLoss)}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                    {formatCurrency(assetEconomicTotals.indirectLoss)}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                    {formatCurrency(assetEconomicTotals.totalLoss)}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right bg-blue-500/10">
                    100%
                  </td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          </div>
        )}

        {activeTab === "details" && (
          <div className="space-y-4">
            <div className="text-xs text-slate-400 px-4 py-2 bg-slate-900/30 rounded border border-slate-700/50">
              <span className="inline-flex items-center gap-1">
                <Info className="w-3.5 h-3.5" aria-hidden="true" />
                <strong>Note:</strong>
              </span>{" "}
              This tab shows aggregated impact data from CSV files. <strong>Sector filter is active</strong> (if selected). Hazard and date filters do not apply as CSV data lacks that granularity.
            </div>
            {filteredImpactByAssetType && filteredImpactByAssetType.length > 0 && (
              <div className="overflow-x-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-slate-200">
                    Impact by Asset Type
                  </div>
                  <button
                    onClick={() => {
                      const dataToExport = filteredImpactByAssetType.map(row => ({
                        Asset: row.Asset || 'Unknown',
                        'Total Loss': Number(row.Total_Loss) || 0
                      }));
                      exportToCSV(dataToExport, 'impact-by-asset', ['Asset', 'Total Loss']);
                    }}
                    className="px-3 py-1 text-xs rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20 transition-colors"
                    title="Export to CSV"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Download className="w-3 h-3" aria-hidden="true" />
                      Export
                    </span>
                  </button>
                </div>
                <table className="min-w-full divide-y divide-slate-700/60">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Asset
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Loss
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {[...filteredImpactByAssetType]
                      .sort(
                        (a, b) => (Number(b.Total_Loss) || 0) - (Number(a.Total_Loss) || 0)
                      )
                      .map((row, idx) => (
                        <tr
                          key={row.Asset || `asset-${idx}`}
                          className="hover:bg-white/5"
                        >
                          <td className="px-4 py-3 text-sm text-slate-100">
                            {row.Asset || "Unknown"}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-100 text-right font-semibold">
                            {formatCurrency(Number(row.Total_Loss) || 0)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {filteredImpactBySector && filteredImpactBySector.length > 0 && (
              <div className="overflow-x-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-slate-200">
                    Impact by Sector
                  </div>
                  <button
                    onClick={() => {
                      const dataToExport = filteredImpactBySector.map(row => ({
                        Sector: row.Sector || 'Unknown',
                        'Total Loss': Number(row.Total_Loss) || 0
                      }));
                      exportToCSV(dataToExport, 'impact-by-sector', ['Sector', 'Total Loss']);
                    }}
                    className="px-3 py-1 text-xs rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20 transition-colors"
                    title="Export to CSV"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Download className="w-3 h-3" aria-hidden="true" />
                      Export
                    </span>
                  </button>
                </div>
                <table className="min-w-full divide-y divide-slate-700/60">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Sector
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Loss
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {[...filteredImpactBySector]
                      .sort(
                        (a, b) => (Number(b.Total_Loss) || 0) - (Number(a.Total_Loss) || 0)
                      )
                      .map((row, idx) => (
                        <tr
                          key={row.Sector || `sector-${idx}`}
                          className="hover:bg-white/5"
                        >
                          <td className="px-4 py-3 text-sm text-slate-100">
                            {row.Sector || "Unknown"}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-100 text-right font-semibold">
                            {formatCurrency(Number(row.Total_Loss) || 0)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "damage" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400 px-4 py-2 bg-slate-900/30 rounded border border-slate-700/50">
                <span className="inline-flex items-center gap-1">
                  <Info className="w-3.5 h-3.5" aria-hidden="true" />
                  <strong>Note:</strong>
                </span>{" "}
                This tab shows regional damage totals (buildings, roads, roads) from pre-aggregated CSV data. <strong>Sector and hazard filters do not apply</strong> as the source data doesn't contain that granularity. Shows total damage across all sectors and hazards for each region.
              </div>
              <button
                onClick={() => {
                  const dataToExport = filteredRegionalSummary
                    .filter((r: any) => r.Region && r.Region.trim() !== '')
                    .map((r: any) => ({
                      'Region': r.Region,
                      'Population': Number(r.Total_Population) || 0,
                      'Total Buildings': Number(r.Total_Buildings) || 0,
                      'Damaged Buildings': Number(r.Damaged_Buildings) || 0,
                      'Road km': Number(r.Damaged_Road_km) || 0,
                      'Total Loss': Number(r.Total_Loss) || 0,
                      'Loss per Capita': (Number(r.Total_Loss) || 0) / (Number(r.Total_Population) || 1),
                      'Damage %': ((Number(r.Damaged_Buildings) || 0) / (Number(r.Total_Buildings) || 1) * 100).toFixed(1) + '%'
                    }));
                  exportToCSV(dataToExport, 'regional-damage', Object.keys(dataToExport[0] || {}));
                }}
                className="px-3 py-1 text-xs rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20 transition-colors"
                title="Export to CSV"
              >
                <span className="inline-flex items-center gap-1">
                  <Download className="w-3 h-3" aria-hidden="true" />
                  Export
                </span>
              </button>
            </div>
            {/* Enhanced Regional Table with Derived Metrics */}
            {filteredRegionalSummary && filteredRegionalSummary.length > 0 && (
              <EnhancedRegionalTable
                data={filteredRegionalSummary
                  .filter((r: any) => r.Region && r.Region.trim() !== '')
                  .map((r: any) => ({
                    id: r.Region_ID || r.Region,
                    name: r.Region,
                    economicLoss: Number(r.Total_Loss) || 0,
                    populationAffected: Number(r.Total_Population) || 0,
                    assetsExposed: Number(r.Total_Buildings) || 0,
                    assetsDamaged: Number(r.Damaged_Buildings) || 0,
                    area: 100, // Placeholder - would need actual area data
                    totalPopulation: Number(r.Total_Population) || 0,
                  }))}
                nationalTotal={filteredRegionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Total_Loss) || 0), 0)}
                showDerivedMetrics={true}
              />
            )}

            {/* Regional Summary Table with Normalized Metrics */}
            {filteredRegionalSummary && filteredRegionalSummary.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <div className="text-sm font-semibold text-slate-200 mb-3 flex items-center justify-between">
                    <span>Regional Damage Assessment</span>
                    <span className="text-xs font-normal text-slate-400">
                      {filteredRegionalSummary.length} regions analyzed
                    </span>
                  </div>
                  <table className="min-w-full divide-y divide-slate-700/60 text-xs">
                    <thead className="bg-slate-900/60">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider sticky left-0 bg-slate-900/60">
                          Region
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Population
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Buildings
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Damaged
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Road km
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Total Loss
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider bg-blue-500/10">
                          Loss/Capita
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider bg-blue-500/10">
                          Damage %
                        </th>
                      </tr>
                    </thead>
                    <tbody className="glass-panel divide-y divide-slate-700">
                      {filteredRegionalSummary
                        .filter((r: any) => r.Region && r.Region.trim() !== '')
                        .sort((a: any, b: any) => (Number(b.Total_Loss) || 0) - (Number(a.Total_Loss) || 0))
                        .map((region: any, idx: number) => {
                          const totalPop = Number(region.Total_Population) || 1;
                          const totalBuildings = Number(region.Total_Buildings) || 1;
                          const totalLoss = Number(region.Total_Loss) || 0;
                          const damagedBuildings = Number(region.Damaged_Buildings) || 0;
                          const lossPerCapita = totalLoss / totalPop;
                          const damagePercent = (damagedBuildings / totalBuildings) * 100;
                          
                          return (
                            <tr
                              key={region.Region_ID || `region-${idx}`}
                              className="hover:bg-white/5/50 transition-colors"
                            >
                              <td className="px-3 py-2 text-sm font-medium text-slate-100 sticky left-0 bg-slate-900/95 backdrop-blur-sm">
                                {region.Region || 'Unknown'}
                              </td>
                              <td className="px-3 py-2 text-sm text-slate-300 text-right tabular-nums">
                                {formatNumber(totalPop)}
                              </td>
                              <td className="px-3 py-2 text-sm text-slate-300 text-right tabular-nums">
                                {formatNumber(totalBuildings)}
                              </td>
                              <td className="px-3 py-2 text-sm text-right tabular-nums">
                                <span className="font-semibold text-red-600 dark:text-red-400">
                                  {formatNumber(damagedBuildings)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-sm text-slate-300 text-right tabular-nums">
                                {Number(region.Damaged_Road_km || 0).toFixed(1)}
                              </td>
                              <td className="px-3 py-2 text-sm text-right tabular-nums">
                                <span className="font-semibold text-red-600 dark:text-red-400">
                                  {formatCurrency(totalLoss)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-sm text-slate-300 text-right tabular-nums bg-blue-500/10">
                                ${lossPerCapita.toFixed(0)}
                              </td>
                              <td className="px-3 py-2 text-sm text-right tabular-nums bg-blue-500/10">
                                <span className={`font-semibold ${
                                  damagePercent > 75 ? 'text-red-600 dark:text-red-400' :
                                  damagePercent > 50 ? 'text-orange-600 dark:text-orange-400' :
                                  damagePercent > 25 ? 'text-yellow-600 dark:text-yellow-400' :
                                  'text-green-600 dark:text-green-400'
                                }`}>
                                  {damagePercent.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

              </>
            ) : (
              <div className="text-center py-8 text-slate-400">
                No regional summary data available
              </div>
            )}
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <div className="p-4 overflow-y-auto">
            <ComparativeAnalytics
              regionalData={regionalSummary}
              sectorData={impactBySector}
            />
          </div>
        )}

        {/* Buildings Tab */}
        {activeTab === "buildings" && (
          <div className="overflow-y-auto">
            {damagedBuildings && onZoomToAsset ? (
              <BuildingsTable
                data={damagedBuildings}
                onZoom={onZoomToAsset}
                maxHeight="calc(100vh - 400px)"
              />
            ) : (
              <div className="glass-panel rounded-lg p-8 text-center">
                <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                <p className="text-slate-300 font-medium">No building damage data available</p>
                <p className="text-sm text-slate-400 mt-1">
                  Building data will appear here when loaded
                </p>
              </div>
            )}
          </div>
        )}

        {/* Roads Tab */}
        {activeTab === "roads" && (
          <div className="overflow-y-auto">
            {damagedRoads && onZoomToAsset ? (
              <RoadsTable
                data={damagedRoads}
                onZoom={onZoomToAsset}
                maxHeight="calc(100vh - 400px)"
              />
            ) : (
              <div className="glass-panel rounded-lg p-8 text-center">
                <Construction className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                <p className="text-slate-300 font-medium">No road damage data available</p>
                <p className="text-sm text-slate-400 mt-1">
                  Road data will appear here when loaded
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
