"use client";

import { useState, useRef, useEffect } from "react";
import { FilterState, Hazard, Sector, Event, AggregationLevel } from "@/types";
import { AlertTriangle, Calendar, ChevronDown, Globe2 } from "lucide-react";

interface FilterPanelProps {
  hazards: Hazard[];
  sectors: Sector[];
  events: Event[];
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

export default function FilterPanel({
  hazards,
  sectors,
  events,
  filters,
  onFilterChange,
}: FilterPanelProps) {
  const [isEventDropdownOpen, setIsEventDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsEventDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const clearAllEvents = () => {
    onFilterChange({ ...filters, selectedEvents: [] });
  };

  const setAggregationLevel = (level: AggregationLevel) => {
    onFilterChange({ ...filters, aggregationLevel: level });
  };

  const clearAllFilters = () => {
    onFilterChange({
      selectedHazards: [],
      selectedSectors: [],
      selectedEvents: [],
      dateRange: { start: "", end: "" },
      aggregationLevel: "district",
    });
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
    }
  };

  const selectEvent = (eventId: string) => {
    onFilterChange({ ...filters, selectedEvents: [eventId] });
  };

  const selectedEventCount = filters.selectedEvents.length;
  const allEventsSelected = selectedEventCount === events.length;
  const someEventsSelected = selectedEventCount > 0 && selectedEventCount < events.length;

  // Filter hazards and sectors to only show those present in actual events
  const activeHazardIds = new Set(events.map(e => e.hazardId));
  const activeSectorIds = new Set(events.map(e => e.sectorId));
  const visibleHazards = hazards.filter(h => activeHazardIds.has(h.id));
  const visibleSectors = sectors.filter(s => activeSectorIds.has(s.id));

  return (
    <div className="w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 overflow-y-auto flex-shrink-0">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Filters
          </h2>
          <button
            onClick={clearAllFilters}
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
            aria-label="Clear all filters"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Quick Filter Presets */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Quick Filters
        </h3>
        <div className="flex gap-2 flex-wrap">
          {filterPresets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 text-gray-700 dark:text-gray-300 rounded-lg transition-colors border border-gray-200 dark:border-gray-700 flex items-center gap-1.5"
            >
              <preset.icon className="w-3.5 h-3.5" />
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Temporal Filters Section */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Temporal Filters
        </h3>
        
        {/* Event Multi-Select Dropdown */}
        <div className="mb-4" ref={dropdownRef}>
          <label htmlFor="events-dropdown" className="block text-xs text-gray-700 dark:text-gray-300 mb-2">Events</label>
          <button
            id="events-dropdown"
            onClick={() => setIsEventDropdownOpen(!isEventDropdownOpen)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            aria-expanded={isEventDropdownOpen}
            aria-haspopup="listbox"
          >
            <span className="truncate">
              {selectedEventCount === 0 
                ? "All Events" 
                : `${selectedEventCount} event${selectedEventCount !== 1 ? 's' : ''} selected`}
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isEventDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isEventDropdownOpen && (
            <div className="absolute z-10 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-64 overflow-y-auto">
              <div className="sticky top-0 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 p-2 flex gap-2">
                <button
                  onClick={selectAllEvents}
                  className="flex-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                  disabled={allEventsSelected}
                >
                  Select All
                </button>
                <button
                  onClick={clearAllEvents}
                  className="flex-1 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                  disabled={selectedEventCount === 0}
                >
                  Clear
                </button>
              </div>
              <div className="p-2 space-y-1">
                {events.map((event) => (
                  <label
                    key={event.id}
                    htmlFor={`event-${event.id}`}
                    className="flex items-start gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer group"
                  >
                    <input
                      id={`event-${event.id}`}
                      type="checkbox"
                      name="events"
                      value={event.id}
                      checked={filters.selectedEvents.includes(event.id)}
                      onChange={() => toggleEvent(event.id)}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-700 dark:text-gray-300 block truncate group-hover:text-gray-900 dark:group-hover:text-white">
                        {event.name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{event.date}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Date Range */}
        <div className="space-y-3">
          <div>
            <label htmlFor="date-from" className="block text-xs text-gray-700 dark:text-gray-300 mb-1">From</label>
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
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="date-to" className="block text-xs text-gray-700 dark:text-gray-300 mb-1">To</label>
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
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Aggregation Section */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Aggregation Level
        </h3>
        <div className="space-y-2">
          {aggregationOptions.map((option) => (
            <label
              key={option.value}
              htmlFor={`aggregation-${option.value}`}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <input
                id={`aggregation-${option.value}`}
                type="radio"
                name="aggregation"
                value={option.value}
                checked={filters.aggregationLevel === option.value}
                onChange={() => setAggregationLevel(option.value)}
                className="w-4 h-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Hazards Section */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Hazard Types
        </h3>
        {visibleHazards.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">No hazard data available</p>
        ) : (
          <div className="space-y-2">
            {visibleHazards.map((hazard) => (
              <label
                key={hazard.id}
                htmlFor={`hazard-${hazard.id}`}
                className="flex items-center gap-3 cursor-pointer group"
              >
                <input
                  id={`hazard-${hazard.id}`}
                  type="checkbox"
                  name="hazards"
                  value={hazard.id}
                  checked={filters.selectedHazards.includes(hazard.id)}
                  onChange={() => toggleHazard(hazard.id)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: hazard.color }}
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">
                  {hazard.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Sectors Section */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Sectors
        </h3>
        {visibleSectors.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">No sector data available</p>
        ) : (
          <div className="space-y-2">
            {visibleSectors.map((sector) => (
              <label
                key={sector.id}
                htmlFor={`sector-${sector.id}`}
                className="flex items-center gap-3 cursor-pointer group"
              >
                <input
                  id={`sector-${sector.id}`}
                  type="checkbox"
                  name="sectors"
                  value={sector.id}
                  checked={filters.selectedSectors.includes(sector.id)}
                  onChange={() => toggleSector(sector.id)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: sector.color }}
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">
                  {sector.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
