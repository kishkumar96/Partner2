import { defaultThresholds, sanitizeThresholds, type PriorityThresholds } from './responsePriority';

/**
 * Priority thresholds are kept per country, under a key that names the
 * country, so what is set for one country never applies to another.
 */
export const priorityStorageKey = (countryCode: string) =>
  `pdie.priorityThresholds.v1.${countryCode.toUpperCase()}`;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const browserStorage = (): StorageLike | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** What this country has saved, or the defaults. Never throws. */
export function loadThresholds(
  countryCode: string,
  storage: StorageLike | null = browserStorage()
): { thresholds: PriorityThresholds; isCustom: boolean } {
  try {
    const raw = storage?.getItem(priorityStorageKey(countryCode));
    if (raw) return { thresholds: sanitizeThresholds(JSON.parse(raw)), isCustom: true };
  } catch {
    // Unreadable or blocked storage: use the defaults
  }
  return { thresholds: defaultThresholds(), isCustom: false };
}

export function saveThresholds(
  countryCode: string,
  thresholds: PriorityThresholds,
  storage: StorageLike | null = browserStorage()
): boolean {
  try {
    storage?.setItem(priorityStorageKey(countryCode), JSON.stringify(thresholds));
    return !!storage;
  } catch {
    return false;
  }
}

export function resetThresholds(
  countryCode: string,
  storage: StorageLike | null = browserStorage()
): void {
  try {
    storage?.removeItem(priorityStorageKey(countryCode));
  } catch {
    // Nothing to clear
  }
}
