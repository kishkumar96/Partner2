'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HazardScenarioCurve } from '@/utils/realDataLoader';
import { formatCurrency, formatPercent } from '@/utils/formatters';

// Ordinal ramp for sea level rise (validated against the dark panel surface):
// more rise reads as a lighter, more prominent line.
const SLR_COLORS = ['#184f95', '#2a78d6', '#6da7ec', '#b7d3f6'];
const SELECTED_COLOR = '#d95926';
const SURFACE = '#0f172a';
const GRID = '#334155';
const AXIS_TEXT = '#94a3b8';

const HEIGHT = 170;
const MARGIN = { l: 40, r: 48, t: 8, b: 22 };

function slrLabel(slr: number): string {
  return slr === 0 ? 'Today' : `+${slr} m`;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * step >= v) return m * step;
  return 10 * step;
}

/** Chance of at least one event of this return period in `years` years. */
export function chanceWithin(returnPeriodYears: number, years: number): number {
  return 1 - Math.pow(1 - 1 / returnPeriodYears, years);
}

function percent(p: number): string {
  const v = p * 100;
  if (v >= 10) return `${Math.round(v)}%`;
  const rounded = Number(v.toFixed(1));
  return v > 0 && rounded === 0 ? formatPercent(v) : `${rounded}%`;
}

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

interface LossCurveSelectorProps {
  curve: HazardScenarioCurve;
  slrScenarioM: number;
  returnPeriodYears: number;
  /** Whether a map layer exists for this point; points without one can't be selected */
  isAvailable: (slrScenarioM: number, returnPeriodYears: number) => boolean;
  onSelect: (slrScenarioM: number, returnPeriodYears: number) => void;
  /** Years for the "chance over a planning horizon" line */
  horizonYears?: number;
}

/**
 * Loss exceedance curve for a probabilistic hazard product: one line per sea
 * level rise, one point per return period. Selecting a point selects that
 * scenario; the readout below states its loss, the change against today's
 * sea level, and its likelihood in plain language.
 */
