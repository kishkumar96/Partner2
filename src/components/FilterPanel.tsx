'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import type { KeyboardEvent, Ref } from 'react';
import {
  FilterState,
  Hazard,
  Sector,
  Event,
  AggregationLevel,
  District,
  ExposureData,
  EconomicDamageData,
} from '@/types';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  Database,
  Globe2,
  Keyboard,
  Target,
  Wind,
  Play,
  Pause,
  BookOpen,
  Zap,
  Check,
  Clock,
} from 'lucide-react';
import SearchableEventSelector from './SearchableEventSelector';
import MapAccessibleFeatures, { type DistrictFeature } from './MapAccessibleFeatures';
import Toast from './Toast';

interface FilterPanelProps {
  hazards: Hazard[];
  sectors: Sector[];
  events: Event[];
  districts: District[];
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  exposureData?: ExposureData[];
  economicDamageData?: EconomicDamageData[];
  isCyclonePlaying?: boolean;
  onToggleCyclonePlaying?: (isPlaying: boolean) => void;
  hasCycloneData?: boolean;
  cycloneControlsHostRef?: Ref<HTMLDivElement>;
  accessibleDistricts?: DistrictFeature[];
  onDistrictSelect?: (districtId: string) => void;
  storyMode?: boolean;
}

const noopDistrictSelect = () => {};

