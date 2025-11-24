"use client";

import { FilterState, Hazard, Sector, Event } from "@/types";

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

  const clearAllFilters = () => {
    onFilterChange({
      selectedHazards: [],
      selectedSectors: [],
      selectedEvents: [],
      dateRange: { start: "", end: "" },
    });
  };

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

      {/* Hazards Section */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Hazard Types
        </h3>
        <div className="space-y-2">
          {hazards.map((hazard) => (
            <label
              key={hazard.id}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={filters.selectedHazards.includes(hazard.id)}
                onChange={() => toggleHazard(hazard.id)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: hazard.color }}
              />
              <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white">
                {hazard.icon} {hazard.name}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Sectors Section */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Sectors
        </h3>
        <div className="space-y-2">
          {sectors.map((sector) => (
            <label
              key={sector.id}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={filters.selectedSectors.includes(sector.id)}
                onChange={() => toggleSector(sector.id)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white">
                {sector.icon} {sector.name}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Events Section */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Events
        </h3>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {events.map((event) => (
            <label
              key={event.id}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={filters.selectedEvents.includes(event.id)}
                onChange={() => toggleEvent(event.id)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white truncate block">
                  {event.name}
                </span>
                <span className="text-xs text-gray-400">{event.date}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Date Range Section */}
      <div className="p-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Date Range
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input
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
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input
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
    </div>
  );
}
