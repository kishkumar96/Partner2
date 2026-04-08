'use client';

import { useState, useRef, useMemo } from 'react';
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
import { CountryCode } from '@/types/thredds';
import {
  COUNTRY_CONFIGS,
  getAggregationLabel as getCountryAggregationLabel,
} from '@/data/countryConfigs';
import { BASEMAP_STYLES } from '@/utils/basemaps';
import {
  Calendar,
  Check,
  ChevronDown,
  Database,
  Keyboard,
  Target,
  Wind,
  Layers,
  Waves,
  Building2,
  Construction,
  Download,
  Loader2,
  Globe2,
  Satellite,
} from 'lucide-react';
import SearchableEventSelector from './SearchableEventSelector';
import MapAccessibleFeatures, { type DistrictFeature } from './MapAccessibleFeatures';
import Toast from './Toast';
import { normalizeHazardId } from '@/utils/hazardIds';

interface FilterPanelProps {
  hazards: Hazard[];
  sectors: Sector[];
  events: Event[];
  districts: District[];
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  exposureData?: ExposureData[];
  economicDamageData?: EconomicDamageData[];
  accessibleDistricts?: DistrictFeature[];
  onDistrictSelect?: (districtId: string) => void;
  countryCode: CountryCode;
}

const noopDistrictSelect = () => {};
const BASEMAP_OPTIONS = [
  {
    id: 'positron',
    name: 'Light',
    icon: Globe2,
    style: BASEMAP_STYLES.positron,
  },
  {
    id: 'dark',
    name: 'Dark',
    icon: Satellite,
    style: BASEMAP_STYLES.dark,
  },
] as const;

