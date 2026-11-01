'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Wrench } from 'lucide-react';

export interface ToolsMenuItem {
  id: string;
  label: string;
  /** What choosing it does, shown under the label */
  hint?: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Reflects an on/off panel the item controls */
  pressed?: boolean;
  hidden?: boolean;
}

interface ToolsMenuProps {
  items: ToolsMenuItem[];
  className?: string;
}

/** Secondary actions (map controls, metadata, compare, tour...) behind one button. */
export default function ToolsMenu({ items, className = '' }: ToolsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const menuId = useId();
  const visibleItems = items.filter(item => !item.hidden);

  useEffect(() => {
    if (!open) return;
    // The header scrolls horizontally, which would clip an absolutely
    // positioned menu, so it is portalled and placed from the button's rect.
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect) setPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    };
    place();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    // Capture phase, marked handled: the side panels also close on Escape, and should not here
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
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

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-tour="tools-menu"
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-600/60 bg-slate-700/35 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700/55 sm:text-sm"
      >
        <Wrench className="h-4 w-4" aria-hidden="true" />
        <span>Tools</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Tools"
            style={{ position: 'fixed', top: position.top, right: position.right }}
            className="z-[70] w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-700/70 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur"
          >
            {visibleItems.map(item => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                data-tools-item={item.id}
                aria-pressed={item.pressed}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-700/50 ${
                  item.pressed ? 'bg-slate-700/40 text-white' : 'text-slate-200'
                }`}
              >
                {item.icon && <span className="mt-0.5 shrink-0 text-slate-300">{item.icon}</span>}
                <span className="min-w-0">
                  <span className="block font-medium">{item.label}</span>
                  {item.hint && (
                    <span className="block text-[11px] text-slate-400">{item.hint}</span>
                  )}
                </span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
