/**
 * Where a menu drawn on the page goes under its button: right-aligned with it, but never past
 * either edge of the screen. Aligned to the button's right edge alone, the Export menu ran off
 * the left of a phone screen and cut its labels.
 */
export function menuPlacement(
  button: Pick<DOMRect, 'bottom' | 'right'>,
  menuWidth: number,
  viewportWidth: number = typeof window === 'undefined' ? menuWidth : window.innerWidth,
  margin = 8
): { top: number; left: number } {
  const width = Math.min(menuWidth, viewportWidth - margin * 2);
  const left = Math.min(Math.max(margin, button.right - width), viewportWidth - width - margin);
  return { top: button.bottom + margin, left };
}
