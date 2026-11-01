import { areasHoldingShare } from '@/utils/damageConcentration';

describe('areasHoldingShare', () => {
  it('counts the fewest areas, largest first, that reach the share', () => {
    // Rarotonga holds 87%: it and the next area reach 90%
    expect(areasHoldingShare([87, 6, 4, 2, 1, 0], 0.9)).toBe(2);
    expect(areasHoldingShare([25, 25, 25, 25], 0.9)).toBe(4);
  });

  it('is 0 when there is no damage', () => {
    expect(areasHoldingShare([0, 0], 0.9)).toBe(0);
    expect(areasHoldingShare([], 0.9)).toBe(0);
  });
});
