'use client';

import { useState, useMemo, useEffect } from 'react';
import { District, Event, Hazard } from '@/types';
import { Search, X, CheckSquare, Square } from 'lucide-react';

interface SearchableEventSelectorProps {
  events: Event[];
  selectedEvents: string[];
  onToggleEvent: (eventId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onSelectFiltered?: (filteredEventIds: string[]) => void; // Optional: Select only filtered results
  districts?: District[];
  hazards?: Hazard[];
}

export default function SearchableEventSelector({
  events,
  selectedEvents,
  onToggleEvent,
  onSelectAll,
  onClearAll,
  onSelectFiltered,
  districts = [],
  hazards = [],
}: SearchableEventSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const districtNameById = useMemo(() => {
    return new Map(districts.map(district => [district.id, district.name]));
  }, [districts]);

  const hazardNameById = useMemo(() => {
    return new Map(hazards.map(hazard => [hazard.id, hazard.name]));
  }, [hazards]);

  // Filter events by search query
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const query = searchQuery.toLowerCase();
    return events.filter(event => {
      const districtName = districtNameById.get(event.districtId || '');
      const hazardName = hazardNameById.get(event.hazardId);
      const searchableText = [
        event.name,
        event.districtId,
        districtName,
        event.hazardId,
        hazardName,
        event.date,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchableText.includes(query);
    });
  }, [events, searchQuery, districtNameById, hazardNameById]);

  // Paginate filtered results
  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredEvents.slice(start, start + itemsPerPage);
  }, [filteredEvents, currentPage]);

  // Clamp current page to valid range (derived value)
  const validCurrentPage = useMemo(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      return totalPages;
    }
    return currentPage;
  }, [totalPages, currentPage]);

  // Reset to page 1 when search changes
  useEffect(() => {
    Promise.resolve().then(() => {
      setCurrentPage(1);
    });
  }, [searchQuery]);

  // Update state if clamping occurred
  useEffect(() => {
    if (validCurrentPage !== currentPage) {
      Promise.resolve().then(() => {
        setCurrentPage(validCurrentPage);
      });
    }
  }, [validCurrentPage, currentPage]);

  return (
    <div className="space-y-3">
      {/* Premium Search Bar */}
      <div className="relative group">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-400 transition-colors duration-200" />
        <input
          id="event-search"
          name="eventSearch"
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search events by name, hazard, or date..."
          aria-label="Search events by name, hazard, or date"
          className="w-full pl-10 pr-10 py-2.5 bg-slate-800/80 border-2 border-slate-600 rounded-xl text-sm font-medium text-white placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 backdrop-blur-sm hover:border-slate-500"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-600 rounded-lg p-1 transition-all duration-200 hover:scale-110 active:scale-95"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Results Summary & Actions */}
      <div className="flex items-center justify-between text-xs bg-gradient-to-r from-slate-800/60 to-slate-700/40 rounded-xl px-3 py-2.5 border border-slate-700/50">
        <span aria-live="polite" aria-atomic="true" className="font-semibold text-slate-300">
          {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}{' '}
          {searchQuery && `(filtered from ${events.length})`}
          {selectedEvents.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded-md border border-blue-500/30">
              {selectedEvents.length} selected
            </span>
          )}
        </span>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => {
              // If onSelectFiltered is provided and there's filtering active, select filtered only
              if (onSelectFiltered && (searchQuery || filteredEvents.length < events.length)) {
                onSelectFiltered(filteredEvents.map(e => e.id));
              } else {
                // Otherwise select all events
                onSelectAll();
              }
            }}
            className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 px-2 py-1 rounded-lg transition-all duration-200 font-bold hover:scale-105 active:scale-95"
            title={
              searchQuery || filteredEvents.length < events.length
                ? 'Select all filtered events'
                : 'Select all events'
            }
          >
            Select {searchQuery || filteredEvents.length < events.length ? 'filtered' : 'all'}
          </button>
          <span className="text-slate-600">|</span>
          <button
            type="button"
            onClick={onClearAll}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-500/10 px-2 py-1 rounded-lg transition-all duration-200 font-semibold hover:scale-105 active:scale-95"
          >
            Clear selection
          </button>
        </div>
      </div>

      {/* Premium Event List */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          Showing {paginatedEvents.length} of {filteredEvents.length}
        </span>
        <span className="font-semibold text-slate-300">Selected: {selectedEvents.length}</span>
      </div>
      <div className="max-h-64 max-h-[min(16rem,calc(100vh-400px))] overflow-y-auto border-2 border-slate-700 rounded-xl bg-slate-900/30 backdrop-blur-sm custom-scrollbar">
        {paginatedEvents.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800/50 flex items-center justify-center">
              <Search className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-400 mb-2">No events found</p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs text-blue-400 hover:text-blue-300 font-bold hover:bg-blue-500/10 px-3 py-1.5 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {paginatedEvents.map(event => {
              const isSelected = selectedEvents.includes(event.id);
              const hazardName = hazardNameById.get(event.hazardId) || event.hazardId;
              const districtName = districtNameById.get(event.districtId || '');
              const metadata = [hazardName, districtName, event.date].filter(Boolean).join(' • ');
              return (
                <label
                  key={event.id}
                  htmlFor={`event-${event.id}`}
                  className="flex items-start gap-3 p-3 hover:bg-gradient-to-r hover:from-slate-800/70 hover:to-slate-700/40 cursor-pointer transition-all duration-200 group hover:scale-[1.01] focus-within:ring-2 focus-within:ring-blue-400/40 focus-within:ring-inset"
                >
                  <input
                    id={`event-${event.id}`}
                    name="selectedEvents"
                    type="checkbox"
                    value={event.id}
                    checked={isSelected}
                    onChange={() => onToggleEvent(event.id)}
                    className="mt-1 sr-only peer"
                    aria-label={`Select ${event.name}`}
                  />
                  <div
                    className={`mt-0.5 transition-all duration-200 ${
                      isSelected
                        ? 'text-blue-400 scale-110'
                        : 'text-slate-400 group-hover:text-slate-400'
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 flex-shrink-0" />
                    ) : (
                      <Square className="w-5 h-5 flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-slate-200 group-hover:text-white truncate transition-colors">
                      {event.name}
                    </div>
                    <div className="text-xs text-slate-400 mt-1 font-medium">{metadata}</div>
                  </div>
                  <div
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex-shrink-0 border transition-all duration-200 group-hover:scale-105 ${
                      event.severity === 'critical'
                        ? 'bg-red-500/20 text-red-300 border-red-500/30'
                        : event.severity === 'high'
                          ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                          : event.severity === 'medium'
                            ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                            : 'bg-slate-700 text-slate-300 border-slate-600'
                    }`}
                  >
                    {event.severity}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Premium Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 text-sm bg-gradient-to-br from-slate-800 to-slate-700 text-slate-200 font-bold rounded-xl hover:from-slate-700 hover:to-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 border border-slate-600 hover:border-slate-500 hover:scale-105 active:scale-95 disabled:scale-100"
          >
            Previous
          </button>
          <span className="text-xs text-slate-300 font-bold bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 text-sm bg-gradient-to-br from-slate-800 to-slate-700 text-slate-200 font-bold rounded-xl hover:from-slate-700 hover:to-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 border border-slate-600 hover:border-slate-500 hover:scale-105 active:scale-95 disabled:scale-100"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
