import { useCallback, useEffect, useRef, useState } from 'react';
import type { EventRecord } from '@/data/eventRecords';
import { findNewerAdvisory } from '@/utils/newAdvisory';
import { fetchEventRecords } from '@/utils/realDataLoader';

export const ADVISORY_POLL_MS = 60_000;

/**
 * Watches for an advisory issued after the page loaded. The dashboard only
 * fetched data on page open, so someone following a live storm saw nothing new
 * until they reloaded. This checks once a minute (and when the tab comes back
 * into view) and reports the newest one, without changing what is on screen:
 * the person reading decides when to switch.
 */
export function useNewAdvisory({
  countryCode,
  known,
  enabled,
  pollMs = ADVISORY_POLL_MS,
  fetchRecords = fetchEventRecords,
}: {
  countryCode: string;
  /** The advisories the page already has */
  known: EventRecord[];
  enabled: boolean;
  pollMs?: number;
  fetchRecords?: (countryCode: never, signal?: AbortSignal) => Promise<EventRecord[]>;
}) {
  const [found, setFound] = useState<EventRecord | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const knownRef = useRef(known);
  useEffect(() => {
    knownRef.current = known;
  }, [known]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let cancelled = false;
    const check = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const fresh = await fetchRecords(countryCode as never, controller.signal);
        if (!cancelled) setFound(findNewerAdvisory(knownRef.current, fresh, countryCode));
      } catch {
        // A failed check is not news; the next one tries again
      }
    };
    const timer = setInterval(check, pollMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [countryCode, enabled, pollMs, fetchRecords]);

  // Once the page has caught up with it (it was loaded), it is no longer news
  const stillNew = found && findNewerAdvisory(known, [found], countryCode) ? found : null;
  const advisory = stillNew && stillNew.id !== dismissedId ? stillNew : null;
  const dismiss = useCallback(() => setDismissedId(found?.id ?? null), [found]);
  return { advisory, dismiss };
}