export default function LossCurveSelector({
  curve,
  slrScenarioM,
  returnPeriodYears,
  isAvailable,
  onSelect,
  horizonYears = 30,
}: LossCurveSelectorProps) {
  const [containerRef, width] = useWidth<HTMLDivElement>(288);
  const [hover, setHover] = useState<{ slr: number; rp: number } | null>(null);

  const { slrs, rps, bySlr } = useMemo(() => {
    const bySlr = new Map<number, HazardScenarioCurve['points']>();
    curve.points.forEach(p => {
      if (!bySlr.has(p.slrScenarioM)) bySlr.set(p.slrScenarioM, []);
      bySlr.get(p.slrScenarioM)!.push(p);
    });
    const slrs = Array.from(bySlr.keys()).sort((a, b) => a - b);
    const rps = Array.from(new Set(curve.points.map(p => p.returnPeriodYears))).sort(
      (a, b) => a - b
    );
    return { slrs, rps, bySlr };
  }, [curve]);

  const colorFor = (slr: number) => SLR_COLORS[Math.min(slrs.indexOf(slr), SLR_COLORS.length - 1)];

  const iw = Math.max(120, width - MARGIN.l - MARGIN.r);
  const ih = HEIGHT - MARGIN.t - MARGIN.b;
  const yMax = niceMax(Math.max(...curve.points.map(p => p.totalLoss)) * 1.05);
  const lx = Math.log(rps[0]);
  const ux = Math.log(rps[rps.length - 1]);
  const x = (rp: number) =>
    MARGIN.l + (ux === lx ? iw / 2 : ((Math.log(rp) - lx) / (ux - lx)) * iw);
  const y = (v: number) => MARGIN.t + ih - (v / yMax) * ih;

  // End labels, bottom-most first, each kept 12px clear of the one below
  const endLabels = slrs
    .map(slr => {
      const pts = bySlr.get(slr)!;
      return { slr, y: y(pts[pts.length - 1].totalLoss), ly: 0 };
    })
    .sort((a, b) => b.y - a.y);
  endLabels.forEach((e, i) => {
    e.ly = i === 0 ? e.y : Math.min(e.y, endLabels[i - 1].ly - 12);
  });

  const selected = curve.points.find(
    p => p.slrScenarioM === slrScenarioM && p.returnPeriodYears === returnPeriodYears
  );
  const todayAtSameRp = curve.points.find(
    p => p.slrScenarioM === 0 && p.returnPeriodYears === returnPeriodYears
  );
  const aalToday = curve.annualAverageLoss.find(a => a.slrScenarioM === 0);
  const aalHighest = curve.annualAverageLoss[curve.annualAverageLoss.length - 1];
  const hovered = hover
    ? curve.points.find(p => p.slrScenarioM === hover.slr && p.returnPeriodYears === hover.rp)
    : undefined;

  return (
    <div className="space-y-2">
      {aalToday && (
        <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2">
          <div className="text-xs text-slate-400">Expected annual loss</div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-base font-semibold text-slate-100 tabular-nums">
              {formatCurrency(aalToday.totalLoss)}
            </span>
            <span className="text-xs text-slate-400">today</span>
            {aalHighest && aalHighest.slrScenarioM > 0 && (
              <span className="text-xs text-slate-300 tabular-nums">
                → {formatCurrency(aalHighest.totalLoss)} at {slrLabel(aalHighest.slrScenarioM)}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1" aria-hidden="true">
        {slrs.map(slr => (
          <span key={slr} className="inline-flex items-center gap-1.5 text-xs text-slate-300">
            <span
              className="inline-block h-0.5 w-3 rounded"
              style={{ background: colorFor(slr) }}
            />
            {slrLabel(slr)}
          </span>
        ))}
      </div>

      <div ref={containerRef} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block overflow-visible"
          role="group"
          aria-label="Loss by return period for each sea level rise. Select a point to choose that scenario."
        >
          {[0, 0.5, 1].map(f => (
            <g key={f}>
              <line
                x1={MARGIN.l}
                x2={MARGIN.l + iw}
                y1={y(yMax * f)}
                y2={y(yMax * f)}
                stroke={GRID}
                strokeWidth={1}
              />
              <text
                x={MARGIN.l - 6}
                y={y(yMax * f) + 4}
                textAnchor="end"
                fontSize={11}
                fill={AXIS_TEXT}
              >
                {formatCurrency(yMax * f)}
              </text>
            </g>
          ))}
          {rps.map(rp => (
            <text
              key={rp}
              x={x(rp)}
              y={HEIGHT - 6}
              textAnchor="middle"
              fontSize={11}
              fill={AXIS_TEXT}
            >
              {rp}
            </text>
          ))}

          {slrs.map(slr => (
            <path
              key={slr}
              d={bySlr
                .get(slr)!
                .map(
                  (p, i) =>
                    `${i ? 'L' : 'M'}${x(p.returnPeriodYears).toFixed(1)},${y(p.totalLoss).toFixed(1)}`
                )
                .join('')}
              fill="none"
              stroke={colorFor(slr)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {endLabels.map(e => {
            const x0 = x(rps[rps.length - 1]);
            return (
              <g key={e.slr}>
                {Math.abs(e.ly - e.y) > 1 && (
                  <line
                    x1={x0 + 5}
                    y1={e.y}
                    x2={x0 + 11}
                    y2={e.ly}
                    stroke={AXIS_TEXT}
                    strokeWidth={1}
                  />
                )}
                <text x={x0 + 13} y={e.ly + 4} fontSize={11} fill="#cbd5e1">
                  {slrLabel(e.slr)}
                </text>
              </g>
            );
          })}

          {curve.points.map(p => {
            const available = isAvailable(p.slrScenarioM, p.returnPeriodYears);
            const isSelected =
              p.slrScenarioM === slrScenarioM && p.returnPeriodYears === returnPeriodYears;
            const label = `1-in-${p.returnPeriodYears}-year, ${slrLabel(p.slrScenarioM).toLowerCase()}: ${formatCurrency(p.totalLoss)} loss${available ? '' : ' (no map layer)'}`;
            const choose = () => available && onSelect(p.slrScenarioM, p.returnPeriodYears);
            return (
              <g
                key={`${p.slrScenarioM}-${p.returnPeriodYears}`}
                role="button"
                tabIndex={available ? 0 : -1}
                aria-label={label}
                aria-pressed={isSelected}
                aria-disabled={!available}
                className={`${available ? 'cursor-pointer' : 'cursor-not-allowed'} outline-none [&:focus-visible>circle:last-child]:stroke-orange-400`}
                onClick={choose}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    choose();
                  }
                }}
                onMouseEnter={() => setHover({ slr: p.slrScenarioM, rp: p.returnPeriodYears })}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover({ slr: p.slrScenarioM, rp: p.returnPeriodYears })}
                onBlur={() => setHover(null)}
              >
                <circle cx={x(p.returnPeriodYears)} cy={y(p.totalLoss)} r={11} fill="transparent" />
                <circle
                  cx={x(p.returnPeriodYears)}
                  cy={y(p.totalLoss)}
                  r={isSelected ? 6 : 4}
                  fill={isSelected ? SELECTED_COLOR : colorFor(p.slrScenarioM)}
                  fillOpacity={available ? 1 : 0.35}
                  stroke={SURFACE}
                  strokeWidth={2}
                />
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-900 shadow"
            style={{ left: x(hovered.returnPeriodYears), top: y(hovered.totalLoss) - 10 }}
          >
            <b>
              1-in-{hovered.returnPeriodYears} · {slrLabel(hovered.slrScenarioM)}
            </b>{' '}
            {formatCurrency(hovered.totalLoss)}
          </div>
        )}
      </div>
      <div className="text-xs text-slate-400 text-center">Return period (years)</div>

      {selected && (
        <div
          className="space-y-1 rounded-lg border border-orange-500/30 bg-orange-500/5 px-3 py-2"
          aria-live="polite"
        >
          <div className="text-xs text-slate-300">
            1-in-{returnPeriodYears}-year event · {slrLabel(slrScenarioM).toLowerCase()}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-lg font-bold text-slate-50 tabular-nums">
              {formatCurrency(selected.totalLoss)}
            </span>
            {todayAtSameRp && slrScenarioM > 0 && todayAtSameRp.totalLoss > 0 && (
              <span className="text-xs font-semibold text-red-300 tabular-nums">
                +{formatCurrency(selected.totalLoss - todayAtSameRp.totalLoss)} (+
                {formatPercent(
                  ((selected.totalLoss - todayAtSameRp.totalLoss) / todayAtSameRp.totalLoss) * 100,
                  0
                )}
                ) vs today
              </span>
            )}
          </div>
          <div className="text-xs text-slate-300">
            {percent(1 / returnPeriodYears)} chance in any year ·{' '}
            {percent(chanceWithin(returnPeriodYears, horizonYears))} chance of at least one in{' '}
            {horizonYears} years
          </div>
        </div>
      )}
    </div>
  );
}
