import { menuPlacement } from '@/utils/menuPlacement';

describe('menuPlacement', () => {
  it('right-aligns the menu with its button when there is room', () => {
    expect(menuPlacement({ bottom: 50, right: 1400 }, 288, 1440)).toEqual({ top: 58, left: 1112 });
  });

  it('keeps it on screen when the button is near the left edge of a phone', () => {
    expect(menuPlacement({ bottom: 50, right: 120 }, 288, 390)).toEqual({ top: 58, left: 8 });
  });

  it('fits a screen narrower than the menu', () => {
    expect(menuPlacement({ bottom: 50, right: 300 }, 288, 280)).toEqual({ top: 58, left: 8 });
  });
});