export default function FilterPanel({
  hazards,
  sectors,
  events,
  districts,
  filters,
  onFilterChange,
  exposureData = [],
  economicDamageData = [],
  accessibleDistricts = [],
  onDistrictSelect = noopDistrictSelect,
  countryCode,
}: FilterPanelProps) {
  const geographyUi = COUNTRY_CONFIGS[countryCode].ui;
  const [showClearToast, setShowClearToast] = useState(false);
  const [previousFilters, setPreviousFilters] = useState<FilterState | null>(null);

  const [isDistrictListOpen, setIsDistrictListOpen] = useState(false);

  const accordionIds = {
    temporal: {
      button: 'filter-panel-temporal-button',
      panel: 'filter-panel-temporal-panel',
    },
    hazards: {
      button: 'filter-panel-hazards-button',
      panel: 'filter-panel-hazards-panel',
    },
    aggregation: {
      button: 'filter-panel-aggregation-button',
      panel: 'filter-panel-aggregation-panel',
    },
    sectors: {
      button: 'filter-panel-sectors-button',
      panel: 'filter-panel-sectors-panel',
    },
  };

  // Accordion state for each section
  const [expandedSections, setExpandedSections] = useState({
    hazards: false,
    temporal: true,
    aggregation: false,
    sectors: true,
  });

  // Progressive disclosure state
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const toggleSector = (sectorId: string) => {
    // Radio behaviour: selecting the active sector clears it; selecting another replaces it.
    const newSectors = filters.selectedSectors.includes(sectorId) ? [] : [sectorId];
    onFilterChange({ ...filters, selectedSectors: newSectors });
  };

  const toggleHazard = (hazardId: string) => {
    const newHazards = filters.selectedHazards.includes(hazardId)
      ? filters.selectedHazards.filter(h => h !== hazardId)
      : [...filters.selectedHazards, hazardId];

    onFilterChange({ ...filters, selectedHazards: newHazards });
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

  const undoClearFilters = () => {
    if (previousFilters) {
      onFilterChange(previousFilters);
      setPreviousFilters(null);
      setShowClearToast(false);
    }
  };

  const aggregationOptions: { value: AggregationLevel; label: string }[] = [
    { value: 'district', label: geographyUi.focusAreaPlural },
    { value: 'province', label: geographyUi.broaderAreaPlural },
    { value: 'national', label: getCountryAggregationLabel(countryCode, 'national') },
  ];

  const sectionTriggerClass =
    'w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-slate-800/45 transition-colors group';
  const accessibilitySectionTriggerClass =
    'w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-slate-800/20 transition-colors group';

  // Track which sectors have data available in actual events
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

  const activeHazardIds = useMemo(() => {
    const hazardIds = new Set<string>();

    events.forEach(event => {
      const normalizedHazardId = normalizeHazardId(event.hazardId);
      hazardIds.add(normalizedHazardId);

      // Treat inundation-backed events as part of the flood UI bucket.
      if (normalizedHazardId === 'inundation') {
        hazardIds.add('flood');
      }

      // Treat wind-backed events as part of the tropical cyclone UI bucket.
      if (normalizedHazardId === 'wind') {
        hazardIds.add('tropical-cyclone');
      }
    });

    return hazardIds;
  }, [events]);

  const hazardsWithAvailability = useMemo(
    () =>
      hazards.map(hazard => ({
        ...hazard,
        isAvailable: activeHazardIds.has(hazard.id),
      })),
    [hazards, activeHazardIds]
  );

  // Show all sectors, but mark unavailable ones
  const sectorsWithAvailability = useMemo(
    () =>
      sectors.map(sector => ({
        ...sector,
        isAvailable: activeSectorIds.has(sector.id),
      })),
    [sectors, activeSectorIds]
  );

  const updateDateRange = (bound: 'start' | 'end', value: string) => {
    const nextDateRange = { ...filters.dateRange, [bound]: value };

    if (nextDateRange.start && nextDateRange.end && nextDateRange.start > nextDateRange.end) {
      if (bound === 'start') {
        nextDateRange.end = value;
      } else {
        nextDateRange.start = value;
      }
    }

    onFilterChange({
      ...filters,
      dateRange: nextDateRange,
    });
  };

  return (
    <div className="w-full border-r border-cyan-500/15 bg-gradient-to-b from-slate-950/95 via-slate-900/95 to-slate-950/95 shadow-[inset_-1px_0_0_rgba(34,211,238,0.08)] flex flex-col flex-shrink-0 h-full min-h-0 overflow-hidden isolate md:w-80">
      <div className="flex-1 overflow-y-auto overscroll-contain overflow-x-hidden">
        <div className="px-4 py-3 border-b border-cyan-500/15 bg-slate-900/35">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 aria-label="Filters" className="text-sm font-bold text-white tracking-tight">
                Data Filters
              </h2>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold bg-cyan-500/15 text-cyan-200 rounded border border-cyan-500/30">
                <span className="w-1 h-1 rounded-full bg-cyan-300"></span>
                LIVE
              </span>
            </div>
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`px-2.5 py-1 text-xs font-semibold border rounded-lg transition-colors ${
                showAdvancedFilters
                  ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                  : 'bg-slate-800/60 text-slate-300 border-slate-600/50 hover:bg-slate-700/60'
              }`}
              aria-label={showAdvancedFilters ? 'Hide advanced filters' : 'Show advanced filters'}
              aria-pressed={showAdvancedFilters}
            >
              {showAdvancedFilters ? '← Basic' : 'Advanced →'}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            {showAdvancedFilters ? 'Advanced filter options' : 'Choose which data to analyze'}
          </p>
        </div>

        <div>
          {/* Data Filters Group */}
          <div className="mx-3 mt-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/0 via-cyan-500/30 to-cyan-500/0"></div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-cyan-300/90 px-2">
                Data Filters
              </h3>
              <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/0 via-cyan-500/30 to-cyan-500/0"></div>
            </div>
            <p className="text-[10px] text-slate-400 mb-2 px-1">
              Narrow the dataset by event, date, area level, and sector.
            </p>
          </div>

          {/* Temporal Filters Section - Only show when multiple events exist */}
          {events.length > 1 && (
            <div className="mx-3 mt-2 rounded-xl border border-slate-700/50 bg-slate-900/45 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('temporal')}
                id={accordionIds.temporal.button}
                aria-expanded={expandedSections.temporal}
                aria-controls={accordionIds.temporal.panel}
                aria-label="Temporal filters"
                className={sectionTriggerClass}
              >
                <Calendar className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                <h3 className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                  Events & Time
                </h3>
                {filters.selectedEvents.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/30">
                    {filters.selectedEvents.length}
                  </span>
                )}
                {!expandedSections.temporal && (
                  <span className="text-[10px] text-slate-400 ml-auto mr-2">
                    {filters.selectedEvents.length > 0
                      ? `${filters.selectedEvents.length} event${filters.selectedEvents.length !== 1 ? 's' : ''}`
                      : 'All'}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expandedSections.temporal ? 'rotate-180' : ''} ${!expandedSections.temporal ? 'ml-auto' : ''}`}
                />
              </button>
              {expandedSections.temporal && (
                <div
                  id={accordionIds.temporal.panel}
                  role="region"
                  aria-labelledby={accordionIds.temporal.button}
                  className="px-4 pb-3 space-y-2 border-t border-slate-700/40 bg-slate-900/35"
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
                        max={filters.dateRange.end || undefined}
                        onChange={e => updateDateRange('start', e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-600/60 hover:border-cyan-500/40 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 rounded-lg bg-slate-950/50 text-white transition-colors"
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
                        min={filters.dateRange.start || undefined}
                        onChange={e => updateDateRange('end', e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-600/60 hover:border-cyan-500/40 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 rounded-lg bg-slate-950/50 text-white transition-colors"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Filter the time window for what appears in the map and summaries.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {showAdvancedFilters && (
            <>
              <div className="mx-3 mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/0 via-cyan-500/20 to-cyan-500/0"></div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-cyan-300/70 px-2">
                    Advanced
                  </h3>
                  <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/0 via-cyan-500/20 to-cyan-500/0"></div>
                </div>
              </div>

              <div className="mx-3 mt-2 rounded-xl border border-slate-700/50 bg-slate-900/45 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('hazards')}
                  id={accordionIds.hazards.button}
                  aria-expanded={expandedSections.hazards}
                  aria-controls={accordionIds.hazards.panel}
                  aria-label="Hazards"
                  className={sectionTriggerClass}
                >
                  <Wind className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <h3 className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                    Hazards
                  </h3>
                  {filters.selectedHazards.length > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/30">
                      {filters.selectedHazards.length}
                    </span>
                  )}
                  {!expandedSections.hazards && (
                    <span className="text-[10px] text-slate-400 ml-auto mr-2">
                      {filters.selectedHazards.length > 0
                        ? `${filters.selectedHazards.length} selected`
                        : `All ${hazardsWithAvailability.filter(h => h.isAvailable).length}`}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expandedSections.hazards ? 'rotate-180' : ''} ${!expandedSections.hazards ? 'ml-auto' : ''}`}
                  />
                </button>
                {expandedSections.hazards && (
                  <div
                    id={accordionIds.hazards.panel}
                    role="region"
                    aria-labelledby={accordionIds.hazards.button}
                    className="px-4 pb-3 border-t border-slate-700/40 bg-slate-900/35"
                  >
                    {hazardsWithAvailability.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic py-2">
                        No hazard data available
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {hazardsWithAvailability.map(hazard => {
                          const HazardIcon = hazard.icon;

                          return (
                            <label
                              key={hazard.id}
                              htmlFor={`hazard-${hazard.id}`}
                              className={`flex items-center gap-2 group relative px-2 py-1.5 rounded-lg transition-colors ${
                                hazard.isAvailable
                                  ? 'cursor-pointer hover:bg-slate-800/50'
                                  : 'cursor-not-allowed opacity-50'
                              }`}
                              title={!hazard.isAvailable ? 'No data available for this hazard' : ''}
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
                                  className="appearance-none w-4 h-4 border border-slate-500/80 rounded cursor-pointer transition-colors hover:border-cyan-400 checked:border-cyan-400 checked:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                                {filters.selectedHazards.includes(hazard.id) && (
                                  <Check
                                    className="absolute w-3 h-3 text-cyan-400 pointer-events-none"
                                    strokeWidth={3}
                                  />
                                )}
                              </div>
                              <HazardIcon className="w-3.5 h-3.5 text-slate-300" />
                              <span className="text-xs text-slate-300 group-hover:text-white flex-1 transition-colors">
                                {hazard.name}
                              </span>
                              {!hazard.isAvailable && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-600/85 text-slate-100 border border-slate-500/80 font-semibold">
                                  No data
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mx-3 mt-2 rounded-xl border border-slate-700/50 bg-slate-900/45 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('aggregation')}
                  id={accordionIds.aggregation.button}
                  aria-expanded={expandedSections.aggregation}
                  aria-controls={accordionIds.aggregation.panel}
                  aria-label="Aggregation"
                  className={sectionTriggerClass}
                >
                  <Target className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  <h3 className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                    Geography Level
                  </h3>
                  {!expandedSections.aggregation && (
                    <span className="text-[10px] text-slate-400 ml-auto mr-2">
                      {filters.aggregationLevel.charAt(0).toUpperCase() +
                        filters.aggregationLevel.slice(1)}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expandedSections.aggregation ? 'rotate-180' : ''} ${!expandedSections.aggregation ? 'ml-auto' : ''}`}
                  />
                </button>
                {expandedSections.aggregation && (
                  <div
                    id={accordionIds.aggregation.panel}
                    role="region"
                    aria-labelledby={accordionIds.aggregation.button}
                    className="px-4 pb-3 space-y-1 border-t border-slate-700/40 bg-slate-900/35"
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
                            className="appearance-none w-4 h-4 border border-slate-500/80 rounded-full cursor-pointer transition-colors hover:border-cyan-400 checked:border-cyan-400 checked:bg-cyan-500/20"
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

              <div className="mx-3 mt-2 rounded-xl border border-rose-500/20 bg-rose-950/10 overflow-hidden">
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="w-full px-4 py-2.5 text-left text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-500/10"
                  aria-label="Clear all filters"
                >
                  Clear All Filters
                </button>
              </div>
            </>
          )}

          {/* Sectors Section - Compact */}
          <div className="mx-3 mt-2 rounded-xl border border-slate-700/50 bg-slate-900/45 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('sectors')}
              id={accordionIds.sectors.button}
              aria-expanded={expandedSections.sectors}
              aria-controls={accordionIds.sectors.panel}
              aria-label="Sectors"
              className={sectionTriggerClass}
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
                <span className="text-[10px] text-slate-400 ml-auto mr-2">
                  {filters.selectedSectors.length > 0
                    ? `${filters.selectedSectors.length} selected`
                    : `All ${sectorsWithAvailability.filter(s => s.isAvailable).length}`}
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expandedSections.sectors ? 'rotate-180' : ''} ${!expandedSections.sectors ? 'ml-auto' : ''}`}
              />
            </button>
            {expandedSections.sectors && (
              <div
                id={accordionIds.sectors.panel}
                role="region"
                aria-labelledby={accordionIds.sectors.button}
                className="px-4 pb-3 border-t border-slate-700/40 bg-slate-900/35"
              >
                {sectorsWithAvailability.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic py-2">No sector data available</p>
                ) : (
                  <div role="radiogroup" aria-label="Sectors" className="space-y-1 mt-2">
                    {sectorsWithAvailability.map(sector => {
                      const isChecked = filters.selectedSectors.includes(sector.id);
                      return (
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
                          <input
                            id={`sector-${sector.id}`}
                            type="radio"
                            name="sectors"
                            value={sector.id}
                            checked={isChecked}
                            onChange={() => sector.isAvailable && toggleSector(sector.id)}
                            onClick={() =>
                              sector.isAvailable && isChecked && toggleSector(sector.id)
                            }
                            disabled={!sector.isAvailable}
                            className="w-4 h-4 border-slate-500/80 bg-slate-800 text-cyan-500 accent-cyan-500 cursor-pointer focus:ring-2 focus:ring-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-slate-700/30"
                            style={{ backgroundColor: sector.color }}
                          />
                          <span className="text-xs text-slate-300 group-hover:text-white flex-1 transition-colors">
                            {sector.name}
                          </span>
                          {!sector.isAvailable && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-600/85 text-slate-100 border border-slate-500/80 font-semibold">
                              No data
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Accessibility Group */}
          <div className="mx-3 mt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-gradient-to-r from-slate-700/0 via-slate-700/30 to-slate-700/0"></div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400/90 px-2">
                Accessibility
              </h3>
              <div className="h-px flex-1 bg-gradient-to-r from-slate-700/0 via-slate-700/30 to-slate-700/0"></div>
            </div>
          </div>
          <div
            className="mx-3 mt-2 mb-2 rounded-xl border border-slate-600/30 bg-slate-900/25 overflow-hidden"
            role="region"
            aria-label="Accessibility tools"
          >
            <button
              type="button"
              onClick={() => setIsDistrictListOpen(!isDistrictListOpen)}
              className={accessibilitySectionTriggerClass}
              aria-expanded={isDistrictListOpen}
            >
              <Keyboard className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <h3 className="text-xs font-semibold text-slate-400 group-hover:text-slate-300 transition-colors">
                Keyboard access
              </h3>
              {!isDistrictListOpen && (
                <span className="text-[10px] text-slate-400 ml-auto mr-2">
                  {geographyUi.focusAreaSingular} list
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isDistrictListOpen ? 'rotate-180' : ''} ${!isDistrictListOpen ? 'ml-auto' : ''}`}
              />
            </button>
            {isDistrictListOpen && (
              <div className="px-4 pb-3 border-t border-slate-600/25 bg-slate-900/20">
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
                  <div className="mt-2 rounded-lg border border-dashed border-slate-700/40 px-2 py-1.5 text-[10px] text-slate-400">
                    No {geographyUi.focusAreaSingular.toLowerCase()} data available.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Keyboard Navigation Help - Compact */}
        <div className="px-4 py-2 border-t border-slate-700/50 bg-slate-900/45">
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
                <span className="text-slate-400">Navigate</span>
                <kbd className="px-1.5 py-0.5 bg-slate-800/60 border border-slate-700/50 rounded text-slate-400 font-mono text-[9px]">
                  Tab
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1 px-1.5 rounded hover:bg-slate-800/30">
                <span className="text-slate-400">Toggle</span>
                <kbd className="px-1.5 py-0.5 bg-slate-800/60 border border-slate-700/50 rounded text-slate-400 font-mono text-[9px]">
                  Space
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1 px-1.5 rounded hover:bg-slate-800/30">
                <span className="text-slate-400">Close</span>
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
