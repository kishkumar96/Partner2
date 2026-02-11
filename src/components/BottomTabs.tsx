"use client";

import { useMemo, useState } from "react";
import EnhancedRegionalTable from "./EnhancedRegionalTable";
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

interface BottomTabsProps {
  events: Event[];
  hazards: Hazard[];
  sectors: Sector[];
  exposureData: ExposureData[];
  economicDamageData: EconomicDamageData[];
  impactByAssetType?: any[];
  impactBySector?: any[];
  regionalSummary?: any[];
  filters: FilterState;
  districts: District[];
  provinces: Province[];
}

type TabType = "exposure" | "economic" | "events" | "details" | "damage";

export default function BottomTabs({
  events,
  hazards,
  sectors,
  exposureData,
  economicDamageData,
  impactByAssetType = [],
  impactBySector = [],
  regionalSummary = [],
  filters,
  districts,
  provinces,
}: BottomTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("events");

  const {
    filteredEvents,
    filteredExposureData,
    filteredEconomicDamageData,
    aggregatedEventData,
  } = useMemo(
    () =>
      computeFilteredData({
        events,
        exposureData,
        economicDamageData,
        filters,
        districts,
        provinces,
      }),
    [events, exposureData, economicDamageData, filters, districts, provinces]
  );

  const getHazardName = (hazardId: string) =>
    hazards.find((h) => h.id === hazardId)?.name || hazardId;

  const getSectorName = (sectorId: string) =>
    sectors.find((s) => s.id === sectorId)?.name || sectorId;

  const getHazardColor = (hazardId: string) =>
    hazards.find((h) => h.id === hazardId)?.color || "#64748b";

  const getAggregationLabel = () => {
    const { aggregationLevel } = filters;
    if (aggregationLevel === "national") return "National";
    if (aggregationLevel === "province") return "Province";
    return "District";
  };

  const tabs: { id: TabType; label: string }[] = [
    { 
      id: "events", 
      label: filteredEvents.length === events.length 
        ? `Impact (${filteredEvents.length})`
        : `Impact (${filteredEvents.length}/${events.length})`
    },
    { 
      id: "exposure", 
      label: filteredExposureData.length === exposureData.length
        ? `Exposure (${filteredExposureData.length})`
        : `Exposure (${filteredExposureData.length}/${exposureData.length})`
    },
    { 
      id: "economic", 
      label: filteredEconomicDamageData.length === economicDamageData.length
        ? `Economic (${filteredEconomicDamageData.length})`
        : `Economic (${filteredEconomicDamageData.length}/${economicDamageData.length})`
    },
    { id: "details", label: "Details" },
    { id: "damage", label: `Damage (${regionalSummary.length})` },
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
            <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700/60">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    {getAggregationLabel()}
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Total Events
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    High Risk
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Affected Pop.
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Economic Damage
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {aggregatedEventData.map((data) => (
                  <tr
                    key={data.id}
                    className="hover:bg-white/5"
                  >
                    <td className="px-4 py-3 text-sm text-slate-100">
                      {data.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right">
                      {data.totalEvents}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right">
                      {data.highRiskAreas}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right">
                      {formatNumber(data.totalAffectedPopulation)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right font-medium">
                      {formatCurrency(data.totalEconomicDamage)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {activeTab === "exposure" && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700/60">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Hazard
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Sector
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Population
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Assets at Risk
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Infrastructure Units
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {filteredExposureData.map((exposure, index) => (
                  <tr
                    key={exposure.id || `exposure-${index}`}
                    className="hover:bg-white/5"
                  >
                    <td className="px-4 py-3 text-sm text-slate-100">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                        style={{ backgroundColor: getHazardColor(exposure.hazardId) }}
                        aria-hidden="true"
                      />
                      {getHazardName(exposure.hazardId)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {getSectorName(exposure.sectorId)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right">
                      {formatNumber(exposure.population)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right font-medium">
                      {formatCurrency(exposure.assets)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-100 text-right">
                      {formatNumber(exposure.infrastructure)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "economic" && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700/60">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Hazard
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Sector
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
                  <th className="px-4 py-2 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Year
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {filteredEconomicDamageData.map((damage, index) => (
                  <tr
                    key={damage.id || `damage-${index}`}
                    className="hover:bg-white/5"
                  >
                    <td className="px-4 py-3 text-sm text-slate-100">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                        style={{ backgroundColor: getHazardColor(damage.hazardId) }}
                        aria-hidden="true"
                      />
                      {getHazardName(damage.hazardId)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {getSectorName(damage.sectorId)}
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
                    <td className="px-4 py-3 text-sm text-slate-300 text-center">
                      {damage.year}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "details" && (
          <div className="space-y-4">
            {impactByAssetType && impactByAssetType.length > 0 && (
              <div className="overflow-x-auto">
                <div className="text-sm font-semibold text-slate-200 mb-2">
                  Impact by Asset Type
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
                    {[...impactByAssetType]
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

            {impactBySector && impactBySector.length > 0 && (
              <div className="overflow-x-auto">
                <div className="text-sm font-semibold text-slate-200 mb-2">
                  Impact by Sector
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
                    {[...impactBySector]
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
            {/* Enhanced Regional Table with Derived Metrics */}
            {regionalSummary && regionalSummary.length > 0 && (
              <EnhancedRegionalTable
                data={regionalSummary
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
                nationalTotal={regionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Total_Loss) || 0), 0)}
                showDerivedMetrics={true}
              />
            )}

            {/* Regional Summary Table with Normalized Metrics */}
            {regionalSummary && regionalSummary.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <div className="text-sm font-semibold text-slate-200 mb-3 flex items-center justify-between">
                    <span>Regional Damage Assessment</span>
                    <span className="text-xs font-normal text-slate-400">
                      {regionalSummary.length} regions analyzed
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
                      {regionalSummary
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
      </div>
    </div>
  );
}
