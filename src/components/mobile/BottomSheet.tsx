'use client';

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { sheetDragOutcome } from '@/utils/sheetDrag';
import type { SheetHeight } from '@/utils/mobilePanel';

/**
 * The one bottom sheet the phone layout uses for every panel (context, layers, impacts, more, place).
 *
 * - It sits between the header and the navigation, at half height or expanded, and the wrapper around it
 *   lets pointer events through, so the map above a half-height sheet stays usable.
 * - Only the handle drags. The content scrolls on its own, so scrolling a list never moves the sheet.
 * - Visible buttons expand/collapse and close it; dragging is an extra, not the only way.
 * - Half height is a region: focus moves in when it opens, but nothing is trapped, so the map and the
 *   navigation stay reachable. Expanded is a modal dialog: focus is trapped, and the page behind it (which
 *   the sheet fully covers) is the caller's to make inert through `onModalChange`.
 * - Escape closes it, and focus returns to what had it before the sheet opened.
 */

export interface BottomSheetProps {
  open: boolean;
  /** The sheet's name for screen readers, and its visible heading */
  title: string;
  height: SheetHeight;
  onHeightChange: (height: SheetHeight) => void;
  onClose: () => void;
  children: ReactNode;
  /** CSS lengths for the room the sheet leaves for the header above and the navigation below */
  topInset?: string;
  bottomInset?: string;
  /** Called with true while the sheet is expanded (a modal), so the map behind it can be made inert */
  onModalChange?: (modal: boolean) => void;
}

/** The frame the sheet lives in: below the header and above the navigation, clear of the device's safe areas */
export function sheetFrameStyle(topInset: string, bottomInset: string) {
  return {
    top: `calc(${topInset} + env(safe-area-inset-top, 0px))`,
    bottom: `calc(${bottomInset} + env(safe-area-inset-bottom, 0px))`,
  };
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function BottomSheet({
  open,
  title,
  height,
  onHeightChange,
  onClose,
  children,
  topInset = 'var(--mobile-header-height, 3.5rem)',
  bottomInset = 'var(--mobile-nav-height, 3rem)',
  onModalChange,
}: BottomSheetProps) {
  const headingId = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const modal = open && height === 'expanded';

  // Remember who had focus before the sheet opened, move focus in, and give it back on close
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    headingRef.current?.focus();
    return () => {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (target && document.contains(target)) target.focus();
    };
  }, [open]);

  useEffect(() => {
    onModalChange?.(modal);
    return () => onModalChange?.(false);
  }, [modal, onModalChange]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !modal || !sheetRef.current) return;
      const items = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        el => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true'
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (
        event.shiftKey &&
        (active === first || active === sheetRef.current || active === headingRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [modal, onClose]
  );

  if (!open) return null;

  const onPointerDown = (event: React.PointerEvent) => {
    dragStartRef.current = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const finishDrag = (event: React.PointerEvent) => {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (start === null) return;
    const outcome = sheetDragOutcome(event.clientY - start, height);
    if (outcome === 'expand') onHeightChange('expanded');
    else if (outcome === 'collapse') onHeightChange('half');
    else if (outcome === 'close') onClose();
  };

  const expanded = height === 'expanded';
  const button =
    'inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-200 hover:bg-slate-700/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400';

  return (
    // The wrapper is only a positioning frame between header and navigation: it lets touches through
    <div
      className="pointer-events-none fixed inset-x-0 z-40"
      style={sheetFrameStyle(topInset, bottomInset)}
    >
      <section
        ref={sheetRef}
        role={modal ? 'dialog' : 'region'}
        aria-modal={modal ? true : undefined}
        aria-labelledby={headingId}
        data-height={height}
        onKeyDown={onKeyDown}
        className={`pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl border border-b-0 border-slate-700/70 bg-slate-900 text-slate-100 shadow-[0_-8px_24px_rgba(0,0,0,0.45)] transition-[height] duration-200 motion-reduce:transition-none ${
          expanded ? 'h-full' : 'h-1/2'
        }`}
      >
        <div
          data-testid="sheet-handle"
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerUp={finishDrag}
          onPointerCancel={() => (dragStartRef.current = null)}
          className="flex h-5 flex-shrink-0 cursor-grab touch-none items-center justify-center"
        >
          <span className="h-1 w-10 rounded-full bg-slate-600" />
        </div>
        <header className="flex flex-shrink-0 items-center gap-1 px-3 pb-1">
          <h2
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="min-w-0 flex-1 truncate text-base font-semibold outline-none"
          >
            {title}
          </h2>
          <button
            type="button"
            className={button}
            aria-expanded={expanded}
            aria-label={expanded ? 'Show less of this panel' : 'Show more of this panel'}
            onClick={() => onHeightChange(expanded ? 'half' : 'expanded')}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                d={expanded ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button type="button" className={button} aria-label={`Close ${title}`} onClick={onClose}>
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {/* Its own scroll area: scrolling here never moves the sheet */}
        <div
          data-testid="sheet-content"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 text-base"
        >
          {children}
        </div>
      </section>
    </div>
  );
}
