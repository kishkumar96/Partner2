'use client';

import { useState, useRef, useEffect, type RefObject } from 'react';
import { List, X, Search } from 'lucide-react';
import { formatNumber, formatCurrency } from '@/utils/formatters';

export interface DistrictFeature {
  id: string;
  name: string;
  population: number;
  economicDamageUSD: number;
  buildingCount: number;
  primaryHazard: string;
}

interface MapAccessibleFeaturesProps {
  districts: DistrictFeature[];
  visible?: boolean;
  onDistrictSelect: (districtId: string) => void;
  onClose?: () => void;
  inline?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  showToggle?: boolean;
  defaultOpen?: boolean;
  returnFocusRef?: RefObject<HTMLElement>;
}

/**
 * Provides keyboard-accessible list of map features (districts)
 * for users who cannot interact with the map directly
 */
export default function MapAccessibleFeatures({
  districts,
  visible = false,
  onDistrictSelect,
  onClose,
  inline = false,
  isOpen,
  onOpenChange,
  showToggle = true,
  defaultOpen = false,
  returnFocusRef,
}: MapAccessibleFeaturesProps) {
  const [isOpenInternal, setIsOpenInternal] = useState(defaultOpen);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const resolvedIsOpen = isOpen ?? isOpenInternal;
  const setOpen = (next: boolean) => {
    if (isOpen === undefined) {
      setIsOpenInternal(next);
    }
    onOpenChange?.(next);
    if (!next) {
      onClose?.();
    }
  };

  // Filter districts by search term
  const filteredDistricts = districts.filter(d =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!resolvedIsOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev < filteredDistricts.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredDistricts[focusedIndex]) {
          onDistrictSelect(filteredDistricts[focusedIndex].id);
          setOpen(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  // Scroll focused item into view
  useEffect(() => {
    if (resolvedIsOpen && listRef.current) {
      const focusedElement = listRef.current.querySelector(`[data-index="${focusedIndex}"]`);
      focusedElement?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [focusedIndex, resolvedIsOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (resolvedIsOpen && searchInputRef.current) {
      if (!inline) {
        previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      }
      searchInputRef.current.focus();
    }
  }, [resolvedIsOpen]);

  useEffect(() => {
    if (!resolvedIsOpen && !inline) {
      if (returnFocusRef?.current) {
        returnFocusRef.current.focus();
      } else if (previouslyFocusedRef.current) {
        previouslyFocusedRef.current.focus();
      }
    }
  }, [resolvedIsOpen, inline, returnFocusRef]);

  const getFocusableElements = () => {
    if (!panelRef.current) return [];
    return Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
  };

  const trapFocus = (event: React.KeyboardEvent) => {
    if (inline || event.key !== 'Tab') return;
    const focusable = getFocusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!visible) return null;

  return (
    <>
      {/* Toggle button */}
      {!inline && showToggle && (
        <button
          onClick={() => setOpen(!resolvedIsOpen)}
          className="fixed top-20 right-4 z-[20] glass-panel p-3 rounded-lg shadow-lg hover:bg-white/10 dark:hover:bg-black/20 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 pointer-events-auto"
          aria-label="Open accessible district list"
          aria-expanded={resolvedIsOpen}
          title="View district list (keyboard accessible)"
        >
          <List className="w-5 h-5 text-slate-200" aria-hidden="true" />
          <span className="sr-only">District list for keyboard navigation</span>
        </button>
      )}

      {/* Features panel */}
      {resolvedIsOpen && (
        <div
          className={
            inline
              ? 'relative w-full glass-panel rounded-xl shadow-lg border border-slate-700/50 overflow-hidden pointer-events-auto'
              : 'fixed top-4 right-4 z-[22] w-96 max-w-[calc(100vw-2rem)] glass-panel rounded-xl shadow-2xl border border-slate-700/50 overflow-hidden pointer-events-auto'
          }
          ref={panelRef}
          role={inline ? 'region' : 'dialog'}
          aria-modal={inline ? undefined : true}
          aria-label="District features list"
          onKeyDown={event => {
            handleKeyDown(event);
            trapFocus(event);
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5 dark:bg-black/20">
            <div className="flex items-center gap-2">
              <List className="w-5 h-5 text-blue-400" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-200">
                Districts ({filteredDistricts.length})
              </h2>
            </div>
            <button
              onClick={() => {
                setOpen(false);
              }}
              className="p-1 hover:bg-white/10 dark:hover:bg-black/20 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Close district list"
            >
              <X className="w-5 h-5 text-slate-400" aria-hidden="true" />
            </button>
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b border-white/10 bg-white/5 dark:bg-black/20">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="district-search"
                name="districtSearch"
                ref={searchInputRef}
                type="text"
                placeholder="Search districts..."
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setFocusedIndex(0);
                }}
                className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                aria-label="Search districts"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Use ↑/↓ arrows to navigate, Enter to select, Esc to close
            </p>
          </div>

          {/* Districts list */}
          <div
            ref={listRef}
            className="max-h-96 overflow-y-auto divide-y divide-white/10"
            role="listbox"
            aria-label="District list"
          >
            {filteredDistricts.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">
                No districts found matching &quot;{searchTerm}&quot;
              </div>
            ) : (
              filteredDistricts.map((district, index) => (
                <button
                  key={district.id}
                  data-index={index}
                  onClick={() => {
                    onDistrictSelect(district.id);
                    setOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
                    index === focusedIndex
                      ? 'bg-blue-500/20 border-l-2 border-blue-500'
                      : 'hover:bg-white/5 dark:hover:bg-black/10'
                  }`}
                  role="option"
                  aria-selected={index === focusedIndex}
                  tabIndex={index === focusedIndex ? 0 : -1}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-slate-200 truncate mb-1">
                        {district.name}
                      </h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>Pop: {formatNumber(district.population)}</span>
                        <span>Damage: {formatCurrency(district.economicDamageUSD)}</span>
                        <span>Buildings: {formatNumber(district.buildingCount)}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <span className="inline-block px-2 py-1 text-xs font-medium text-blue-400 bg-blue-500/20 rounded border border-blue-500/30">
                        {district.primaryHazard}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-white/10 bg-white/5 dark:bg-black/20">
            <p className="text-xs text-slate-500">
              Showing {filteredDistricts.length} of {districts.length} districts
            </p>
          </div>
        </div>
      )}
    </>
  );
}
