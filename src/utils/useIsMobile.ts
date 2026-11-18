import { useSyncExternalStore } from 'react';

/**
 * The phone layout applies below the desktop breakpoint, 768px (Tailwind's `md`). One definition, so the
 * shell, the map padding and the tests cannot disagree about where the layouts change.
 */
export const DESKTOP_MIN_WIDTH = 768;
export const MOBILE_MEDIA_QUERY = `(max-width: ${DESKTOP_MIN_WIDTH - 0.02}px)`;

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(MOBILE_MEDIA_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia(MOBILE_MEDIA_QUERY).matches
  );
}

/**
 * Whether the phone layout is showing. The server renders the desktop layout, so a phone repaints once
 * after hydration; callers must not use this to decide anything that changes data or URLs.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
