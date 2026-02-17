/**
 * Tests for useCycloneTrackPlayback Hook
 */
import { renderHook, act } from '@testing-library/react';
import { useCycloneTrackPlayback } from '../useCycloneTrackPlayback';

describe('useCycloneTrackPlayback Hook', () => {
  const mockTrackData = [
    { lat: -15.0, lon: 166.0, timestamp: '2024-01-01T00:00:00Z', intensity: 1, category: 1 },
    { lat: -15.5, lon: 166.5, timestamp: '2024-01-01T06:00:00Z', intensity: 2, category: 1 },
    { lat: -16.0, lon: 167.0, timestamp: '2024-01-01T12:00:00Z', intensity: 3, category: 2 },
  ] as any[];

  it('initializes with default state', () => {
    const { result } = renderHook(() => useCycloneTrackPlayback({ forecastTrack: mockTrackData }));

    expect(result.current.state.isPlaying).toBe(false);
    expect(result.current.state.currentIndex).toBe(0);
  });

  it('starts playback', () => {
    const { result } = renderHook(() => useCycloneTrackPlayback({ forecastTrack: mockTrackData }));

    act(() => {
      result.current.controls.play();
    });

    expect(result.current.state.isPlaying).toBe(true);
  });

  it('pauses playback', () => {
    const { result } = renderHook(() => useCycloneTrackPlayback({ forecastTrack: mockTrackData }));

    act(() => {
      result.current.controls.play();
    });

    act(() => {
      result.current.controls.pause();
    });

    expect(result.current.state.isPlaying).toBe(false);
  });

  it('resets playback to start', () => {
    const { result } = renderHook(() => useCycloneTrackPlayback({ forecastTrack: mockTrackData }));

    act(() => {
      result.current.controls.play();
    });

    act(() => {
      result.current.controls.reset();
    });

    expect(result.current.state.currentIndex).toBe(0);
    expect(result.current.state.isPlaying).toBe(false);
  });

  it('advances to next position', () => {
    const { result } = renderHook(() => useCycloneTrackPlayback({ forecastTrack: mockTrackData }));

    act(() => {
      result.current.controls.next();
    });

    expect(result.current.state.currentIndex).toBe(1);
  });

  it('goes back to previous position', () => {
    const { result } = renderHook(() => useCycloneTrackPlayback({ forecastTrack: mockTrackData }));

    act(() => {
      result.current.controls.next();
      result.current.controls.next();
    });

    expect(result.current.state.currentIndex).toBe(2);

    act(() => {
      result.current.controls.previous();
    });

    expect(result.current.state.currentIndex).toBe(1);
  });

  it('loops back to start when reaching end', () => {
    const { result } = renderHook(() =>
      useCycloneTrackPlayback({ forecastTrack: mockTrackData, loop: true })
    );

    act(() => {
      result.current.controls.next();
      result.current.controls.next();
      result.current.controls.next();
    });

    expect(result.current.state.currentIndex).toBe(0);
  });

  it('provides playback controls', () => {
    const { result } = renderHook(() => useCycloneTrackPlayback({ forecastTrack: mockTrackData }));

    expect(result.current.controls).toHaveProperty('play');
    expect(result.current.controls).toHaveProperty('pause');
    expect(result.current.controls).toHaveProperty('next');
    expect(result.current.controls).toHaveProperty('previous');
    expect(result.current.controls).toHaveProperty('reset');
  });
});
