"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { BookOpen, ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { StoryBeat } from "@/utils/cycloneStory";
import { CycloneForecastPoint } from "@/utils/cycloneAnimationLoader";

interface CycloneStoryOverlayProps {
  map: MapLibreMap | null;
  forecastTrack: CycloneForecastPoint[] | null;
  storyBeats: StoryBeat[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onExit: () => void;
  baseZoom?: number;
}

const PLAY_STEP_MS = 2400;
const MAX_ZOOM = 9;
const DEFAULT_PANEL_WIDTH = 360;
const DEFAULT_PANEL_HEIGHT = 220;
const PANEL_MARGIN = 16;
const BOTTOM_OFFSET = 24;
const KEY_MOVE_STEP = 12;

export default function CycloneStoryOverlay({
  map,
  forecastTrack,
  storyBeats,
  currentIndex,
  onSelect,
  onExit,
  baseZoom,
}: CycloneStoryOverlayProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimeoutRef = useRef<number | null>(null);
  const currentIndexRef = useRef(currentIndex);
  const lastBeatIdRef = useRef<string | null>(null);
  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getContainerMetrics = () => {
    if (typeof window === "undefined") {
      return { left: 0, top: 0, width: 0, height: 0 };
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  };

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    if (storyBeats.length === 0 && isPlaying) {
      setIsPlaying(false);
    }
  }, [storyBeats, isPlaying]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (panelPosition.x !== 0 || panelPosition.y !== 0) return;
    const { width, height } = getContainerMetrics();
    const panelWidth = panelRef.current?.offsetWidth ?? DEFAULT_PANEL_WIDTH;
    const panelHeight = panelRef.current?.offsetHeight ?? DEFAULT_PANEL_HEIGHT;
    const nextX = Math.max(PANEL_MARGIN, (width - panelWidth) / 2);
    const nextY = Math.max(PANEL_MARGIN, height - panelHeight - BOTTOM_OFFSET);
    setPanelPosition({ x: nextX, y: nextY });
  }, [panelPosition.x, panelPosition.y]);

  const activeBeat = useMemo(() => {
    if (storyBeats.length === 0) return null;
    let candidate: StoryBeat | null = null;
    for (let i = storyBeats.length - 1; i >= 0; i--) {
      const beat = storyBeats[i];
      if (beat.index <= currentIndex) {
        candidate = beat;
        break;
      }
    }
    return candidate || storyBeats[0];
  }, [storyBeats, currentIndex]);

  const getNextBeat = (index: number) => {
    return storyBeats.find((beat) => beat.index > index) || null;
  };

  const getPreviousBeat = (index: number) => {
    for (let i = storyBeats.length - 1; i >= 0; i--) {
      if (storyBeats[i].index < index) return storyBeats[i];
    }
    return null;
  };

  useEffect(() => {
    if (!map || !forecastTrack || !activeBeat) return;

    const runFlyTo = () => {
      if (lastBeatIdRef.current === activeBeat.id) return;
      lastBeatIdRef.current = activeBeat.id;

      const point = forecastTrack[activeBeat.index];
      if (!point) return;

      const targetZoom = Math.min((baseZoom ?? map.getZoom()) + 1, MAX_ZOOM);
      map.flyTo({
        center: [point.longitude, point.latitude],
        zoom: targetZoom,
        duration: 2200,
        pitch: 25,
        easing: (t) => t * (2 - t),
      });
    };

    if (map.isStyleLoaded()) {
      runFlyTo();
      return;
    }

    const handleStyleData = () => {
      if (!map.isStyleLoaded()) return;
      runFlyTo();
    };

    map.once("styledata", handleStyleData);

    return () => {
      map.off("styledata", handleStyleData);
    };
  }, [map, forecastTrack, activeBeat, baseZoom]);

  useEffect(() => {
    return () => {
      if (playTimeoutRef.current) {
        window.clearTimeout(playTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!isDragging) return;
      if (typeof window === "undefined") return;
      const panelWidth = panelRef.current?.offsetWidth ?? DEFAULT_PANEL_WIDTH;
      const panelHeight = panelRef.current?.offsetHeight ?? DEFAULT_PANEL_HEIGHT;
      const { left, top, width, height } = getContainerMetrics();
      const minX = PANEL_MARGIN;
      const minY = PANEL_MARGIN;
      const maxX = Math.max(minX, width - panelWidth - PANEL_MARGIN);
      const maxY = Math.max(minY, height - panelHeight - PANEL_MARGIN);
      const nextX = event.clientX - left - dragOffset.x;
      const nextY = event.clientY - top - dragOffset.y;
      setPanelPosition({
        x: Math.max(minX, Math.min(nextX, maxX)),
        y: Math.max(minY, Math.min(nextY, maxY)),
      });
    };

    const handleUp = () => {
      if (!isDragging) return;
      setIsDragging(false);
      if (typeof window === "undefined") return;
      const panelWidth = panelRef.current?.offsetWidth ?? DEFAULT_PANEL_WIDTH;
      const panelHeight = panelRef.current?.offsetHeight ?? DEFAULT_PANEL_HEIGHT;
      const { width, height } = getContainerMetrics();
      const margin = PANEL_MARGIN;
      const corners = [
        { x: margin, y: margin },
        { x: width - panelWidth - margin, y: margin },
        { x: margin, y: height - panelHeight - margin },
        { x: width - panelWidth - margin, y: height - panelHeight - margin },
      ];
      const current = { x: panelPosition.x, y: panelPosition.y };
      const nearest = corners.reduce((best, corner) => {
        const bestDist = (best.x - current.x) ** 2 + (best.y - current.y) ** 2;
        const nextDist = (corner.x - current.x) ** 2 + (corner.y - current.y) ** 2;
        return nextDist < bestDist ? corner : best;
      }, corners[0]);
      setPanelPosition({
        x: Math.max(margin, Math.min(nearest.x, width - panelWidth - margin)),
        y: Math.max(margin, Math.min(nearest.y, height - panelHeight - margin)),
      });
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
  }, [isDragging, dragOffset.x, dragOffset.y, panelPosition.x, panelPosition.y]);

  useEffect(() => {
    if (playTimeoutRef.current) {
      window.clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }

    if (!isPlaying) return;

    const advance = () => {
      const nextBeat = getNextBeat(currentIndexRef.current);
      if (!nextBeat) {
        setIsPlaying(false);
        return;
      }
      onSelect(nextBeat.index);
    };

    // Use a self-correcting interval to drive the animation.
    // This is more robust than a recursive setTimeout against tab-throttling.
    let expected = Date.now() + PLAY_STEP_MS;
    const timeout = () => {
      const drift = Date.now() - expected;
      if (drift > PLAY_STEP_MS) {
        // If we're lagging significantly, reset.
        expected = Date.now();
      }
      advance();
      expected += PLAY_STEP_MS;
      playTimeoutRef.current = window.setTimeout(timeout, Math.max(0, PLAY_STEP_MS - drift));
    };

    playTimeoutRef.current = window.setTimeout(timeout, PLAY_STEP_MS);

    return () => {
      if (playTimeoutRef.current) {
        window.clearTimeout(playTimeoutRef.current);
        playTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, storyBeats, onSelect]);

  const hasBeats = storyBeats.length > 0;
  const prevBeat = activeBeat ? getPreviousBeat(activeBeat.index) : null;
  const nextBeat = activeBeat ? getNextBeat(activeBeat.index) : null;

  return (
    <div ref={containerRef} className="absolute inset-0 z-[95] pointer-events-none">
      <div
        ref={panelRef}
        className="pointer-events-auto w-full max-w-[360px] rounded-xl border border-slate-700/60 bg-slate-900/90 shadow-2xl backdrop-blur-xl"
        style={{
          boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
          left: `${panelPosition.x}px`,
          top: `${panelPosition.y}px`,
          position: "absolute",
        }}
      >
        <div
          className={`flex items-center justify-between px-3 py-1.5 border-b border-slate-700/50 ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          role="button"
          tabIndex={0}
          aria-label="Drag cyclone story panel"
          onPointerDown={(event) => {
            event.preventDefault();
            const rect = panelRef.current?.getBoundingClientRect();
            const offsetX = rect ? event.clientX - rect.left : 0;
            const offsetY = rect ? event.clientY - rect.top : 0;
            setDragOffset({ x: offsetX, y: offsetY });
            setIsDragging(true);
          }}
          onKeyDown={(event) => {
            if (typeof window === "undefined") return;
            const panelWidth = panelRef.current?.offsetWidth ?? DEFAULT_PANEL_WIDTH;
            const panelHeight = panelRef.current?.offsetHeight ?? DEFAULT_PANEL_HEIGHT;
            const { width, height } = getContainerMetrics();
            const minX = PANEL_MARGIN;
            const minY = PANEL_MARGIN;
            const maxX = Math.max(minX, width - panelWidth - PANEL_MARGIN);
            const maxY = Math.max(minY, height - panelHeight - PANEL_MARGIN);
            let nextX = panelPosition.x;
            let nextY = panelPosition.y;

            if (event.key === "ArrowLeft") nextX -= KEY_MOVE_STEP;
            if (event.key === "ArrowRight") nextX += KEY_MOVE_STEP;
            if (event.key === "ArrowUp") nextY -= KEY_MOVE_STEP;
            if (event.key === "ArrowDown") nextY += KEY_MOVE_STEP;

            if (nextX !== panelPosition.x || nextY !== panelPosition.y) {
              event.preventDefault();
              setPanelPosition({
                x: Math.max(minX, Math.min(nextX, maxX)),
                y: Math.max(minY, Math.min(nextY, maxY)),
              });
            }
          }}
          onDoubleClick={() => {
            if (typeof window === "undefined") return;
            const { width, height } = getContainerMetrics();
            const panelWidth = panelRef.current?.offsetWidth ?? 360;
            const panelHeight = panelRef.current?.offsetHeight ?? 220;
            const margin = 16;
            const nextX = Math.max(margin, (width - panelWidth) / 2);
            const nextY = Math.max(margin, height - panelHeight - 24);
            setPanelPosition({ x: nextX, y: nextY });
          }}
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-semibold text-slate-100">Cyclone Story Mode</span>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="p-0.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Exit story mode"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="max-h-[200px] overflow-y-auto">
          {!hasBeats && (
            <div className="px-3 py-2 text-[11px] text-slate-300">
              No narrative beats detected for this cyclone track.
            </div>
          )}

          {hasBeats && activeBeat && (
            <div className="px-3 py-2.5 space-y-2.5">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold text-white">{activeBeat.title}</div>
                <div className="text-[11px] text-slate-300">{activeBeat.description}</div>
                <div className="text-[10px] text-slate-400">
                  {activeBeat.time.toLocaleString()}
                </div>
              </div>

              {activeBeat.metrics && (
                <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-300">
                  {activeBeat.metrics.wind !== undefined && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-800/70">
                      Wind: {Math.round(activeBeat.metrics.wind)} kt
                    </span>
                  )}
                  {activeBeat.metrics.pressure !== undefined && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-800/70">
                      Pressure: {Math.round(activeBeat.metrics.pressure)} hPa
                    </span>
                  )}
                  {activeBeat.metrics.distance !== undefined && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-800/70">
                      Distance: {Math.round(activeBeat.metrics.distance)} km
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (prevBeat) onSelect(prevBeat.index);
                    }}
                    disabled={!prevBeat}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/80 text-slate-200 text-[10px] font-medium hover:bg-slate-700/80 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (nextBeat) onSelect(nextBeat.index);
                    }}
                    disabled={!nextBeat}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/80 text-slate-200 text-[10px] font-medium hover:bg-slate-700/80 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPlaying((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-semibold hover:bg-blue-500 transition-colors"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? "Pause" : "Play"}
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {storyBeats.map((beat) => {
                  const isActive = beat.id === activeBeat.id;
                  return (
                    <button
                      key={beat.id}
                      type="button"
                      onClick={() => onSelect(beat.index)}
                      className={`min-w-[120px] text-left rounded-lg border px-2 py-1 text-[10px] transition-colors ${
                        isActive
                          ? "border-blue-500 bg-blue-500/10 text-white"
                          : "border-slate-700/60 bg-slate-800/40 text-slate-300 hover:bg-slate-800/70"
                      }`}
                    >
                      <div className="font-semibold">{beat.title}</div>
                      <div className="text-[9px] text-slate-400">
                        {beat.time.toLocaleString()}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