export default function FilterPanel({
  hazards,
  sectors,
  events,
  districts,
  filters,
  onFilterChange,
  exposureData = [],
  economicDamageData = [],
  isCyclonePlaying = false,
  onToggleCyclonePlaying,
  hasCycloneData = false,
  cycloneControlsHostRef,
  accessibleDistricts = [],
  onDistrictSelect = noopDistrictSelect,
  storyMode = false,
}: FilterPanelProps) {
  const [showClearToast, setShowClearToast] = useState(false);
  const [previousFilters, setPreviousFilters] = useState<FilterState | null>(null);

  const [activeTab, setActiveTab] = useState<'filters' | 'cyclone'>('filters');
  const [isDistrictListOpen, setIsDistrictListOpen] = useState(false);
  const filtersTabRef = useRef<HTMLButtonElement>(null);
  const cycloneTabRef = useRef<HTMLButtonElement>(null);

  const accordionIds = {
    quickFilters: {
      button: 'filter-panel-quick-filters-button',
      panel: 'filter-panel-quick-filters-panel',
    },
    temporal: {
      button: 'filter-panel-temporal-button',
      panel: 'filter-panel-temporal-panel',
    },
    aggregation: {
      button: 'filter-panel-aggregation-button',
      panel: 'filter-panel-aggregation-panel',
    },
    hazards: {
      button: 'filter-panel-hazards-button',
      panel: 'filter-panel-hazards-panel',
    },
    sectors: {
      button: 'filter-panel-sectors-button',
      panel: 'filter-panel-sectors-panel',
    },
  };

  // Accordion state for each section
  const [expandedSections, setExpandedSections] = useState({
    quickFilters: true,
    temporal: true,
    aggregation: false,
    hazards: true, // Expand by default to show hazard options
    sectors: false,
  });

  // Switch to filters tab if cyclone data is not available (derive on access)
  const effectiveTab = !hasCycloneData && activeTab === 'cyclone' ? 'filters' : activeTab;

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const toggleHazard = (hazardId: string) => {
    const newHazards = filters.selectedHazards.includes(hazardId)
      ? filters.selectedHazards.filter(h => h !== hazardId)
      : [...filters.selectedHazards, hazardId];
    onFilterChange({ ...filters, selectedHazards: newHazards });
  };

  const toggleSector = (sectorId: string) => {
    const newSectors = filters.selectedSectors.includes(sectorId)
      ? filters.selectedSectors.filter(s => s !== sectorId)
      : [...filters.selectedSectors, sectorId];

    onFilterChange({ ...filters, selectedSectors: newSectors });
  };

  const toggleEvent = (eventId: string) => {
    const newEvents = filters.selectedEvents.includes(eventId)
      ? filters.selectedEvents.filter(e => e !== eventId)
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
      dateRange: { start: '', end: '' },
      aggregationLevel: 'district',
    });

    // Show confirmation toast
    setShowClearToast(true);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Only handle tab navigation if cyclone data is available
    if (!hasCycloneData) return;

    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;

    event.preventDefault();
    const order: Array<'filters' | 'cyclone'> = ['filters', 'cyclone'];
    const currentIndex = order.indexOf(activeTab);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % order.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + order.length) % order.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = order.length - 1;
    }

    const nextTab = order[nextIndex];
    setActiveTab(nextTab);
    if (nextTab === 'filters') {
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
    { value: 'district', label: 'Districts' },
    { value: 'province', label: 'Province' },
    { value: 'national', label: 'National' },
  ];

  const filterPresets = [
    { id: 'all', label: 'All Data', icon: Globe2 },
    { id: 'high-risk', label: 'High Risk', icon: AlertTriangle },
    { id: 'recent', label: 'Recent (2024)', icon: Calendar },
  ];

  const applyPreset = (presetId: string) => {
    switch (presetId) {
      case 'all':
        clearAllFilters();
        break;
      case 'high-risk':
        onFilterChange({
          ...filters,
          selectedEvents: events
            .filter(e => e.severity === 'high' || e.severity === 'critical')
            .map(e => e.id),
        });
        break;
      case 'recent':
        onFilterChange({
          ...filters,
          dateRange: { start: '2024-01-01', end: '2024-12-31' },
        });
        break;
      default:
        console.warn(`applyPreset: unknown presetId "${presetId}"`);
        break;
    }
  };

  // Track which hazards and sectors have data available in actual events
  const activeHazardIds = useMemo(() => new Set(events.map(event => event.hazardId)), [events]);
  const activeSectorIds = useMemo(() => {
    const sectorIds = new Set<string>();
    // Get sector IDs from exposure data
    exposureData.forEach(item => {
      if (item.sectorId) sectorIds.add(item.sectorId);
    });
    // Get sector IDs from economic damage data
    economicDamageData.forEach(item => {
      if (item.sectorId) sectorIds.add(item.sectorId);
    });
    return sectorIds;
  }, [exposureData, economicDamageData]);

  // Show all hazards and sectors, but mark unavailable ones
  const hazardsWithAvailability = useMemo(
    () =>
      hazards.map(hazard => ({
        ...hazard,
        isAvailable: activeHazardIds.has(hazard.id),
      })),
    [hazards, activeHazardIds]
  );
  const sectorsWithAvailability = useMemo(
    () =>
      sectors.map(sector => ({
        ...sector,
        isAvailable: activeSectorIds.has(sector.id),
      })),
    [sectors, activeSectorIds]
  );

  return (
    <div className="w-72 glass-panel border-r border-white/5 flex flex-col flex-shrink-0 h-full min-h-0 overflow-hidden isolate">
      <div className="flex-1 overflow-y-auto overscroll-contain overflow-x-hidden">
        <div className="px-4 py-2.5 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-tight">Filters</h2>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold bg-blue-500/10 text-blue-300 rounded border border-blue-500/20">
                <span className="w-1 h-1 rounded-full bg-blue-400"></span>
                LIVE
              </span>
            </div>
            <button
              onClick={clearAllFilters}
              className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/20 hover:border-blue-400/40 rounded-lg transition-colors"
              aria-label="Clear all filters"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Tabs */}
        {hasCycloneData && (
          <div className="px-4 py-2">
            <div
              className="flex gap-1 p-0.5 bg-slate-800/40 rounded-lg border border-slate-700/30"
              role="tablist"
              aria-label="Filter panel tabs"
              onKeyDown={handleTabKeyDown}
            >
              <button
                type="button"
                onClick={() => setActiveTab('filters')}
                id="filter-panel-tab-filters"
                role="tab"
                aria-selected={activeTab === 'filters'}
                aria-controls="filter-panel-panel-filters"
                tabIndex={activeTab === 'filters' ? 0 : -1}
                ref={filtersTabRef}
                className={`relative flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  activeTab === 'filters'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
                } focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400`}
              >
                Filters
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('cyclone')}
                id="filter-panel-tab-cyclone"
                role="tab"
                aria-selected={activeTab === 'cyclone'}
                aria-controls="filter-panel-panel-cyclone"
                tabIndex={activeTab === 'cyclone' ? 0 : -1}
                ref={cycloneTabRef}
                className={`relative flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === 'cyclone'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
                } focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400`}
              >
                <Wind className="w-3 h-3" />
                Cyclone
              </button>
            </div>
          </div>
        )}

        {effectiveTab === 'filters' && (
          <div
            id="filter-panel-panel-filters"
            role="tabpanel"
            aria-labelledby="filter-panel-tab-filters"
          >
            {/* Temporal Filters Section - Compact */}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => toggleSection('temporal')}
                id={accordionIds.temporal.button}
                aria-expanded={expandedSections.temporal}
                aria-controls={accordionIds.temporal.panel}
                className="w-full px-4 py-2 flex items-center gap-2 hover:bg-slate-800/30 transition-colors group"
              >
                <Calendar className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                <h3 className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                  Temporal
                </h3>
                {filters.selectedEvents.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/30">
                    {filters.selectedEvents.length}
                  </span>
                )}
                {!expandedSections.temporal && (
                  <span className="text-[10px] text-slate-500 ml-auto mr-2">
                    {filters.selectedEvents.length > 0
                      ? `${filters.selectedEvents.length} event${filters.selectedEvents.length !== 1 ? 's' : ''}`
                      : 'All'}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedSections.temporal ? 'rotate-180' : ''} ${!expandedSections.temporal ? 'ml-auto' : ''}`}
                />
              </button>
              {expandedSections.temporal && (
                <div
                  id={accordionIds.temporal.panel}
                  role="region"
                  aria-labelledby={accordionIds.temporal.button}
                  className="px-4 pb-3 space-y-2"
                >
                  {/* Event Multi-Select Dropdown */}
                  <div>
                    <span
                      className="block text-[10px] text-slate-400 mb-1.5 font-semibold uppercase tracking-wide"
                      id="event-filter-label"
                    >
                      Events
                    </span>
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

                  {/* Date Range */}
                  <div className="space-y-2">
                    <div>
                      <label
                        htmlFor="date-from"
                        className="block text-[10px] text-slate-400 mb-1 font-semibold"
                      >
                        From Date
                      </label>
                      <input
                        id="date-from"
                        name="dateFrom"
                        type="date"
                        value={filters.dateRange.start}
                        onChange={e =>
                          onFilterChange({
                            ...filters,
                            dateRange: { ...filters.dateRange, start: e.target.value },
                          })
                        }
                        className="w-full px-3 py-1.5 text-xs border border-slate-700/50 hover:border-slate-600 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 rounded-lg bg-slate-800/60 text-white transition-colors"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="date-to"
                        className="block text-[10px] text-slate-400 mb-1 font-semibold"
                      >
                        To Date
                      </label>
                      <input
                        id="date-to"
                        name="dateTo"
                        type="date"
                        value={filters.dateRange.end}
                        onChange={e =>
                          onFilterChange({
                            ...filters,
                            dateRange: { ...filters.dateRange, end: e.target.value },
                          })
                        }
                        className="w-full px-3 py-1.5 text-xs border border-slate-700/50 hover:border-slate-600 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 rounded-lg bg-slate-800/60 text-white transition-colors"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Aggregation Section - Compact */}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => toggleSection('aggregation')}
                id={accordionIds.aggregation.button}
                aria-expanded={expandedSections.aggregation}
                aria-controls={accordionIds.aggregation.panel}
                className="w-full px-4 py-2 flex items-center gap-2 hover:bg-slate-800/30 transition-colors group"
              >
                <Target className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                <h3 className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                  Aggregation
                </h3>
                {!expandedSections.aggregation && (
                  <span className="text-[10px] text-slate-500 ml-auto mr-2">
                    {filters.aggregationLevel.charAt(0).toUpperCase() +
                      filters.aggregationLevel.slice(1)}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedSections.aggregation ? 'rotate-180' : ''} ${!expandedSections.aggregation ? 'ml-auto' : ''}`}
                />
              </button>
              {expandedSections.aggregation && (
                <div
                  id={accordionIds.aggregation.panel}
                  role="region"
                  aria-labelledby={accordionIds.aggregation.button}
                  className="px-4 pb-3 space-y-1"
                >
                  {aggregationOptions.map(option => (
                    <label
                      key={option.value}
                      htmlFor={`aggregation-${option.value}`}
                      className="flex items-center gap-2 cursor-pointer group px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="relative flex items-center justify-center">
                        <input
                          id={`aggregation-${option.value}`}
                          type="radio"
                          name="aggregation"
                          value={option.value}
                          checked={filters.aggregationLevel === option.value}
                          onChange={() => setAggregationLevel(option.value)}
                          className="appearance-none w-4 h-4 border border-slate-600 rounded-full cursor-pointer transition-colors hover:border-cyan-400 checked:border-cyan-500 checked:bg-cyan-500/20"
                        />
                        {filters.aggregationLevel === option.value && (
                          <div className="absolute w-2 h-2 bg-cyan-400 rounded-full pointer-events-none"></div>
                        )}
                      </div>
                      <span className="text-xs text-slate-300 group-hover:text-white transition-colors">
                        {option.label}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Hazards Section - Compact */}
            <div className="mt-2 border-t border-white/5 pt-2">
              <button
                type="button"
                onClick={() => toggleSection('hazards')}
                id={accordionIds.hazards.button}
                aria-expanded={expandedSections.hazards}
                aria-controls={accordionIds.hazards.panel}
                className="w-full px-4 py-2 flex items-center gap-2 hover:bg-slate-800/30 transition-colors group"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                <h3 className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                  Hazards
                </h3>
                {filters.selectedHazards.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                    {filters.selectedHazards.length}
                  </span>
                )}
                {!expandedSections.hazards && (
                  <span className="text-[10px] text-slate-500 ml-auto mr-2">
                    {filters.selectedHazards.length > 0
                      ? `${filters.selectedHazards.length} selected`
                      : `All ${hazardsWithAvailability.filter(h => h.isAvailable).length}`}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedSections.hazards ? 'rotate-180' : ''} ${!expandedSections.hazards ? 'ml-auto' : ''}`}
                />
              </button>
              {expandedSections.hazards && (
                <div
                  id={accordionIds.hazards.panel}
                  role="region"
                  aria-labelledby={accordionIds.hazards.button}
                  className="px-4 pb-3"
                >
                  {hazardsWithAvailability.length === 0 ? (
                    <p className="text-[10px] text-slate-500 italic py-2">
                      No hazard data available
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {hazardsWithAvailability.map(hazard => (
                        <label
                          key={hazard.id}
                          htmlFor={`hazard-${hazard.id}`}
                          className={`flex items-center gap-2 group relative px-2 py-1.5 rounded-lg transition-colors ${
                            hazard.isAvailable
                              ? 'cursor-pointer hover:bg-slate-800/50'
                              : 'cursor-not-allowed opacity-50'
                          }`}
                          title={
                            !hazard.isAvailable ? 'No data available for this hazard type' : ''
                          }
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
                              className="appearance-none w-4 h-4 border border-slate-600 rounded cursor-pointer transition-colors hover:border-cyan-400 checked:border-cyan-500 checked:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            {filters.selectedHazards.includes(hazard.id) && (
                              <Check
                                className="absolute w-3 h-3 text-cyan-400 pointer-events-none"
                                strokeWidth={3}
                              />
                            )}
                          </div>
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-slate-700/30"
                            style={{ backgroundColor: hazard.color }}
                          />
                          <span className="text-xs text-slate-300 group-hover:text-white flex-1 transition-colors">
                            {hazard.name}
                          </span>
                          {!hazard.isAvailable && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-500 font-semibold">
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

            {/* Sectors Section - Compact */}
            <div className="mt-2 border-t border-white/5 pt-2">
              <button
                type="button"
                onClick={() => toggleSection('sectors')}
                id={accordionIds.sectors.button}
                aria-expanded={expandedSections.sectors}
                aria-controls={accordionIds.sectors.panel}
                className="w-full px-4 py-2 flex items-center gap-2 hover:bg-slate-800/30 transition-colors group"
              >
                <Database className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                <h3 className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                  Sectors
                </h3>
                {filters.selectedSectors.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/30">
                    {filters.selectedSectors.length}
                  </span>
                )}
                {!expandedSections.sectors && (
                  <span className="text-[10px] text-slate-500 ml-auto mr-2">
                    {filters.selectedSectors.length > 0
                      ? `${filters.selectedSectors.length} selected`
                      : `All ${sectorsWithAvailability.filter(s => s.isAvailable).length}`}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedSections.sectors ? 'rotate-180' : ''} ${!expandedSections.sectors ? 'ml-auto' : ''}`}
                />
              </button>
              {expandedSections.sectors && (
                <div
                  id={accordionIds.sectors.panel}
                  role="region"
                  aria-labelledby={accordionIds.sectors.button}
                  className="px-4 pb-3"
                >
                  {sectorsWithAvailability.length === 0 ? (
                    <p className="text-[10px] text-slate-500 italic py-2">
                      No sector data available
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {sectorsWithAvailability.map(sector => (
                        <label
                          key={sector.id}
                          htmlFor={`sector-${sector.id}`}
                          className={`flex items-center gap-2 group relative px-2 py-1.5 rounded-lg transition-colors ${
                            sector.isAvailable
                              ? 'cursor-pointer hover:bg-slate-800/50'
                              : 'cursor-not-allowed opacity-50'
                          }`}
                          title={!sector.isAvailable ? 'No data available for this sector' : ''}
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
                              className="appearance-none w-4 h-4 border border-slate-600 rounded cursor-pointer transition-colors hover:border-cyan-400 checked:border-cyan-500 checked:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            {filters.selectedSectors.includes(sector.id) && (
                              <Check
                                className="absolute w-3 h-3 text-cyan-400 pointer-events-none"
                                strokeWidth={3}
                              />
                            )}
                          </div>
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-slate-700/30"
                            style={{ backgroundColor: sector.color }}
                          />
                          <span className="text-xs text-slate-300 group-hover:text-white flex-1 transition-colors">
                            {sector.name}
                          </span>
                          {!sector.isAvailable && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-500 font-semibold">
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

            {/* Accessibility Tools - Compact */}
            <div
              className="mt-2 border-t border-white/5 pt-2"
              role="region"
              aria-label="Accessibility tools"
            >
              <button
                type="button"
                onClick={() => setIsDistrictListOpen(!isDistrictListOpen)}
                className="w-full px-4 py-2 flex items-center gap-2 hover:bg-slate-800/30 transition-colors group"
                aria-expanded={isDistrictListOpen}
              >
                <Keyboard className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                <h3 className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                  Accessibility
                </h3>
                {!isDistrictListOpen && (
                  <span className="text-[10px] text-slate-500 ml-auto mr-2">District list</span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isDistrictListOpen ? 'rotate-180' : ''} ${!isDistrictListOpen ? 'ml-auto' : ''}`}
                />
              </button>
              {isDistrictListOpen && (
                <div className="px-4 pb-3">
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
                    <div className="mt-2 rounded-lg border border-dashed border-slate-700/40 px-2 py-1.5 text-[10px] text-slate-500">
                      No district data available.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {effectiveTab === 'cyclone' && (
          <div
            id="filter-panel-panel-cyclone"
            role="tabpanel"
            aria-labelledby="filter-panel-tab-cyclone"
            aria-live="polite"
            className="flex-shrink-0 px-4 py-3 space-y-3 max-w-full overflow-x-hidden"
          >
            {/* Cyclone Controls Header - Compact */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-cyan-400" />
                <div>
                  <h3 className="text-xs font-semibold text-slate-200">Cyclone Timeline</h3>
                  <p className="text-[10px] text-slate-500">Animation & metrics</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {storyMode ? (
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    <BookOpen className="h-3 w-3" />
                    <span className="text-[10px] font-bold">Story</span>
                  </div>
                ) : (
                  <>
                    <div
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        isCyclonePlaying
                          ? 'bg-blue-500/15 text-blue-300'
                          : 'bg-slate-700/30 text-slate-500'
                      }`}
                    >
                      <div
                        className={`w-1 h-1 rounded-full ${isCyclonePlaying ? 'bg-blue-400 animate-pulse' : 'bg-slate-500'}`}
                      ></div>
                      {isCyclonePlaying ? 'On' : 'Off'}
                    </div>
                    <button
                      type="button"
                      aria-pressed={isCyclonePlaying}
                      aria-label={
                        isCyclonePlaying ? 'Pause cyclone animation' : 'Play cyclone animation'
                      }
                      onClick={() => {
                        onToggleCyclonePlaying?.(!isCyclonePlaying);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 transition-colors border border-cyan-500/20 hover:border-cyan-500/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
                    >
                      {isCyclonePlaying ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Timeline Controls - Always Visible */}
            {hasCycloneData ? (
              <div
                ref={cycloneControlsHostRef}
                className="max-h-[calc(100vh-20rem)] overflow-y-auto space-y-2"
                role="region"
                aria-label="Cyclone timeline controls"
              />
            ) : (
              <div className="rounded-lg border border-dashed border-slate-700/40 bg-slate-800/20 p-4">
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <Wind className="w-5 h-5 text-slate-500" />
                  <p className="text-xs font-medium text-slate-400">No Cyclone Data</p>
                  <p className="text-[10px] text-slate-500">Select an event with cyclone data</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Keyboard Navigation Help - Compact */}
        <div className="px-4 py-2 border-t border-white/5">
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer list-none text-[10px] font-semibold text-slate-400 hover:text-slate-300 transition-colors py-1">
              <span className="flex items-center gap-1.5">
                <Keyboard className="w-3 h-3" />
                Shortcuts
              </span>
              <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-1.5 space-y-0.5 text-[10px]">
              <div className="flex justify-between items-center py-1 px-1.5 rounded hover:bg-slate-800/30">
                <span className="text-slate-500">Navigate</span>
                <kbd className="px-1.5 py-0.5 bg-slate-800/60 border border-slate-700/50 rounded text-slate-400 font-mono text-[9px]">
                  Tab
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1 px-1.5 rounded hover:bg-slate-800/30">
                <span className="text-slate-500">Toggle</span>
                <kbd className="px-1.5 py-0.5 bg-slate-800/60 border border-slate-700/50 rounded text-slate-400 font-mono text-[9px]">
                  Space
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1 px-1.5 rounded hover:bg-slate-800/30">
                <span className="text-slate-500">Close</span>
                <kbd className="px-1.5 py-0.5 bg-slate-800/60 border border-slate-700/50 rounded text-slate-400 font-mono text-[9px]">
                  Esc
                </kbd>
              </div>
            </div>
          </details>
        </div>
      </div>

      {/* Accessibility: Live region for dock state announcements */}
      {/* Clear Filters Confirmation Toast */}
      {showClearToast && (
        <Toast
          message="All filters cleared"
          type="success"
          action={{
            label: 'Undo',
            onClick: undoClearFilters,
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
