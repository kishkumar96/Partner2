"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { KeyboardEvent, Ref } from "react";
import { FilterState, Hazard, Sector, Event, AggregationLevel, District } from "@/types";
import { AlertTriangle, Calendar, ChevronDown, Database, Globe2, Keyboard, Target, Wind, Play, Pause } from "lucide-react";
import SearchableEventSelector from "./SearchableEventSelector";
import MapAccessibleFeatures, { type DistrictFeature } from "./MapAccessibleFeatures";
import Toast from "./Toast";

interface FilterPanelProps {
  hazards: Hazard[];
  sectors: Sector[];
  events: Event[];
  districts: District[];
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  showCycloneControls?: boolean;
  onToggleCycloneControls?: (show: boolean) => void;
  isCyclonePlaying?: boolean;
  onToggleCyclonePlaying?: (isPlaying: boolean) => void;
  hasCycloneData?: boolean;
  cycloneControlsHostRef?: Ref<HTMLDivElement>;
  accessibleDistricts?: DistrictFeature[];
  onDistrictSelect?: (districtId: string) => void;
}

const noopDistrictSelect = () => {};

export default function FilterPanel({
  hazards,
  sectors,
  events,
  districts,
  filters,
  onFilterChange,
  showCycloneControls = true,
  onToggleCycloneControls,
  isCyclonePlaying = false,
  onToggleCyclonePlaying,
  hasCycloneData = false,
  cycloneControlsHostRef,
  accessibleDistricts = [],
  onDistrictSelect = noopDistrictSelect,
}: FilterPanelProps) {
  const [showClearToast, setShowClearToast] = useState(false);
  const [previousFilters, setPreviousFilters] = useState<FilterState | null>(null);

  const [activeTab, setActiveTab] = useState<"filters" | "cyclone">("filters");
  const [isDistrictListOpen, setIsDistrictListOpen] = useState(false);
  const filtersTabRef = useRef<HTMLButtonElement>(null);
  const cycloneTabRef = useRef<HTMLButtonElement>(null);
  const [dockAnnouncement, setDockAnnouncement] = useState("");

  const accordionIds = {
    quickFilters: {
      button: "filter-panel-quick-filters-button",
      panel: "filter-panel-quick-filters-panel",
    },
    temporal: {
      button: "filter-panel-temporal-button",
      panel: "filter-panel-temporal-panel",
    },
    aggregation: {
      button: "filter-panel-aggregation-button",
      panel: "filter-panel-aggregation-panel",
    },
    hazards: {
      button: "filter-panel-hazards-button",
      panel: "filter-panel-hazards-panel",
    },
    sectors: {
      button: "filter-panel-sectors-button",
      panel: "filter-panel-sectors-panel",
    },
  };
  
  // Accordion state for each section
  const [expandedSections, setExpandedSections] = useState({
    quickFilters: true,
    temporal: true,
    aggregation: false,
    hazards: false,
    sectors: false,
  });

  // Switch to filters tab if cyclone data is not available
  useEffect(() => {
    if (!hasCycloneData && activeTab === "cyclone") {
      setActiveTab("filters");
    }
  }, [hasCycloneData, activeTab]);

  // Announce visibility changes for screen readers
  useEffect(() => {
    if (hasCycloneData && activeTab === "cyclone") {
      const message = showCycloneControls 
        ? "Timeline controls visible"
        : "Timeline controls hidden";
      setDockAnnouncement(message);
      
      // Clear announcement after 2 seconds
      const timer = setTimeout(() => setDockAnnouncement(""), 2000);
      return () => clearTimeout(timer);
    }
  }, [showCycloneControls, hasCycloneData, activeTab]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const toggleHazard = (hazardId: string) => {
    const newHazards = filters.selectedHazards.includes(hazardId)
      ? filters.selectedHazards.filter((h) => h !== hazardId)
      : [...filters.selectedHazards, hazardId];
    onFilterChange({ ...filters, selectedHazards: newHazards });
  };

  const toggleSector = (sectorId: string) => {
    const newSectors = filters.selectedSectors.includes(sectorId)
      ? filters.selectedSectors.filter((s) => s !== sectorId)
      : [...filters.selectedSectors, sectorId];
    onFilterChange({ ...filters, selectedSectors: newSectors });
  };

  const toggleEvent = (eventId: string) => {
    const newEvents = filters.selectedEvents.includes(eventId)
      ? filters.selectedEvents.filter((e) => e !== eventId)
      : [...filters.selectedEvents, eventId];
    onFilterChange({ ...filters, selectedEvents: newEvents });
  };

  const selectAllEvents = () => {
    onFilterChange({ ...filters, selectedEvents: events.map(e => e.id) });
  };
  
  const selectFilteredEvents = (filteredEventIds: string[]) => {
    onFilterChange({ ...filters, selectedEvents: filteredEventIds });
  };

  const clearAllEvents = () => {
    onFilterChange({ ...filters, selectedEvents: [] });
  };

  const setAggregationLevel = (level: AggregationLevel) => {
    onFilterChange({ ...filters, aggregationLevel: level });
  };

  const clearAllFilters = () => {
    // Save current filters for undo
    setPreviousFilters({ ...filters });
    
    // Clear filters
    onFilterChange({
      selectedHazards: [],
      selectedSectors: [],
      selectedEvents: [],
      dateRange: { start: "", end: "" },
      aggregationLevel: "district",
    });
    
    // Show confirmation toast
    setShowClearToast(true);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Only handle tab navigation if cyclone data is available
    if (!hasCycloneData) return;
    
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;

    event.preventDefault();
    const order: Array<"filters" | "cyclone"> = ["filters", "cyclone"];
    const currentIndex = order.indexOf(activeTab);
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % order.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + order.length) % order.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = order.length - 1;
    }

    const nextTab = order[nextIndex];
    setActiveTab(nextTab);
    if (nextTab === "filters") {
      filtersTabRef.current?.focus();
    } else {
      cycloneTabRef.current?.focus();
    }
  };

  const undoClearFilters = () => {
    if (previousFilters) {
      onFilterChange(previousFilters);
      setPreviousFilters(null);
      setShowClearToast(false);
    }
  };

  const aggregationOptions: { value: AggregationLevel; label: string }[] = [
    { value: "district", label: "Districts" },
    { value: "province", label: "Province" },
    { value: "national", label: "National" },
  ];

  const filterPresets = [
    { id: "all", label: "All Data", icon: Globe2 },
    { id: "high-risk", label: "High Risk", icon: AlertTriangle },
    { id: "recent", label: "Recent (2024)", icon: Calendar },
  ];

  const applyPreset = (presetId: string) => {
    switch (presetId) {
      case "all":
        clearAllFilters();
        break;
      case "high-risk":
        onFilterChange({
          ...filters,
          selectedEvents: events.filter(e => e.severity === "high" || e.severity === "critical").map(e => e.id),
        });
        break;
      case "recent":
        onFilterChange({
          ...filters,
          dateRange: { start: "2024-01-01", end: "2024-12-31" },
        });
        break;
      default:
        console.warn(`applyPreset: unknown presetId "${presetId}"`);
        break;
    }
  };

  // Track which hazards and sectors have data available in actual events
  const activeHazardIds = useMemo(
    () => new Set(events.map((event) => event.hazardId)),
    [events]
  );
  const activeSectorIds = useMemo(
    () => new Set(events.map((event) => event.sectorId)),
    [events]
  );
  
  // Show all hazards and sectors, but mark unavailable ones
  const hazardsWithAvailability = useMemo(
    () => hazards.map((hazard) => ({
      ...hazard,
      isAvailable: activeHazardIds.has(hazard.id),
    })),
    [hazards, activeHazardIds]
  );
  const sectorsWithAvailability = useMemo(
    () => sectors.map((sector) => ({
      ...sector,
      isAvailable: activeSectorIds.has(sector.id),
    })),
    [sectors, activeSectorIds]
  );

  return (
    <div className="w-72 glass-panel border-r border-white/10 flex flex-col flex-shrink-0 h-full min-h-0 overflow-hidden isolate">
      <div className="flex-1 overflow-y-auto overscroll-contain overflow-x-hidden">
      <div className="p-4 border-b border-white/10 bg-gradient-to-br from-slate-800/40 to-slate-900/40">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-white tracking-tight">
            Filters
          </h2>
          <button
            onClick={clearAllFilters}
            className="text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 px-2 py-1 rounded transition-all font-semibold"
            aria-label="Clear all filters"
          >
            Clear All
          </button>
        </div>
        {/* Live Update Hint */}
        <div className="flex items-start gap-2.5 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg backdrop-blur-sm">
          <div className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
          </div>
          <p className="text-xs text-blue-300 leading-relaxed">
            <span className="font-bold">Live Mode</span> · Changes apply instantly
          </p>
        </div>
      </div>

      {/* Tabs */}
      {hasCycloneData && (
        <div className="px-4 py-3 border-b border-white/10">
          <div
            className="flex gap-2 p-1 bg-slate-800/50 rounded-xl border border-slate-700/50 backdrop-blur-sm"
            role="tablist"
            aria-label="Filter panel tabs"
            onKeyDown={handleTabKeyDown}
          >
            <button
              type="button"
              onClick={() => setActiveTab("filters")}
              id="filter-panel-tab-filters"
              role="tab"
              aria-selected={activeTab === "filters"}
              aria-controls="filter-panel-panel-filters"
              tabIndex={activeTab === "filters" ? 0 : -1}
              ref={filtersTabRef}
              className={`relative flex-1 px-4 py-2.5 text-xs font-bold rounded-lg transition-all duration-300 ${
                activeTab === "filters"
                  ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/30"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900`}
            >
              <span className="relative z-10">Filters</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("cyclone")}
              id="filter-panel-tab-cyclone"
              role="tab"
              aria-selected={activeTab === "cyclone"}
              aria-controls="filter-panel-panel-cyclone"
              tabIndex={activeTab === "cyclone" ? 0 : -1}
              ref={cycloneTabRef}
              className={`relative flex-1 px-4 py-2.5 text-xs font-bold rounded-lg transition-all duration-300 ${
                activeTab === "cyclone"
                  ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/30"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900`}
            >
              <span className="relative z-10 flex items-center gap-1.5">
                <Wind className="w-3.5 h-3.5" />
                Cyclone
              </span>
            </button>
          </div>
        </div>
      )}

      {activeTab === "filters" && (
        <div
          id="filter-panel-panel-filters"
          role="tabpanel"
          aria-labelledby="filter-panel-tab-filters"
        >
      {/* Premium Quick Filter Presets - Collapsible */}
      <div className="border-b border-white/10">
        <button
          type="button"
          onClick={() => toggleSection('quickFilters')}
          id={accordionIds.quickFilters.button}
          aria-expanded={expandedSections.quickFilters}
          aria-controls={accordionIds.quickFilters.panel}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-800/40 transition-all duration-300 group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
              Quick Filters
            </h3>
          </div>
          <ChevronDown 
            className={`w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-all duration-300 ${expandedSections.quickFilters ? 'rotate-180' : ''}`}
          />
        </button>
        {expandedSections.quickFilters && (
          <div
            id={accordionIds.quickFilters.panel}
            role="region"
            aria-labelledby={accordionIds.quickFilters.button}
            className="px-4 pb-4 animate-in slide-in-from-top-3 duration-300"
          >
            <div className="grid grid-cols-3 gap-2">
              {filterPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className="group relative overflow-hidden px-3 py-3 text-xs font-bold bg-gradient-to-br from-slate-800/80 to-slate-700/60 hover:from-blue-500/20 hover:to-cyan-500/20 text-slate-300 hover:text-blue-300 rounded-xl transition-all duration-300 border border-slate-700 hover:border-blue-500/50 flex flex-col items-center gap-2 hover:shadow-lg hover:shadow-blue-500/20 hover:scale-[1.05] active:scale-95"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-cyan-500/0 group-hover:from-blue-500/10 group-hover:to-cyan-500/10 transition-all duration-300" />
                  <preset.icon className="w-5 h-5 relative z-10 group-hover:scale-110 transition-transform duration-300" />
                  <span className="relative z-10 text-center leading-tight">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Premium Temporal Filters Section - Collapsible */}
      <div className="border-b border-slate-700/30">
        <button
          type="button"
          onClick={() => toggleSection('temporal')}
          id={accordionIds.temporal.button}
          aria-expanded={expandedSections.temporal}
          aria-controls={accordionIds.temporal.panel}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-800/40 transition-all duration-300 group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <Calendar className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
                Temporal
              </h3>
              {filters.selectedEvents.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-bold bg-blue-500/20 text-blue-300 rounded-md border border-blue-500/30">
                  {filters.selectedEvents.length}
                </span>
              )}
            </div>
          </div>
          <ChevronDown 
            className={`w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-all duration-300 ${expandedSections.temporal ? 'rotate-180' : ''}`}
          />
        </button>
        {expandedSections.temporal && (
          <div
            id={accordionIds.temporal.panel}
            role="region"
            aria-labelledby={accordionIds.temporal.button}
            className="px-5 pb-5 animate-in slide-in-from-top-3 duration-300"
          >
            {/* Event Multi-Select Dropdown */}
            <div className="mb-5">
              <span className="block text-xs text-slate-300 mb-3 font-bold uppercase tracking-wide" id="event-filter-label">Events</span>
              <SearchableEventSelector
                events={events}
                selectedEvents={filters.selectedEvents}
                onToggleEvent={toggleEvent}
                onSelectAll={selectAllEvents}
                onSelectFiltered={selectFilteredEvents}
                onClearAll={clearAllEvents}
                districts={districts}
                hazards={hazards}
              />
            </div>

            {/* Premium Date Range */}
            <div className="space-y-3">
              <div>
                <label htmlFor="date-from" className="block text-xs text-slate-300 mb-2 font-bold">From Date</label>
                <input
                  id="date-from"
                  name="dateFrom"
                  type="date"
                  value={filters.dateRange.start}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      dateRange: { ...filters.dateRange, start: e.target.value },
                    })
                  }
                  className="w-full px-4 py-2.5 text-sm border-2 border-slate-600 hover:border-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 rounded-xl bg-slate-800/80 text-white transition-all duration-200 font-medium backdrop-blur-sm"
                />
              </div>
              <div>
                <label htmlFor="date-to" className="block text-xs text-slate-300 mb-2 font-bold">To Date</label>
                <input
                  id="date-to"
                  name="dateTo"
                  type="date"
                  value={filters.dateRange.end}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      dateRange: { ...filters.dateRange, end: e.target.value },
                    })
                  }
                  className="w-full px-4 py-2.5 text-sm border-2 border-slate-600 hover:border-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 rounded-xl bg-slate-800/80 text-white transition-all duration-200 font-medium backdrop-blur-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Premium Aggregation Section - Collapsible */}
      <div className="border-b border-slate-700/30">
        <button
          type="button"
          onClick={() => toggleSection('aggregation')}
          id={accordionIds.aggregation.button}
          aria-expanded={expandedSections.aggregation}
          aria-controls={accordionIds.aggregation.panel}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-800/40 transition-all duration-300 group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <Target className="w-4 h-4 text-indigo-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
              Aggregation
            </h3>
          </div>
          <ChevronDown 
            className={`w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-all duration-300 ${expandedSections.aggregation ? 'rotate-180' : ''}`}
          />
        </button>
        {expandedSections.aggregation && (
          <div
            id={accordionIds.aggregation.panel}
            role="region"
            aria-labelledby={accordionIds.aggregation.button}
            className="px-5 pb-5 space-y-4 animate-in slide-in-from-top-3 duration-300"
          >
            <div className="space-y-2">
              {aggregationOptions.map((option) => (
                <label
                  key={option.value}
                  htmlFor={`aggregation-${option.value}`}
                  className="flex items-center gap-3 cursor-pointer group px-3 py-3 rounded-xl hover:bg-gradient-to-r hover:from-slate-800/70 hover:to-slate-700/40 transition-all duration-200 hover:scale-[1.02]"
                >
                  <div className="relative flex items-center justify-center">
                    <input
                      id={`aggregation-${option.value}`}
                      type="radio"
                      name="aggregation"
                      value={option.value}
                      checked={filters.aggregationLevel === option.value}
                      onChange={() => setAggregationLevel(option.value)}
                      className="appearance-none w-5 h-5 border-2 border-slate-500 rounded-full cursor-pointer transition-all duration-200 hover:border-blue-400 hover:scale-110 checked:border-blue-500 checked:bg-gradient-to-br checked:from-blue-500/30 checked:to-blue-400/30 shadow-sm"
                    />
                    {filters.aggregationLevel === option.value && (
                      <div className="absolute w-2.5 h-2.5 bg-indigo-400 rounded-full pointer-events-none shadow-lg shadow-indigo-500/50 animate-in zoom-in duration-200"></div>
                    )}
                  </div>
                  <span className="text-sm text-slate-300 group-hover:text-white font-semibold transition-colors">
                    {option.label}
                  </span>
                </label>
              ))}
            </div>

          </div>
        )}
      </div>

      {/* Hazards Section - Collapsible */}
      <div className="border-b border-slate-700/30">
        <button
          type="button"
          onClick={() => toggleSection('hazards')}
          id={accordionIds.hazards.button}
          aria-expanded={expandedSections.hazards}
          aria-controls={accordionIds.hazards.panel}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-800/40 transition-all duration-300 group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
                Hazards
              </h3>
              {filters.selectedHazards.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-bold bg-red-500/20 text-red-300 rounded-md border border-red-500/30">
                  {filters.selectedHazards.length}
                </span>
              )}
            </div>
          </div>
          <ChevronDown 
            className={`w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-all duration-300 ${expandedSections.hazards ? 'rotate-180' : ''}`}
          />
        </button>
        {expandedSections.hazards && (
          <div
            id={accordionIds.hazards.panel}
            role="region"
            aria-labelledby={accordionIds.hazards.button}
            className="px-5 pb-5 animate-in slide-in-from-top-3 duration-300"
          >
            {hazardsWithAvailability.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No hazard data available</p>
            ) : (
              <div className="space-y-2">
            {hazardsWithAvailability.map((hazard) => (
              <label
                key={hazard.id}
                htmlFor={`hazard-${hazard.id}`}
                className={`flex items-center gap-3 group relative px-3 py-3 rounded-xl transition-all duration-200 ${
                  hazard.isAvailable ? "cursor-pointer hover:bg-gradient-to-r hover:from-slate-800/70 hover:to-slate-700/40 hover:scale-[1.02]" : "cursor-not-allowed opacity-50"
                }`}
                title={!hazard.isAvailable ? "No data available for this hazard type" : ""}
              >
                <div className="relative flex items-center justify-center">
                  <input
                    id={`hazard-${hazard.id}`}
                    type="checkbox"
                    name="hazards"
                    value={hazard.id}
                    checked={filters.selectedHazards.includes(hazard.id)}
                    onChange={() => hazard.isAvailable && toggleHazard(hazard.id)}
                    disabled={!hazard.isAvailable}
                    className="appearance-none w-5 h-5 border-2 border-slate-500 rounded-lg cursor-pointer transition-all duration-200 hover:border-blue-400 hover:scale-110 checked:border-blue-500 checked:bg-gradient-to-br checked:from-blue-500/30 checked:to-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
                  />
                  {filters.selectedHazards.includes(hazard.id) && (
                    <svg className="absolute w-3.5 h-3.5 text-blue-400 pointer-events-none animate-in zoom-in duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-slate-700/50 shadow-lg group-hover:ring-slate-600 transition-all"
                  style={{ backgroundColor: hazard.color }}
                />
                <span className="text-sm text-slate-300 group-hover:text-white flex-1 font-semibold transition-colors">
                  {hazard.name}
                </span>
                {!hazard.isAvailable && (
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-700/70 text-slate-400 font-bold border border-slate-600">
                    No data
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
          </div>
        )}
      </div>

      {/* Sectors Section - Collapsible */}
      <div className="border-b border-slate-700/30">
        <button
          type="button"
          onClick={() => toggleSection('sectors')}
          id={accordionIds.sectors.button}
          aria-expanded={expandedSections.sectors}
          aria-controls={accordionIds.sectors.panel}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-800/40 transition-all duration-300 group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-500/15 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <Database className="w-4 h-4 text-green-400" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
                Sectors
              </h3>
              {filters.selectedSectors.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-bold bg-green-500/20 text-green-300 rounded-md border border-green-500/30">
                  {filters.selectedSectors.length}
                </span>
              )}
            </div>
          </div>
          <ChevronDown 
            className={`w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-all duration-300 ${expandedSections.sectors ? 'rotate-180' : ''}`}
          />
        </button>
        {expandedSections.sectors && (
          <div
            id={accordionIds.sectors.panel}
            role="region"
            aria-labelledby={accordionIds.sectors.button}
            className="px-5 pb-5 animate-in slide-in-from-top-3 duration-300"
          >
            {sectorsWithAvailability.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No sector data available</p>
            ) : (
              <div className="space-y-2">
            {sectorsWithAvailability.map((sector) => (
              <label
                key={sector.id}
                htmlFor={`sector-${sector.id}`}
                className={`flex items-center gap-3 group relative px-3 py-3 rounded-xl transition-all duration-200 ${
                  sector.isAvailable ? "cursor-pointer hover:bg-gradient-to-r hover:from-slate-800/70 hover:to-slate-700/40 hover:scale-[1.02]" : "cursor-not-allowed opacity-50"
                }`}
                title={!sector.isAvailable ? "No data available for this sector" : ""}
              >
                <div className="relative flex items-center justify-center">
                  <input
                    id={`sector-${sector.id}`}
                    type="checkbox"
                    name="sectors"
                    value={sector.id}
                    checked={filters.selectedSectors.includes(sector.id)}
                    onChange={() => sector.isAvailable && toggleSector(sector.id)}
                    disabled={!sector.isAvailable}
                    className="appearance-none w-5 h-5 border-2 border-slate-500 rounded-lg cursor-pointer transition-all duration-200 hover:border-green-400 hover:scale-110 checked:border-green-500 checked:bg-gradient-to-br checked:from-green-500/30 checked:to-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
                  />
                  {filters.selectedSectors.includes(sector.id) && (
                    <svg className="absolute w-3.5 h-3.5 text-green-400 pointer-events-none animate-in zoom-in duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-slate-700/50 shadow-lg group-hover:ring-slate-600 transition-all"
                  style={{ backgroundColor: sector.color }}
                />
                <span className="text-sm text-slate-300 group-hover:text-white flex-1 font-semibold transition-colors">
                  {sector.name}
                </span>
                {!sector.isAvailable && (
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-700/70 text-slate-400 font-bold border border-slate-600">
                    No data
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
          </div>
        )}
      </div>

      {/* Accessibility Tools */}
      <div className="border-b border-slate-700/30" role="region" aria-label="Accessibility tools">
        <div className="w-full px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-700/40 flex items-center justify-center">
              <Keyboard className="w-4 h-4 text-slate-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Accessibility
              </h3>
              <p className="text-xs text-slate-400">Keyboard-friendly district list</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsDistrictListOpen(!isDistrictListOpen)}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 transition-colors"
            aria-expanded={isDistrictListOpen}
          >
            {isDistrictListOpen ? "Hide list" : "Show list"}
          </button>
        </div>
        {isDistrictListOpen && (
          <div className="px-5 pb-5">
            <MapAccessibleFeatures
              districts={accessibleDistricts}
              visible={isDistrictListOpen && accessibleDistricts.length > 0}
              inline
              isOpen={isDistrictListOpen}
              showToggle={false}
              onDistrictSelect={onDistrictSelect}
              onClose={() => setIsDistrictListOpen(false)}
            />
            {accessibleDistricts.length === 0 && (
              <div className="mt-3 rounded-lg border border-dashed border-slate-700/60 px-3 py-2 text-xs text-slate-500">
                No district data available.
              </div>
            )}
          </div>
        )}
      </div>

        </div>
      )}

      {activeTab === "cyclone" && (
        <div
          id="filter-panel-panel-cyclone"
          role="tabpanel"
          aria-labelledby="filter-panel-tab-cyclone"
          aria-live="polite"
          className="flex-shrink-0 px-4 py-4 space-y-4 max-w-full overflow-x-hidden"
        >
          {/* Cyclone Controls Card */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center">
                  <Wind className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">Animation</h3>
                  <p className="text-xs text-slate-400">
                    {isCyclonePlaying ? "Playing" : "Paused"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-pressed={isCyclonePlaying}
                aria-label={isCyclonePlaying ? "Pause" : "Play"}
                onClick={() => onToggleCyclonePlaying?.(!isCyclonePlaying)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-700/50 text-slate-200 hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              >
                {isCyclonePlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
            </div>
            
            {/* Enhanced Timeline Controls Toggle with Chevron */}
            <button
              type="button"
              role="switch"
              aria-checked={showCycloneControls}
              aria-label="Toggle timeline visibility"
              onClick={() => onToggleCycloneControls?.(!showCycloneControls)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 mt-3 rounded-lg bg-gradient-to-r from-slate-800/50 to-slate-800/30 border border-slate-700/50 hover:border-emerald-500/50 transition-all group hover:shadow-lg hover:shadow-emerald-500/10"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Cyclone Timeline
              </span>
              <div className="flex items-center gap-2">
                <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  showCycloneControls ? 'bg-emerald-500' : 'bg-slate-700'
                }`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    showCycloneControls ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </div>
                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${
                  showCycloneControls ? 'rotate-180' : 'rotate-0'
                }`} />
              </div>
            </button>
          </div>

          {hasCycloneData && showCycloneControls && (
            <div
              ref={cycloneControlsHostRef}
              className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-700/50 bg-slate-900/40 p-3"
              role="region"
              aria-label="Cyclone timeline controls"
            />
          )}

          {!showCycloneControls && (
            <div className="mx-4 mb-4 rounded-lg border border-dashed border-emerald-500/30 bg-emerald-950/20 p-4 text-center">
              <p className="text-xs text-emerald-400/80 font-medium">
                Enable the toggle above to show the timeline controls here.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Keyboard Navigation Help */}
      <div className="p-4 border-t border-slate-700/30 bg-gradient-to-br from-slate-800/30 to-slate-900/50">
        <details className="group">
          <summary className="flex items-center justify-between cursor-pointer list-none text-xs font-semibold text-slate-300 hover:text-white transition-all px-2 py-1.5 rounded-lg hover:bg-slate-800/50">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Keyboard shortcuts
            </span>
            <ChevronDown className="w-4 h-4 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between items-center py-1.5 px-2 rounded hover:bg-slate-800/30">
              <span className="text-slate-400">Navigate filters</span>
              <kbd className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-slate-300 font-mono font-semibold shadow-sm">Tab</kbd>
            </div>
            <div className="flex justify-between items-center py-1.5 px-2 rounded hover:bg-slate-800/30">
              <span className="text-slate-400">Toggle checkbox</span>
              <kbd className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-slate-300 font-mono font-semibold shadow-sm">Space</kbd>
            </div>
            <div className="flex justify-between items-center py-1.5 px-2 rounded hover:bg-slate-800/30">
              <span className="text-slate-400">Close panel</span>
              <kbd className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-slate-300 font-mono font-semibold shadow-sm">Esc</kbd>
            </div>
          </div>
        </details>
      </div>

      </div>

      {/* Accessibility: Live region for dock state announcements */}
      <div 
        role="status" 
        aria-live="polite" 
        aria-atomic="true"
        className="sr-only"
      >
        {dockAnnouncement}
      </div>

      {/* Clear Filters Confirmation Toast */}
      {showClearToast && (
        <Toast
          message="All filters cleared"
          type="success"
          action={{
            label: "Undo",
            onClick: undoClearFilters
          }}
          onClose={() => {
            setShowClearToast(false);
            setPreviousFilters(null);
          }}
        />
      )}
    </div>
  );
}
