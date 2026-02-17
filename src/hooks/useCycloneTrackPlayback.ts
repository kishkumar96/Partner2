/**
 * useCycloneTrackPlayback Hook
 * Extracted playback state management from CycloneAnimationLayer
 * Handles play/pause, scrubbing, speed control, and external sync
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { CycloneForecastPoint } from '@/utils/cycloneAnimationLoader';
import type { StoryBeat } from '@/utils/cycloneStory';
import { getNextBeat, getPreviousBeat } from '@/utils/cycloneStory';

export interface PlaybackState {
  isPlaying: boolean;
  currentIndex: number;
  playbackSpeed: number;
  totalSteps: number;
}

export interface PlaybackControls {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seekTo: (index: number) => void;
  next: () => void;
  previous: () => void;
  setSpeed: (speed: number) => void;
  reset: () => void;

  // Story mode controls
  nextBeat: () => void;
  previousBeat: () => void;
}

export interface PlaybackOptions {
  forecastTrack: CycloneForecastPoint[] | null;
  storyMode?: boolean;
  storyBeats?: StoryBeat[];
  suspendPlayback?: boolean;
  loop?: boolean; // Enable looping playback

  // External control (for parent synchronization)
  isPlayingExternal?: boolean;
  currentIndexExternal?: number;

  // Callbacks
  onPlayingChange?: (isPlaying: boolean) => void;
  onIndexChange?: (index: number) => void;
  onTimestepChange?: (timestep: CycloneForecastPoint | null, index: number, total: number) => void;
}

/**
 * Custom hook for cyclone track playback state management
 * Provides clean separation of concerns from rendering logic
 */
export function useCycloneTrackPlayback({
  forecastTrack,
  storyMode = false,
  storyBeats = [],
  suspendPlayback = false,
  loop = false,
  isPlayingExternal,
  currentIndexExternal,
  onPlayingChange,
  onIndexChange,
  onTimestepChange,
}: PlaybackOptions) {
  // Core playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Refs for external sync tracking
  const isPlayingSyncRef = useRef(false);
  const isExternalIndexSyncRef = useRef(false);
  const lastReportedIndexRef = useRef<number | null>(null);
  const lastProcessedExternalIndexRef = useRef<number | null>(null);
  const currentIndexRef = useRef(0);

  // Animation loop refs
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastUpdateRef = useRef<number>(0);
  const intervalRef = useRef<number>(1000);

  // Track length
  const totalSteps = forecastTrack?.length ?? 0;
  const maxIndex = Math.max(0, totalSteps - 1);

  // Sync currentIndex to ref (for requestAnimationFrame access)
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // ==================== External Control Sync ====================

  // Sync external isPlaying
  useEffect(() => {
    if (typeof isPlayingExternal !== 'boolean') return;
    if (isPlayingExternal === isPlaying) return;

    // Use a microtask to avoid synchronous setState in effect
    Promise.resolve().then(() => {
      isPlayingSyncRef.current = true;
      setIsPlaying(isPlayingExternal);
    });
  }, [isPlayingExternal, isPlaying]);

  // Sync external currentIndex
  useEffect(() => {
    if (typeof currentIndexExternal !== 'number') return;
    if (!Number.isFinite(currentIndexExternal)) return;

    // Prevent reprocessing the same external value
    if (lastProcessedExternalIndexRef.current === currentIndexExternal) return;

    const nextIndex = Math.max(0, Math.min(currentIndexExternal, maxIndex));
    if (nextIndex === currentIndexRef.current) return;

    lastProcessedExternalIndexRef.current = currentIndexExternal;

    // Use a microtask to avoid synchronous setState in effect
    Promise.resolve().then(() => {
      isExternalIndexSyncRef.current = true;
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
    });
  }, [currentIndexExternal, maxIndex]);

  // ==================== Callbacks ====================

  // Notify parent of playing state changes
  useEffect(() => {
    if (isPlayingSyncRef.current) {
      isPlayingSyncRef.current = false;
      return;
    }
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  // Notify parent of index changes
  useEffect(() => {
    if (isExternalIndexSyncRef.current) {
      isExternalIndexSyncRef.current = false;
      return;
    }

    if (lastReportedIndexRef.current !== currentIndex) {
      lastReportedIndexRef.current = currentIndex;
      onIndexChange?.(currentIndex);

      const currentPoint = forecastTrack?.[currentIndex] ?? null;
      onTimestepChange?.(currentPoint, currentIndex, totalSteps);
    }
  }, [currentIndex, forecastTrack, totalSteps, onIndexChange, onTimestepChange]);

  // ==================== Animation Loop ====================

  useEffect(() => {
    if (suspendPlayback || !isPlaying || !forecastTrack || forecastTrack.length === 0) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      return;
    }

    // Calculate interval based on speed
    intervalRef.current = 1000 / playbackSpeed;

    const animate = (timestamp: number) => {
      if (lastUpdateRef.current === 0) {
        lastUpdateRef.current = timestamp;
      }

      const elapsed = timestamp - lastUpdateRef.current;

      if (elapsed >= intervalRef.current) {
        const nextIndex = currentIndexRef.current + 1;

        if (nextIndex >= forecastTrack.length) {
          // Reached end - loop or stop
          if (loop) {
            // Restart from beginning
            currentIndexRef.current = 0;
            setCurrentIndex(0);
            lastUpdateRef.current = timestamp;
          } else {
            // Stop playback
            setIsPlaying(false);
            return;
          }
        } else {
          currentIndexRef.current = nextIndex;
          setCurrentIndex(nextIndex);
          lastUpdateRef.current = timestamp;
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    lastUpdateRef.current = 0; // Reset timer
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    };
  }, [isPlaying, playbackSpeed, forecastTrack, suspendPlayback, loop]);

  // ==================== Control Functions ====================

  const play = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const seekTo = useCallback(
    (index: number) => {
      const clampedIndex = Math.max(0, Math.min(index, maxIndex));
      currentIndexRef.current = clampedIndex;
      setCurrentIndex(clampedIndex);
    },
    [maxIndex]
  );

  const next = useCallback(() => {
    if (currentIndex < maxIndex) {
      seekTo(currentIndex + 1);
    }
  }, [currentIndex, maxIndex, seekTo]);

  const previous = useCallback(() => {
    if (currentIndex > 0) {
      seekTo(currentIndex - 1);
    }
  }, [currentIndex, seekTo]);

  const setSpeed = useCallback((speed: number) => {
    setPlaybackSpeed(Math.max(0.25, Math.min(4, speed)));
  }, []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    seekTo(0);
  }, [seekTo]);

  // Story mode navigation
  const nextBeat = useCallback(() => {
    if (!storyMode || !storyBeats || storyBeats.length === 0) return;

    const next = getNextBeat(storyBeats, currentIndex);
    if (next) {
      seekTo(next.index);
    }
  }, [storyMode, storyBeats, currentIndex, seekTo]);

  const previousBeat = useCallback(() => {
    if (!storyMode || !storyBeats || storyBeats.length === 0) return;

    const prev = getPreviousBeat(storyBeats, currentIndex);
    if (prev) {
      seekTo(prev.index);
    }
  }, [storyMode, storyBeats, currentIndex, seekTo]);

  // ==================== Return State & Controls ====================

  const state: PlaybackState = {
    isPlaying,
    currentIndex,
    playbackSpeed,
    totalSteps,
  };

  const controls: PlaybackControls = {
    play,
    pause,
    toggle,
    seekTo,
    next,
    previous,
    setSpeed,
    reset,
    nextBeat,
    previousBeat,
  };

  return { state, controls };
}
