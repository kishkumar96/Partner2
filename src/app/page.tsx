"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Globe, X } from "lucide-react";
import FilterPanel from "@/components/FilterPanel";
import SummaryPanel from "@/components/SummaryPanel";
import BottomTabs from "@/components/BottomTabs";
import ExportButtons from "@/components/ExportButtons";
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
                  WebGIS Hazard Assessment Platform
                </p>
              </div>
            </div>
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
