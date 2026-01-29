"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Globe, X, Users, DollarSign, Building2 } from "lucide-react";
import FilterPanel from "@/components/FilterPanel";
import SummaryPanel from "@/components/SummaryPanel";
import BottomTabs from "@/components/BottomTabs";
import ExportButtons from "@/components/ExportButtons";
import CountrySelector from "@/components/CountrySelector";
import { FilterState, Event } from "@/types";
import {
  hazards,
  sectors,
  events,
  exposureData,
  economicDamageData,
  districts,
  provinces,
} from "@/data/mockData";
import { countries } from "@/data/countries";
import { getCountryRiskProfile } from "@/data/riskscapeData";
// import { convertSLRToTimeSeries } from "@/utils/riskscapeParser"; // TODO: Use when chart integration is ready
import { CountryDataset } from "@/types/riskscape";
import { formatCurrency, formatNumber } from "@/utils/formatters";

// Dynamic import for MapView to avoid SSR issues with MapLibre GL
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-sm text-gray-500">Loading map...</p>
      </div>
    </div>
  ),
});

export default function Home() {
  const [filters, setFilters] = useState<FilterState>({
    selectedHazards: [],
    selectedSectors: [],
    selectedEvents: [],
    dateRange: { start: "", end: "" },
    aggregationLevel: "district",
  });

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  
  // RiskScape data integration - country selection
  const [selectedCountry, setSelectedCountry] = useState<CountryDataset>(countries[0]);
  
  // Get RiskScape data for selected country
  const riskProfile = useMemo(
    () => getCountryRiskProfile(selectedCountry.id),
    [selectedCountry.id]
  );
  
  // TODO: Integrate SLR time series data for future chart components.
  // When SummaryPanel or BottomTabs are updated to display SLR projection charts,
  // uncomment and pass this data to those components.
  // const slrTimeSeries = useMemo(() => {
  //   if (!riskProfile || riskProfile.slrProjections.length === 0) return [];
  //   return convertSLRToTimeSeries(riskProfile.slrProjections, 'totalAAL');
  // }, [riskProfile]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center">
                <Globe className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  Climate Risk Dashboard
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Pacific Islands Risk Assessment - RiskScape Nexus Data
                </p>
              </div>
            </div>
            
            {/* Country Selector */}
            <CountrySelector
              countries={countries}
              selectedCountry={selectedCountry}
              onCountryChange={setSelectedCountry}
            />
          </div>
          <div className="flex items-center gap-4">
            <ExportButtons
              events={events}
              exposureData={exposureData}
              economicDamageData={economicDamageData}
              hazards={hazards}
              sectors={sectors}
            />
          </div>
        </div>
        
        {/* Country Info Bar with RiskScape Statistics */}
        {riskProfile ? (
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 rounded-lg">
              <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">
                  Exposed Population
                </p>
                <p className="text-lg font-bold text-purple-900 dark:text-purple-100">
                  {formatNumber(riskProfile.stats.totalExposedPopulation)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/30 rounded-lg">
              <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                  Economic Loss (AAL)
                </p>
                <p className="text-lg font-bold text-amber-900 dark:text-amber-100">
                  {formatCurrency(riskProfile.stats.totalEconomicLoss)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 rounded-lg">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                  Buildings at Risk
                </p>
                <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                  {formatNumber(riskProfile.stats.buildingsAtRisk)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Climate risk data is not available for the selected country. Please select a different country or check back later.
            </p>
          </div>
        )}
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Filter Panel */}
        <FilterPanel
          hazards={hazards}
          sectors={sectors}
          events={events}
          filters={filters}
          onFilterChange={setFilters}
        />

        {/* Center Map + Bottom Tabs */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Map Area */}
          <div className="flex-1 relative">
            <MapView
              events={events}
              hazards={hazards}
              filters={filters}
              onEventSelect={setSelectedEvent}
              center={[selectedCountry.coordinates.lng, selectedCountry.coordinates.lat]}
              zoom={selectedCountry.coordinates.zoom}
            />

            {/* Selected Event Info Card */}
            {selectedEvent && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4 max-w-sm z-10">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {selectedEvent.name}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {selectedEvent.date}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Close event details"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Tabs */}
          <BottomTabs
            events={events}
            hazards={hazards}
            sectors={sectors}
            exposureData={exposureData}
            economicDamageData={economicDamageData}
            filters={filters}
            districts={districts}
            provinces={provinces}
          />
        </div>

        {/* Right Summary Panel */}
        <SummaryPanel
          events={events}
          hazards={hazards}
          filters={filters}
          districts={districts}
          provinces={provinces}
        />
      </div>
    </div>
  );
}
