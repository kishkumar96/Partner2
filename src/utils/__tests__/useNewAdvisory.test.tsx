import { act, renderHook } from '@testing-library/react';
import { useNewAdvisory } from '../useNewAdvisory';
import type { EventRecord } from '@/data/eventRecords';

const advisory = (id: string, issued: string, extra: Partial<EventRecord> = {}) =>
  ({
    id,
    countryCode: 'CK',
    name: 'TC Wati',
    cycloneName: '2026101712_Wati',
    isForecast: true,
    trackIssuedTime: issued,
    modelRunStatus: 'complete',
    ...extra,
  }) as EventRecord;

const known = [advisory('a', '2026-10-17T12:00:00Z'), advisory('b', '2026-10-17T18:00:00Z')];
const newer = advisory('c', '2026-10-18T00:00:00Z');

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('useNewAdvisory', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const setup = (fetchRecords: jest.Mock, extra: Record<string, unknown> = {}) =>
    renderHook(
      (props: { known: EventRecord[] }) =>
        useNewAdvisory({
          countryCode: 'CK',
          known: props.known,
          enabled: true,
          pollMs: 60_000,
          fetchRecords: fetchRecords as never,
          ...extra,
        }),
      { initialProps: { known } }
    );

  it('stays quiet while nothing newer has been issued', async () => {
    const fetchRecords = jest.fn().mockResolvedValue([...known]);
    const { result } = setup(fetchRecords);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await flush();
    expect(fetchRecords).toHaveBeenCalledTimes(1);
    expect(result.current.advisory).toBeNull();
  });

  it('reports a newer advisory on the next check, without being asked to switch', async () => {
    const fetchRecords = jest.fn().mockResolvedValue([...known, newer]);
    const { result } = setup(fetchRecords);
    expect(result.current.advisory).toBeNull(); // nothing before the first check
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await flush();
    expect(result.current.advisory?.id).toBe('c');
  });

  it('stops being news once the page has loaded it', async () => {
    const fetchRecords = jest.fn().mockResolvedValue([...known, newer]);
    const { result, rerender } = setup(fetchRecords);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await flush();
    expect(result.current.advisory?.id).toBe('c');
    rerender({ known: [...known, newer] });
    expect(result.current.advisory).toBeNull();
  });

  it('can be dismissed, and a still newer advisory brings it back', async () => {
    const fetchRecords = jest.fn().mockResolvedValue([...known, newer]);
    const { result } = setup(fetchRecords);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await flush();
    act(() => result.current.dismiss());
    expect(result.current.advisory).toBeNull();

    const newest = advisory('d', '2026-10-18T06:00:00Z');
    fetchRecords.mockResolvedValue([...known, newer, newest]);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await flush();
    expect(result.current.advisory?.id).toBe('d');
  });

  it('does not poll when disabled, and does not break on a failed check', async () => {
    const off = jest.fn().mockResolvedValue([...known, newer]);
    setup(off, { enabled: false });
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    expect(off).not.toHaveBeenCalled();

    const failing = jest.fn().mockRejectedValue(new Error('offline'));
    const { result } = setup(failing);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await flush();
    expect(result.current.advisory).toBeNull();
  });

  it('checks straight away when the tab comes back into view', async () => {
    const fetchRecords = jest.fn().mockResolvedValue([...known, newer]);
    const { result } = setup(fetchRecords);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(fetchRecords).toHaveBeenCalledTimes(1);
    expect(result.current.advisory?.id).toBe('c');
  });
});
