"use client";

import { useState, type ReactNode } from "react";
import { FilterState, Hazard, Sector } from "@/types";
import { X, Filter } from "lucide-react";

interface ActiveFiltersProps {
  filters: FilterState;
  hazards: Hazard[];
  sectors: Sector[];
  onClearFilter: (type: 'hazard' | 'sector' | 'event' | 'all', id?: string) => void;
  className?: string;
}

export default function ActiveFilters({
  filters,
  hazards,
  sectors,
  onClearFilter,
  className = "",
}: ActiveFiltersProps) {
  const [showAllChips, setShowAllChips] = useState(false);
  const activeHazards = filters.selectedHazards;
  const activeSectors = filters.selectedSectors;
  const activeEventCount = filters.selectedEvents.length;
  
  const hasActiveFilters = 
    activeHazards.length > 0 || 
    activeSectors.length > 0 || 
    activeEventCount > 0 ||
    filters.dateRange.start ||
    filters.dateRange.end;

  if (!hasActiveFilters) {
    return (
      <div className={`flex items-center gap-2 text-xs text-slate-400 ${className}`}>
        <Filter className="w-3.5 h-3.5" />
        <span>No filters applied</span>
      </div>
    );
  }

  const chips: ReactNode[] = [];

  activeHazards.forEach((hazardId) => {
    const hazard = hazards.find(h => h.id === hazardId);
    if (!hazard) return;
    chips.push(
      <button
        key={`hazard-${hazardId}`}
        onClick={() => onClearFilter('hazard', hazardId)}
        className="inline-flex items-center gap-1.5 px-2 py-1 bg-red-500/20 text-red-300 rounded-full text-xs font-medium border border-red-500/30 hover:bg-red-500/30 transition-colors group"
        title={`Remove ${hazard.name} filter`}
      >
        <span>{hazard.icon}</span>
        <span>{hazard.name}</span>
        <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
      </button>
    );
  });

  activeSectors.forEach((sectorId) => {
    const sector = sectors.find(s => s.id === sectorId);
    if (!sector) return;
    chips.push(
      <button
        key={`sector-${sectorId}`}
        onClick={() => onClearFilter('sector', sectorId)}
        className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs font-medium border border-blue-500/30 hover:bg-blue-500/30 transition-colors group"
        title={`Remove ${sector.name} filter`}
      >
        <span>{sector.icon}</span>
        <span>{sector.name}</span>
        <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
      </button>
    );
  });

  if (activeEventCount > 0) {
    chips.push(
      <button
        key="events"
        onClick={() => onClearFilter('event')}
        className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs font-medium border border-blue-500/30 hover:bg-blue-500/30 transition-colors group"
        title="Clear event selection"
      >
        <span>{activeEventCount} event{activeEventCount !== 1 ? 's' : ''}</span>
        <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
      </button>
    );
  }

  if (filters.dateRange.start || filters.dateRange.end) {
    chips.push(
      <div
        key="date-range"
        className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-800/70 text-slate-300 rounded-full text-xs font-medium border border-slate-700/60"
      >
        <span>📅</span>
        <span>
          {filters.dateRange.start || '...'} - {filters.dateRange.end || '...'}
        </span>
      </div>
    );
  }

  const maxChips = 4;
  const visibleChips = showAllChips ? chips : chips.slice(0, maxChips);
  const hiddenCount = chips.length - visibleChips.length;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 flex-shrink-0">
        <Filter className="w-3.5 h-3.5" />
        <span>Active:</span>
      </div>
      
      <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto overscroll-x-contain">
        {visibleChips}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAllChips(true)}
            className="inline-flex items-center gap-1 px-2 py-1 bg-slate-800/70 text-slate-300 rounded-full text-xs font-medium border border-slate-700/60 hover:bg-slate-700/70 transition-colors"
            title={`${hiddenCount} more filters applied`}
          >
            +{hiddenCount} more
          </button>
        )}
        {showAllChips && chips.length > maxChips && (
          <button
            type="button"
            onClick={() => setShowAllChips(false)}
            className="inline-flex items-center gap-1 px-2 py-1 bg-slate-800/70 text-slate-300 rounded-full text-xs font-medium border border-slate-700/60 hover:bg-slate-700/70 transition-colors"
          >
            Show less
          </button>
        )}
      </div>

      {hasActiveFilters && (
        <button
          onClick={() => onClearFilter('all')}
          className="inline-flex items-center gap-1 px-2 py-1 bg-slate-800/70 text-slate-300 rounded-full text-xs font-medium border border-slate-700/60 hover:bg-slate-700/70 transition-colors flex-shrink-0"
          title="Clear all filters"
        >
          <span>Clear all</span>
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
