import { act, renderHook } from '@testing-library/react';
import { usePriorityThresholds } from '../usePriorityThresholds';
import { defaultThresholds } from '../responsePriority';

const peopleMin = (t: ReturnType<typeof defaultThresholds>) =>
  t.red[0].conditions.find(c => c.metric === 'people')!.min;

describe('usePriorityThresholds', () => {
  beforeEach(() => window.localStorage.clear());

  it('saves for the current country only and never shows it for another', () => {
    const { result, rerender } = renderHook(({ cc }) => usePriorityThresholds(cc), {
      initialProps: { cc: 'VU' },
    });
    const edited = defaultThresholds();
    edited.red[0].conditions.find(c => c.metric === 'people')!.min = 7777;
    act(() => result.current.update(edited));
    expect(peopleMin(result.current.thresholds)).toBe(7777);
    expect(result.current.isCustom).toBe(true);

    rerender({ cc: 'TO' });
    expect(peopleMin(result.current.thresholds)).toBe(1000);
    expect(result.current.isCustom).toBe(false);

    rerender({ cc: 'VU' });
    expect(peopleMin(result.current.thresholds)).toBe(7777);
  });

  it('reset returns this country to the defaults', () => {
    const { result } = renderHook(() => usePriorityThresholds('VU'));
    const edited = defaultThresholds();
    edited.staleAfterHours = 3;
    act(() => result.current.update(edited));
    act(() => result.current.reset());
    expect(result.current.thresholds.staleAfterHours).toBe(24);
    expect(result.current.isCustom).toBe(false);
  });
});
