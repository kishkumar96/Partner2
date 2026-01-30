"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { X, Map as MapIcon } from "lucide-react";
import FilterPanel from "@/components/FilterPanel";
import SummaryPanel from "@/components/SummaryPanel";
import BottomTabs from "@/components/BottomTabs";
import ExportButtons from "@/components/ExportButtons";
import CountrySelector from "@/components/CountrySelector";
import { FilterState, Event } from "@/types";
import { CountryCode } from "@/types/thredds";
import { 
  vanuatuHazards, 
  vanuatuSectors, 
  vanuatuProvinces, 
  vanuatuDistricts 
} from "@/data/vanuatuHazards";

// Vanuatu-specific data
const hazards = vanuatuHazards;
const sectors = vanuatuSectors;
const provinces = vanuatuProvinces;
const districts = vanuatuDistricts;

// Event data - will be populated from THREDDS or mock data
const events = [];
const exposureData = [];
const economicDamageData = [];

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
  const [useRealData, setUseRealData] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState<CountryCode | null>("VU");
  const [showCountrySelector, setShowCountrySelector] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-white">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path>
                  <path d="M2 12h20"></path>
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  Climate Risk Dashboard
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  WebGIS Hazard Assessment Platform
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowCountrySelector(!showCountrySelector)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
            >
              <MapIcon className="w-4 h-4" />
              {useRealData && selectedCountry ? selectedCountry : "Select Region"}
            </button>
            <ExportButtons
              events={events}
              exposureData={exposureData}
              economicDamageData={economicDamageData}
              hazards={hazards}
              sectors={sectors}
            />
          </div>
        </div>
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
              useRealData={useRealData}
              selectedCountry={selectedCountry}
            />

            {/* Country Selector Overlay */}
            {showCountrySelector && (
              <div className="absolute top-4 right-4 z-20">
                <div className="relative">
                  <button
                    onClick={() => setShowCountrySelector(false)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg z-30"
                    aria-label="Close country selector"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <CountrySelector
                    selectedCountry={selectedCountry}
                    onCountryChange={setSelectedCountry}
                    useRealData={useRealData}
                    onDataSourceToggle={setUseRealData}
                  />
                </div>
              </div>
            )}

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
          sectors={sectors}
          filters={filters}
          districts={districts}
          provinces={provinces}
        />
      </div>
    </div>
  );
}
