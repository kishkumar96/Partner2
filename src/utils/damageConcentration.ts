/**
 * The fewest areas whose damage together reaches `share` of the total (0.9 for 90%), counting the
 * largest first. Where one island holds most of the loss, this says so where an average cannot.
 */
export function areasHoldingShare(damages: number[], share: number): number {
  const sorted = damages.filter(value => value > 0).sort((a, b) => b - a);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 0;
  let running = 0;
  for (let index = 0; index < sorted.length; index++) {
    running += sorted[index];
    if (running >= total * share) return index + 1;
  }
  return sorted.length;
}
