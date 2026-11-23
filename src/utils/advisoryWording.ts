import { STALE_AFTER_HOURS } from '@/utils/forecastBriefing';
import { STORM_ACTIVE_WITHIN_HOURS } from '@/utils/forecastRuns';

/**
 * What to call the newest advisory of a storm, from how old it is: one rule, so the storm picker, the
 * "Latest" badge and the banner can never disagree.
 *
 * They used to. A storm was "past" after 72 hours, the newest advisory was "Latest" however old, and the
 * banner told people to "check for newer" after 12: so a storm five days quiet was past, latest and possibly
 * superseded all at once. The dashboard can only know what it has received, so it says that, and says when
 * the quiet has gone on long enough that the storm may be over. It cannot tell a finished storm from a feed
 * that has stopped, and does not pretend to.
 *
 *   up to 12 h        current  the newest advisory, nothing to add (12 h is when the banner has always appeared)
 *   12 h to 72 h      overdue  still the newest, but nothing newer has come in
 *   over 72 h         quiet    "Last received", and the storm may be over (the picker calls it past)
 *
 * Separate rule, not changed here: priorities are greyed out after 24 h (responsePriority staleAfterHours).
 */
export type NewestAdvisoryState = 'current' | 'overdue' | 'quiet';

export function newestAdvisoryState(
  hours: number | null | undefined,
  staleAfterHours: number = STALE_AFTER_HOURS
): NewestAdvisoryState {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return 'overdue';
  if (hours > STORM_ACTIVE_WITHIN_HOURS) return 'quiet';
  return hours > staleAfterHours ? 'overdue' : 'current';
}

/** The badge on a storm's newest advisory: "Latest" until the quiet is long enough to say "Last received" */
export function newestBadgeLabel(hours: number | null | undefined): 'Latest' | 'Last received' {
  return newestAdvisoryState(hours) === 'quiet' ? 'Last received' : 'Latest';
}

/**
 * What to say about a newest advisory that is not current, in two parts: what the dashboard knows ("nothing
 * newer has come in"), then the limit of that and the action it cannot take for you.
 */
export function noNewerParts(
  hours: number | null | undefined,
  issued: string | null,
  age: string | undefined
): { headline: string; detail: string } {
  const since = issued ? ` since ${issued}${age ? ` (${age})` : ''}` : '';
  const over = newestAdvisoryState(hours) === 'quiet' ? 'The storm may be over. ' : '';
  return {
    headline: `No newer advisory received${since}`,
    detail: `${over}Confirm with the issuing agency before acting.`,
  };
}

export function noNewerSentence(
  hours: number | null | undefined,
  issued: string | null,
  age: string | undefined
): string {
  const { headline, detail } = noNewerParts(hours, issued, age);
  return `${headline}. ${detail}`;
}
