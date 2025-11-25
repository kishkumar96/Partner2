"use client";

import { useState, useMemo } from "react";
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
import {
  filterEvents,
  filterExposureData,
  filterEconomicDamageData,
} from "@/utils/filterUtils";

interface BottomTabsProps {
  events: Event[];
  hazards: Hazard[];
  sectors: Sector[];
  exposureData: ExposureData[];
  economicDamageData: EconomicDamageData[];
  filters: FilterState;
  districts: District[];
  provinces: Province[];
}

interface AggregatedEventData {
  id: string;
  name: string;
  totalEvents: number;
  totalAffectedPopulation: number;
  totalEconomicDamage: number;
  highRiskAreas: number;
}

type TabType = "exposure" | "economic" | "events";

export default function BottomTabs({
  events,
  hazards,
  sectors,
  exposureData,
  economicDamageData,
  filters,
  districts,
  provinces,
}: BottomTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("events");

  // Apply filters to all data using shared utility functions
  const filteredEvents = useMemo(
    () => filterEvents(events, filters),
    [events, filters]
  );

  const filteredExposureData = useMemo(
    () => filterExposureData(exposureData, filters),
    [exposureData, filters]
  );

  const filteredEconomicDamageData = useMemo(
    () => filterEconomicDamageData(economicDamageData, filters),
    [economicDamageData, filters]
  );

  // Calculate aggregated event data based on aggregation level
  const aggregatedEventData: AggregatedEventData[] = useMemo(() => {
    const { aggregationLevel } = filters;
    
    if (aggregationLevel === "national") {
      return [{
        id: "national",
        name: "National",
        totalEvents: filteredEvents.length,
        totalAffectedPopulation: filteredEvents.reduce((sum, e) => sum + e.affectedPopulation, 0),
        totalEconomicDamage: filteredEvents.reduce((sum, e) => sum + e.economicDamage, 0),
        highRiskAreas: filteredEvents.filter(e => e.severity === "high" || e.severity === "critical").length,
      }];
    } else if (aggregationLevel === "province") {
      return provinces.map((province) => {
        const provinceEvents = filteredEvents.filter((e) => e.provinceId === province.id);
        return {
          id: province.id,
          name: province.name,
          totalEvents: provinceEvents.length,
          totalAffectedPopulation: provinceEvents.reduce((sum, e) => sum + e.affectedPopulation, 0),
          totalEconomicDamage: provinceEvents.reduce((sum, e) => sum + e.economicDamage, 0),
          highRiskAreas: provinceEvents.filter(e => e.severity === "high" || e.severity === "critical").length,
        };
      }).filter(d => d.totalEvents > 0);
    } else {
      return districts.map((district) => {
        const districtEvents = filteredEvents.filter((e) => e.districtId === district.id);
        return {
          id: district.id,
          name: district.name,
          totalEvents: districtEvents.length,
          totalAffectedPopulation: districtEvents.reduce((sum, e) => sum + e.affectedPopulation, 0),
          totalEconomicDamage: districtEvents.reduce((sum, e) => sum + e.economicDamage, 0),
          highRiskAreas: districtEvents.filter(e => e.severity === "high" || e.severity === "critical").length,
        };
      }).filter(d => d.totalEvents > 0);
    }
  }, [filteredEvents, filters, districts, provinces]);

  const getHazardName = (hazardId: string) =>
    hazards.find((h) => h.id === hazardId)?.name || hazardId;

  const getSectorName = (sectorId: string) =>
    sectors.find((s) => s.id === sectorId)?.name || sectorId;

  const getHazardIcon = (hazardId: string) =>
    hazards.find((h) => h.id === hazardId)?.icon || "";

  const getAggregationLabel = () => {
    const { aggregationLevel } = filters;
    if (aggregationLevel === "national") return "National";
    if (aggregationLevel === "province") return "Province";
    return "District";
  };

  const tabs: { id: TabType; label: string }[] = [
    { id: "events", label: `Event History (${filteredEvents.length}/${events.length})` },
    { id: "exposure", label: `Exposure Analysis (${filteredExposureData.length}/${exposureData.length})` },
    { id: "economic", label: `Economic Damage (${filteredEconomicDamageData.length}/${economicDamageData.length})` },
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
                {filteredExposureData.map((exposure) => (
                  <tr
                    key={exposure.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {getHazardIcon(exposure.hazardId)}{" "}
                      {getHazardName(exposure.hazardId)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
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
                {filteredEconomicDamageData.map((damage) => (
                  <tr
                    key={damage.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {getHazardIcon(damage.hazardId)}{" "}
                      {getHazardName(damage.hazardId)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
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
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                      {damage.year}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
