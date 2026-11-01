/**
 * Loss the model could not place in a sector arrives as the sector "Unknown". It is real loss
 * (about a quarter of TC Meena's), so charts keep it: named, and listed after the real sectors.
 * Leaving it out made the sector chart add up to less than the headline total.
 */
export const UNCLASSIFIED_SECTOR = 'Unknown';

export function sectorLabel(sector: string | null | undefined): string {
  return !sector || sector === UNCLASSIFIED_SECTOR ? 'Unclassified' : sector;
}

/** Rows sorted by `value`, largest first, with the unclassified row last whatever its size. */
export function sortSectorsUnclassifiedLast<T>(
  rows: T[],
  sectorOf: (row: T) => string | null | undefined,
  value: (row: T) => number
): T[] {
  const unclassified = (row: T) => sectorLabel(sectorOf(row)) === 'Unclassified';
  return [...rows].sort(
    (a, b) => Number(unclassified(a)) - Number(unclassified(b)) || value(b) - value(a)
  );
}
