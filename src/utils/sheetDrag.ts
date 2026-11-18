import type { SheetHeight } from '@/utils/mobilePanel';

/** How far a drag on the handle must travel, in px, before it changes the sheet. Shorter is a tap or a slip. */
export const SHEET_DRAG_THRESHOLD = 48;

export type SheetDragOutcome = 'expand' | 'collapse' | 'close' | 'none';

/**
 * What a drag on the sheet's handle does. `dy` is the vertical travel from where the finger went down:
 * negative is up. Up expands a half-height sheet; down collapses an expanded one, and closes a half-height
 * one. Dragging is a shortcut: the sheet's own buttons do the same, and content scrolling never calls this.
 */
export function sheetDragOutcome(dy: number, height: SheetHeight): SheetDragOutcome {
  if (!Number.isFinite(dy) || Math.abs(dy) < SHEET_DRAG_THRESHOLD) return 'none';
  if (dy < 0) return height === 'half' ? 'expand' : 'none';
  return height === 'expanded' ? 'collapse' : 'close';
}
