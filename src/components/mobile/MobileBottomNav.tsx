'use client';

import type { ReactNode } from 'react';
import type { MobilePanel } from '@/utils/mobilePanel';

/**
 * The phone layout's bottom navigation: Map, Layers, Impacts, More. Each is a labelled button at least 48px
 * tall (an icon alone is not a label). Map is the plain map: choosing it closes the open sheet. The open
 * destination is marked with `aria-current` and the one selection colour.
 */

export type MobileDestination = 'map' | 'layers' | 'impacts' | 'more';

export interface MobileNavItem {
  id: MobileDestination;
  label: string;
  icon: ReactNode;
}

/** Which destination is lit for the open panel. A place or the context sheet belongs to the map. */
export function activeDestination(panel: MobilePanel): MobileDestination {
  if (panel === 'layers' || panel === 'impacts' || panel === 'more') return panel;
  return 'map';
}

/** Keeps the buttons clear of the home indicator on phones that have one */
export const NAV_SAFE_AREA_PADDING = 'env(safe-area-inset-bottom, 0px)';

export default function MobileBottomNav({
  items,
  panel,
  onSelect,
}: {
  items: MobileNavItem[];
  panel: MobilePanel;
  onSelect: (destination: MobileDestination) => void;
}) {
  const active = activeDestination(panel);
  return (
    <nav
      aria-label="Dashboard sections"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-700/70 bg-slate-900/95 backdrop-blur"
      style={{ paddingBottom: NAV_SAFE_AREA_PADDING }}
    >
      <ul className="grid grid-cols-4">
        {items.map(item => {
          const current = item.id === active;
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-current={current ? 'page' : undefined}
                onClick={() => onSelect(item.id)}
                className={`flex min-h-12 w-full flex-col items-center justify-center gap-0.5 px-1 py-1 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-400 ${
                  current ? 'text-cyan-300' : 'text-slate-300 hover:text-white'
                }`}
              >
                <span aria-hidden="true" className="h-5 w-5">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
