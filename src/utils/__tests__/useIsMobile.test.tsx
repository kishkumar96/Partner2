import { act, renderHook } from '@testing-library/react';
import { DESKTOP_MIN_WIDTH, MOBILE_MEDIA_QUERY, useIsMobile } from '@/utils/useIsMobile';

function mockViewport(width: number) {
  let listener: (() => void) | null = null;
  const state = { width };
  const matches = () => state.width <= DESKTOP_MIN_WIDTH - 0.02;
  window.matchMedia = jest.fn((query: string) => ({
    get matches() {
      return query === MOBILE_MEDIA_QUERY && matches();
    },
    media: query,
    addEventListener: (_: string, cb: () => void) => {
      listener = cb;
    },
    removeEventListener: () => {
      listener = null;
    },
  })) as never;
  return {
    resize(next: number) {
      state.width = next;
      act(() => listener?.());
    },
  };
}

describe('useIsMobile', () => {
  it('is mobile below 768px and desktop from 768px', () => {
    for (const [width, expected] of [
      [320, true],
      [390, true],
      [430, true],
      [767, true],
      [768, false],
      [1280, false],
    ] as const) {
      const { result, unmount } = renderHook(() => (mockViewport(width), useIsMobile()));
      expect(result.current).toBe(expected);
      unmount();
    }
  });

  it('follows the window when it crosses the breakpoint', () => {
    const viewport = mockViewport(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    viewport.resize(390);
    expect(result.current).toBe(true);
    viewport.resize(900);
    expect(result.current).toBe(false);
  });
});
