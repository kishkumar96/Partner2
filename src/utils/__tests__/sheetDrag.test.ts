import { SHEET_DRAG_THRESHOLD, sheetDragOutcome } from '@/utils/sheetDrag';

describe('sheetDragOutcome', () => {
  it('ignores a tap or a slip shorter than the threshold', () => {
    for (const dy of [0, 5, -5, SHEET_DRAG_THRESHOLD - 1, -(SHEET_DRAG_THRESHOLD - 1)]) {
      expect(sheetDragOutcome(dy, 'half')).toBe('none');
      expect(sheetDragOutcome(dy, 'expanded')).toBe('none');
    }
  });

  it('drags a half-height sheet up to expand it, and down to close it', () => {
    expect(sheetDragOutcome(-120, 'half')).toBe('expand');
    expect(sheetDragOutcome(120, 'half')).toBe('close');
  });

  it('drags an expanded sheet down to half height, never straight to closed', () => {
    expect(sheetDragOutcome(120, 'expanded')).toBe('collapse');
    expect(sheetDragOutcome(-120, 'expanded')).toBe('none');
  });

  it('treats a bad number as no drag', () => {
    expect(sheetDragOutcome(NaN, 'half')).toBe('none');
    expect(sheetDragOutcome(Infinity, 'half')).toBe('none');
  });
});
