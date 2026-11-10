'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';
import type { StormGroup } from '@/utils/forecastRuns';
import { utcStamp } from '@/utils/forecastInsight';

export interface ObservedEventOption {
  id: string;
  name: string;
  /** YYYY-MM-DD, or empty when the API gives none */
  date: string;
}

interface EventPickerProps {
  /** What is shown now, e.g. "TC Wati · issued 19 Oct 12:00 UTC" */
  label: string;
  stormGroups: StormGroup[];
  observedEvents: ObservedEventOption[];
  activeId: string | null;
  /** Show this event or advisory: the dashboard switches to its mode */
  onPick: (id: string) => void;
  disabled?: boolean;
}

function eventDate(date: string): string {
  const ms = Date.parse(date);
  if (!date || Number.isNaN(ms)) return 'date not recorded';
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * One place to choose what the dashboard shows, the same in every mode: forecast storms with
 * their advisories nested under them, then observed events. Advisories used to be listed as
 * separate events beside the storms, cut to "Tropica…", in a filter that said "Selected: 0"
 * while one of them was on screen.
 */
export default function EventPicker({
  label,
  stormGroups,
  observedEvents,
  activeId,
  onPick,
  disabled = false,
}: EventPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    // Drawn on the page, not in the header, which would clip it (as the Tools menu is)
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setPosition({ top: rect.bottom + 6, left: Math.max(8, rect.left) });
    };
    place();
    searchRef.current?.focus();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popupRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    // Capture phase, marked handled: the side panels also close on Escape, and should not here
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const wanted = query.trim().toLowerCase();
  const storms = useMemo(
    () =>
      wanted
        ? stormGroups.filter(group => group.storm.toLowerCase().includes(wanted))
        : stormGroups,
    [stormGroups, wanted]
  );
  const observed = useMemo(
    () =>
      wanted
        ? observedEvents.filter(
            event =>
              event.name.toLowerCase().includes(wanted) || event.date.slice(0, 4).includes(wanted)
          )
        : observedEvents,
    [observedEvents, wanted]
  );
  const total = stormGroups.length + observedEvents.length;

  const pick = (id: string) => {
    setOpen(false);
    setQuery('');
    if (id !== activeId) onPick(id);
  };

  const itemClass = (active: boolean) =>
    `flex min-h-[40px] w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
      active ? 'bg-sky-500/15 text-sky-100' : 'text-slate-200 hover:bg-slate-700/50'
    }`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        disabled={disabled || total === 0}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        title="Choose the storm, advisory or event shown"
        // A bordered button with its own label: drawn as plain text, it read as a status line
        // and nobody found that it opens the list
        className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-md border border-sky-400/40 bg-sky-500/10 px-2 py-0.5 text-left text-xs leading-snug text-slate-100 transition-colors hover:border-sky-300/70 hover:bg-sky-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-default disabled:border-slate-600/50 disabled:bg-transparent"
      >
        <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
          Event
        </span>
        <span className="min-w-0 truncate font-semibold">{label}</span>
        {total > 0 && (
          <ChevronDown
            className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        )}
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={popupRef}
            id={listId}
            role="dialog"
            aria-label="Choose an event"
            style={{ position: 'fixed', top: position.top, left: position.left }}
            className="z-[70] flex max-h-[min(70vh,32rem)] w-80 max-w-[calc(100vw-1rem)] flex-col rounded-xl border border-slate-700/70 bg-slate-900/95 shadow-2xl backdrop-blur"
          >
            <label className="flex items-center gap-2 border-b border-slate-700/60 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span className="sr-only">Search events</span>
              <input
                ref={searchRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search storms and events"
                className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
              />
            </label>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
              {storms.length > 0 && (
                <section aria-label="Forecast storms">
                  <h3 className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300/90">
                    Forecast (REF)
                  </h3>
                  {storms.map(group => (
                    <div key={group.storm} className="mb-1">
                      <p className="px-2.5 py-1 text-xs font-semibold text-slate-300">
                        {group.storm}
                        <span className="ml-1.5 font-normal text-slate-500">
                          {group.active ? 'active' : 'past'} · {group.runs.length}{' '}
                          {group.runs.length === 1 ? 'advisory' : 'advisories'}
                        </span>
                      </p>
                      {group.runs.map(run => (
                        <button
                          key={run.id}
                          type="button"
                          onClick={() => pick(run.id)}
                          aria-current={run.id === activeId ? 'true' : undefined}
                          className={itemClass(run.id === activeId)}
                        >
                          <span>Issued {utcStamp(run.issuedAt)}</span>
                          {run.isLatest && (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                              Latest
                            </span>
                          )}
                          {run.status && run.status !== 'complete' && (
                            <span className="text-[11px] text-slate-400">{run.status}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  ))}
                </section>
              )}
              {observed.length > 0 && (
                <section aria-label="Observed events">
                  <h3 className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300/90">
                    Post disaster (observed)
                  </h3>
                  {observed.map(event => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => pick(event.id)}
                      aria-current={event.id === activeId ? 'true' : undefined}
                      className={itemClass(event.id === activeId)}
                    >
                      <span className="min-w-0 truncate">{event.name}</span>
                      <span className="flex-shrink-0 text-xs text-slate-400">
                        {eventDate(event.date)}
                      </span>
                    </button>
                  ))}
                </section>
              )}
              {storms.length === 0 && observed.length === 0 && (
                <p className="px-2.5 py-3 text-sm text-slate-400">Nothing matches “{query}”.</p>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
