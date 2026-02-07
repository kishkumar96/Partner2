"use client";

import { useMemo, useState } from "react";
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
        ? `District Impact (${filteredEvents.length})`
        : `District Impact (${filteredEvents.length}/${events.length})`
    },
    { 
      id: "exposure", 
      label: filteredExposureData.length === exposureData.length
        ? `Exposure Analysis (${filteredExposureData.length})`
        : `Exposure Analysis (${filteredExposureData.length}/${exposureData.length})`
    },
    { 
      id: "economic", 
      label: filteredEconomicDamageData.length === economicDamageData.length
        ? `Economic Damage (${filteredEconomicDamageData.length})`
        : `Economic Damage (${filteredEconomicDamageData.length}/${economicDamageData.length})`
    },
    { id: "details", label: "Impact Details" },
    { id: "damage", label: `Damage Assessment (${regionalSummary.length})` },
  ];

  return (
    <div className="h-64 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Tab Headers */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === "events" && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {getAggregationLabel()}
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Events
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    High Risk
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Affected Pop.
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Economic Damage
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {aggregatedEventData.map((data) => (
                  <tr
                    key={data.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {data.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right">
                      {data.totalEvents}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right">
                      {data.highRiskAreas}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right">
                      {formatNumber(data.totalAffectedPopulation)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right font-medium">
                      {formatCurrency(data.totalEconomicDamage)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "exposure" && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Hazard
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Sector
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Population
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Assets at Risk
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Infrastructure Units
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredExposureData.map((exposure, index) => (
                  <tr
                    key={exposure.id || `exposure-${index}`}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                        style={{ backgroundColor: getHazardColor(exposure.hazardId) }}
                        aria-hidden="true"
                      />
                      {getHazardName(exposure.hazardId)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {getSectorName(exposure.sectorId)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right">
                      {formatNumber(exposure.population)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right font-medium">
                      {formatCurrency(exposure.assets)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right">
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
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Hazard
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Sector
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Direct Loss
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Indirect Loss
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Loss
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Year
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredEconomicDamageData.map((damage, index) => (
                  <tr
                    key={damage.id || `damage-${index}`}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                        style={{ backgroundColor: getHazardColor(damage.hazardId) }}
                        aria-hidden="true"
                      />
                      {getHazardName(damage.hazardId)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {getSectorName(damage.sectorId)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right">
                      {formatCurrency(damage.directLoss)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right">
                      {formatCurrency(damage.indirectLoss)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right font-bold">
                      {formatCurrency(damage.totalLoss)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 text-center">
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
                <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                  Impact by Asset Type
                </div>
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Asset
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Loss
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {impactByAssetType
                      .sort(
                        (a, b) => (Number(b.Total_Loss) || 0) - (Number(a.Total_Loss) || 0)
                      )
                      .map((row, idx) => (
                        <tr
                          key={row.Asset || `asset-${idx}`}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            {row.Asset || "Unknown"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right font-semibold">
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
                <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                  Impact by Sector
                </div>
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Sector
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Loss
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {impactBySector
                      .sort(
                        (a, b) => (Number(b.Total_Loss) || 0) - (Number(a.Total_Loss) || 0)
                      )
                      .map((row, idx) => (
                        <tr
                          key={row.Sector || `sector-${idx}`}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            {row.Sector || "Unknown"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right font-semibold">
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
            {/* Regional Summary Table with Normalized Metrics */}
            {regionalSummary && regionalSummary.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center justify-between">
                    <span>Regional Damage Assessment</span>
                    <span className="text-xs font-normal text-gray-500">
                      {regionalSummary.length} regions analyzed
                    </span>
                  </div>
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider sticky left-0 bg-gray-50 dark:bg-gray-800">
                          Region
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Population
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Buildings
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Damaged
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Road km
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Total Loss
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider bg-blue-50 dark:bg-blue-900/20">
                          Loss/Capita
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider bg-blue-50 dark:bg-blue-900/20">
                          Damage %
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
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
                              className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                            >
                              <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-900">
                                {region.Region || 'Unknown'}
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 text-right tabular-nums">
                                {formatNumber(totalPop)}
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 text-right tabular-nums">
                                {formatNumber(totalBuildings)}
                              </td>
                              <td className="px-3 py-2 text-sm text-right tabular-nums">
                                <span className="font-semibold text-red-600 dark:text-red-400">
                                  {formatNumber(damagedBuildings)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 text-right tabular-nums">
                                {Number(region.Damaged_Road_km || 0).toFixed(1)}
                              </td>
                              <td className="px-3 py-2 text-sm text-right tabular-nums">
                                <span className="font-semibold text-red-600 dark:text-red-400">
                                  {formatCurrency(totalLoss)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 text-right tabular-nums bg-blue-50/50 dark:bg-blue-900/10">
                                ${lossPerCapita.toFixed(0)}
                              </td>
                              <td className="px-3 py-2 text-sm text-right tabular-nums bg-blue-50/50 dark:bg-blue-900/10">
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

                {/* Summary Statistics Cards */}
                <div className="grid grid-cols-4 gap-4 mt-4">
                  <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                    <div className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide mb-2">
                      Most Impacted Region
                    </div>
                    <div className="text-lg font-bold text-red-900 dark:text-red-100">
                      {regionalSummary
                        .filter((r: any) => r.Region && r.Region.trim() !== '')
                        .sort((a: any, b: any) => (Number(b.Total_Loss) || 0) - (Number(a.Total_Loss) || 0))[0]?.Region || 'N/A'}
                    </div>
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {formatCurrency(
                        regionalSummary
                          .filter((r: any) => r.Region && r.Region.trim() !== '')
                          .sort((a: any, b: any) => (Number(b.Total_Loss) || 0) - (Number(a.Total_Loss) || 0))[0]?.Total_Loss || 0
                      )} loss
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide mb-2">
                      Avg Loss Per Capita
                    </div>
                    <div className="text-lg font-bold text-orange-900 dark:text-orange-100">
                      ${(
                        regionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Total_Loss) || 0), 0) /
                        regionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Total_Population) || 1), 0)
                      ).toFixed(0)}
                    </div>
                    <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                      Per person
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                    <div className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 uppercase tracking-wide mb-2">
                      Avg Damage Rate
                    </div>
                    <div className="text-lg font-bold text-yellow-900 dark:text-yellow-100">
                      {(
                        (regionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Damaged_Buildings) || 0), 0) /
                        regionalSummary.reduce((sum: number, r: any) => sum + (Number(r.Total_Buildings) || 1), 0)) *
                        100
                      ).toFixed(1)}%
                    </div>
                    <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                      Of all buildings
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                    <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-2">
                      Total Roads Damaged
                    </div>
                    <div className="text-lg font-bold text-blue-900 dark:text-blue-100">
                      {regionalSummary
                        .reduce((sum: number, r: any) => sum + (Number(r.Damaged_Road_km) || 0), 0)
                        .toFixed(1)} km
                    </div>
                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      Across all regions
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No regional summary data available
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
