"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { X, Map as MapIcon } from "lucide-react";
import FilterPanel from "@/components/FilterPanel";
import SummaryPanel from "@/components/SummaryPanel";
import BottomTabs from "@/components/BottomTabs";
import ExportButtons from "@/components/ExportButtons";
import CountrySelector from "@/components/CountrySelector";
import { MapStyleToggle } from "@/components/MapStyleToggle";
import { BasemapSwitcher } from "@/components/BasemapSwitcher";
import { WindSpeedLegend } from "@/components/WindSpeedLegend";
import { FilterState, Event } from "@/types";
import { CountryCode, COUNTRIES } from "@/types/thredds";
import { 
  vanuatuHazards, 
  vanuatuSectors, 
  vanuatuProvinces, 
  vanuatuDistricts 
} from "@/data/vanuatuHazards";
import { loadAllRealData } from "@/utils/realDataLoader";

// Vanuatu-specific data
const allHazards = vanuatuHazards;
const allSectors = vanuatuSectors;
const provinces = vanuatuProvinces;
const districts = vanuatuDistricts;

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
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [useRealData, setUseRealData] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState<CountryCode | null>("VU");
  const [showCountrySelector, setShowCountrySelector] = useState(false);
  const [mapStyle, setMapStyle] = useState<"loss" | "wind">("loss");
  const [basemapStyle, setBasemapStyle] = useState("https://basemaps.cartocdn.com/gl/positron-gl-style/style.json");
  const [showFilters, setShowFilters] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const summaryPanelRef = useRef<HTMLDivElement>(null);
  
  // Real data state
  const [events, setEvents] = useState<Event[]>([]);
  const [exposureData, setExposureData] = useState<any[]>([]);
  const [economicDamageData, setEconomicDamageData] = useState<any[]>([]);
  const [assetExposureData, setAssetExposureData] = useState<any>(null);
  const [impactByAssetType, setImpactByAssetType] = useState<any[]>([]);
  const [impactBySector, setImpactBySector] = useState<any[]>([]);
  const [nationalSummary, setNationalSummary] = useState<any[]>([]);
  const [damagedBuildings, setDamagedBuildings] = useState<any>(null);
  const [damagedRoads, setDamagedRoads] = useState<any>(null);
  const [regionalSummary, setRegionalSummary] = useState<any[]>([]);
  const [regionalSummaryBySector, setRegionalSummaryBySector] = useState<any[]>([]);
  const [cycloneForecast, setCycloneForecast] = useState<any>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  // Filter events by selected country and region
  const countryEvents = useMemo(() => {
    let filtered = events;
    
    // Filter by country
    if (selectedCountry) {
      filtered = filtered.filter(e => e.countryCode === selectedCountry);
    }
    
    // Filter by region/district if one is selected
    if (selectedRegion) {
      filtered = filtered.filter(e => e.districtId === selectedRegion);
    }
    
    return filtered;
  }, [events, selectedCountry, selectedRegion]);

  // Filter hazards and sectors based on what data we actually have
  const hazards = useMemo(() => {
    if (!useRealData) return allHazards;
    // For real data, we only have tropical cyclone data
    return allHazards.filter(h => h.id === 'tropical-cyclone');
  }, [useRealData]);

  const sectors = useMemo(() => {
    if (!useRealData) return allSectors;
    // For real data, show all 4 sectors from PDIE output
    return allSectors;
  }, [useRealData]);

  // Calculate total economic damage for export button state
  const totalEconomicDamage = useMemo(() => {
    return countryEvents.reduce((sum, e) => sum + (e.economicDamage || 0), 0);
  }, [countryEvents]);

  // Load real data on mount
  useEffect(() => {
    async function loadData() {
      setIsLoadingData(true);
      try {
        const realData = await loadAllRealData();
        
        if (realData.events && realData.events.length > 0) {
          setEvents(realData.events);
          console.log(`✅ Loaded ${realData.events.length} events from real data`);
        }
        
        if (realData.exposureData && realData.exposureData.length > 0) {
          setExposureData(realData.exposureData);
        }
        
        if (realData.economicDamageData && realData.economicDamageData.length > 0) {
          setEconomicDamageData(realData.economicDamageData);
        }
        
        if (realData.assetExposureData) {
          setAssetExposureData(realData.assetExposureData);
        }
        
        if (realData.impactByAsset) {
          setImpactByAssetType(realData.impactByAsset);
        }
        
        if (realData.impactBySector) {
          setImpactBySector(realData.impactBySector);
        }
        
        if (realData.nationalSummary) {
          setNationalSummary(realData.nationalSummary);
        }
        
        if (realData.damagedBuildings) {
          setDamagedBuildings(realData.damagedBuildings);
          console.log('✅ Loaded damaged buildings data');
        }
        
        if (realData.damagedRoads) {
          setDamagedRoads(realData.damagedRoads);
          console.log('✅ Loaded damaged roads data');
        }
        
        if (realData.regionalSummary) {
          setRegionalSummary(realData.regionalSummary);
          console.log(`✅ Loaded ${realData.regionalSummary.length} regional summaries`);
        }
        
        if (realData.regionalSummaryBySector) {
          setRegionalSummaryBySector(realData.regionalSummaryBySector);
          console.log(`✅ Loaded ${realData.regionalSummaryBySector.length} regional sector records`);
        }
        
        if (realData.cycloneForecast) {
          setCycloneForecast(realData.cycloneForecast);
          console.log(`✅ Loaded ${realData.cycloneForecast.length} cyclone forecast timesteps`);
        }
      } catch (error) {
        console.error('Error loading real data:', error);
      } finally {
        setIsLoadingData(false);
      }
    }
    
    loadData();
  }, []);

  useEffect(() => {
    const activePanel = showFilters ? filterPanelRef.current : showSummary ? summaryPanelRef.current : null;
    if (!activePanel) return;

    const focusableSelectors = [
      "a[href]",
      "button:not([disabled])",
      "textarea:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ];

    const getFocusable = () =>
      Array.from(activePanel.querySelectorAll<HTMLElement>(focusableSelectors.join(",")))
        .filter((el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"));

    const focusables = getFocusable();
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (first) {
      first.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showFilters) setShowFilters(false);
        if (showSummary) setShowSummary(false);
        return;
      }

      if (event.key !== "Tab" || focusables.length === 0) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showFilters, showSummary]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 md:hidden">
              <button
                onClick={() => {
                  setShowFilters(true);
                  setShowSummary(false);
                }}
                className="px-3 py-2 rounded-lg bg-slate-100 text-slate-800 text-xs font-semibold uppercase tracking-wide"
                aria-label="Open filters panel"
              >
                Filters
              </button>
              <button
                onClick={() => {
                  setShowSummary(true);
                  setShowFilters(false);
                }}
                className="px-3 py-2 rounded-lg bg-slate-100 text-slate-800 text-xs font-semibold uppercase tracking-wide"
                aria-label="Open summary panel"
              >
                Summary
              </button>
            </div>
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
                  {isLoadingData ? "Loading real data..." : 
                    useRealData && selectedCountry
                      ? `TC Lola Impact • ${countryEvents.length} ${countryEvents.length === 1 ? 'District' : 'Districts'}`
                      : selectedCountry 
                        ? `${countryEvents.length} of ${events.length} events`
                        : `${events.length} events loaded`
                  }
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowCountrySelector(!showCountrySelector)}
              className="flex items-center gap-2 px-3 py-2 glass-panel hover:bg-surface-strong text-white rounded-lg transition-colors shadow-sm"
            >
              {selectedCountry ? (
                <>
                  <span className="text-xl">
                    {selectedCountry === 'VU' ? '🇻🇺' : selectedCountry === 'WS' ? '🇼🇸' : selectedCountry === 'TO' ? '🇹🇴' : '🇨🇰'}
                  </span>
                  <div className="text-left">
                    <div className="font-medium text-sm leading-tight">{COUNTRIES[selectedCountry].name}</div>
                    <div className="text-xs text-slate-400 leading-tight">{COUNTRIES[selectedCountry].fullName}</div>
                  </div>
                </>
              ) : (
                <>
                  <MapIcon className="w-4 h-4" />
                  <span className="text-sm font-medium">Select Region</span>
                </>
              )}
            </button>
            <ExportButtons
              events={countryEvents}
              exposureData={exposureData}
              economicDamageData={economicDamageData}
              hazards={hazards}
              sectors={sectors}
              disabled={totalEconomicDamage === 0}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Filter Panel */}
        {showFilters && (
          <button
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setShowFilters(false)}
            aria-label="Close filters panel"
          />
        )}
        <div
          ref={filterPanelRef}
          className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] transform transition-transform duration-300 md:static md:translate-x-0 md:w-auto ${
            showFilters ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="md:hidden absolute top-3 right-3 z-50">
            <button
              onClick={() => setShowFilters(false)}
              className="w-8 h-8 rounded-full bg-white/90 text-slate-700 shadow flex items-center justify-center"
              aria-label="Close filters panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <FilterPanel
            hazards={hazards}
            sectors={sectors}
            events={events}
            filters={filters}
            onFilterChange={setFilters}
          />
        </div>

        {/* Center Map + Bottom Tabs */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Map Area */}
          <div className="flex-1 relative">
            {/* Map Style Toggle - positioned at top center */}
            {useRealData && (
              <MapStyleToggle
                currentStyle={mapStyle}
                onStyleChange={setMapStyle}
              />
            )}
            
            {/* Basemap Switcher */}
            <BasemapSwitcher
              currentBasemap={basemapStyle}
              onBasemapChange={setBasemapStyle}
            />
            
            {/* Wind Speed Legend */}
            <WindSpeedLegend mapStyle={mapStyle} />
            
            <MapView
              events={countryEvents}
              hazards={hazards}
              filters={filters}
              onEventSelect={setSelectedEvent}
              selectedRegion={selectedRegion}
              onRegionSelect={setSelectedRegion}
              useRealData={useRealData}
              selectedCountry={selectedCountry}
              mapStyle={mapStyle}
              basemapStyle={basemapStyle}
              damagedBuildings={damagedBuildings}
              damagedRoads={damagedRoads}
              cycloneForecast={cycloneForecast}
            />

            {/* Loading Overlay */}
            {isLoadingData && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="glass-panel p-8 text-center max-w-md">
                  <div className="animate-spin h-12 w-12 border-4 border-neon-cyan border-t-transparent rounded-full mx-auto mb-4"/>
                  <h3 className="text-lg font-semibold text-slate-100 mb-2">
                    Loading {selectedCountry ? COUNTRIES[selectedCountry].name : 'Data'}...
                  </h3>
                  <p className="text-sm text-slate-400">
                    Fetching hazard layers and impact data from THREDDS server
                  </p>
                </div>
              </div>
            )}

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
            events={countryEvents}
            hazards={hazards}
            sectors={sectors}
            exposureData={exposureData}
            economicDamageData={economicDamageData}
            filters={filters}
            districts={districts}
            provinces={provinces}
            impactByAssetType={impactByAssetType}
            impactBySector={impactBySector}
            regionalSummary={regionalSummary}
          />
        </div>

        {/* Right Summary Panel */}
        {showSummary && (
          <button
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setShowSummary(false)}
            aria-label="Close summary panel"
          />
        )}
        <div
          ref={summaryPanelRef}
          className={`fixed inset-y-0 right-0 z-40 w-80 max-w-[85vw] transform transition-transform duration-300 md:static md:translate-x-0 md:w-auto ${
            showSummary ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="md:hidden absolute top-3 left-3 z-50">
            <button
              onClick={() => setShowSummary(false)}
              className="w-8 h-8 rounded-full bg-white/90 text-slate-700 shadow flex items-center justify-center"
              aria-label="Close summary panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <SummaryPanel
            events={countryEvents}
            hazards={hazards}
            sectors={sectors}
            filters={filters}
            districts={districts}
            provinces={provinces}
            selectedCountry={selectedCountry}
            selectedRegion={selectedRegion}
            onRegionClear={() => setSelectedRegion(null)}
            assetExposureData={assetExposureData}
            nationalSummary={nationalSummary}
            regionalSummary={regionalSummary}
            regionalSummaryBySector={regionalSummaryBySector}
          />
        </div>
      </div>
    </div>
  );
}
