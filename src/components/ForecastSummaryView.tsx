'use client';

import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Home,
  Info,
  Users,
  type LucideIcon,
} from 'lucide-react';
import AdvisoryStatusBanner from './AdvisoryStatusBanner';
import ForecastTrendChart from './ForecastTrendChart';
import { windAreaLabel } from '@/utils/windScale';
import { windDangerColor } from '@/utils/forecastExposure';
import { approximate, type ForecastInsight, type InsightArea } from '@/utils/forecastInsight';

/**
 * The forecast in plain words, for someone who has not read the tables.
 *
 * One headline, where it hits, three numbers, how exposure has moved, and what the figures do and do
 * not mean. Type is larger than the rest of the panel: 18px for the headline, 14px for text, nothing
 * under 12px. Everything here comes from the same exposure the detailed tables show.
 */

const AREAS_SHOWN = 3;

/** "possible gale", "storm" */
function windsShort(area: InsightArea): string {
  if (!area.kind) return windAreaLabel(area.winds) ?? '';
  return `${area.possible ? 'possible ' : ''}${area.kind}`;
}

/** "14K" for 14,000, "2.6K" for 2,600; the panel is too narrow for five-digit tiles */
function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  if (n < 1000000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** "~14K" for a rounded figure, "37" for an exact one; the full figure stays as the tooltip */
function tileValue(text: string): { value: string; full: string } {
  const rounded = text.startsWith('about ');
  const n = Number((rounded ? text.slice(6) : text).replace(/,/g, ''));
  const shown = Number.isFinite(n) ? compact(n) : text;
  return { value: rounded ? `~${shown}` : shown, full: text };
}

/** REF's band name for the strongest winds in the forecast, for its colour */
function strongestBand(insight: ForecastInsight): string | null {
  if (!insight.strongest) return null;
  const kind = insight.strongest[0].toUpperCase() + insight.strongest.slice(1);
  return `${insight.level === 'possible' ? 'Possible ' : ''}${kind} Winds`;
}

function Stat({
  icon: Icon,
  value,
  label,
  title,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  title?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-700/60 bg-slate-800/60 px-1.5 py-3 text-center">
      <Icon className="mx-auto h-5 w-5 text-slate-300" aria-hidden="true" />
      <p
        className="mt-1 truncate text-2xl font-semibold tabular-nums leading-tight text-slate-50"
        title={title}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs leading-tight text-slate-400">{label}</p>
    </div>
  );
}

export default function ForecastSummaryView({
  insight,
  showStatus,
  onSwitchToLatest,
  onSelectAdvisory,
  onShowDetails,
  onAbout,
}: {
  insight: ForecastInsight;
  /** Show the "latest advisory" line at the top (the parent shows a banner when it is not the latest) */
  showStatus?: boolean;
  onSwitchToLatest?: () => void;
  onSelectAdvisory?: (id: string) => void;
  onShowDetails: () => void;
  onAbout?: () => void;
}) {
  const none = insight.level === 'none';
  const accent = none ? '#34d399' : windDangerColor(strongestBand(insight));
  const shown = insight.areas.slice(0, AREAS_SHOWN);
  const hidden = insight.areas.length - shown.length;
  const people = tileValue(insight.people.text);
  const buildings = tileValue(insight.buildings.text);
  const { health, schools, evacuationCentres, total } = insight.facilities;

  return (
    <div className="space-y-5" data-testid="forecast-summary-view">
      {showStatus && (
        <AdvisoryStatusBanner status={insight.status} onSwitchToLatest={onSwitchToLatest} />
      )}

      <section
        aria-labelledby="summary-headline"
        className="border-l-4 pl-3"
        style={{ borderLeftColor: accent }}
      >
        <h3
          id="summary-headline"
          data-testid="summary-headline"
          className="flex items-start gap-2 text-lg font-semibold leading-snug text-slate-50"
        >
          {none ? (
            <CheckCircle2
              className="mt-1 h-5 w-5 flex-shrink-0 text-emerald-300"
              aria-hidden="true"
            />
          ) : (
            <AlertTriangle
              className="mt-1 h-5 w-5 flex-shrink-0 text-amber-300"
              aria-hidden="true"
            />
          )}
          <span>{insight.headline}</span>
        </h3>
        <p data-testid="summary-detail" className="mt-2 text-sm leading-relaxed text-slate-300">
          {insight.detail}
        </p>
      </section>

      {!none && (
        <section aria-labelledby="summary-where" data-testid="summary-areas">
          <h4 id="summary-where" className="text-sm font-semibold text-slate-200">
            Where
          </h4>
          <ul className="mt-2 space-y-2">
            {shown.map(area => (
              <li key={area.name} className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-3 w-3 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: area.color }}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-100">{area.name}</span>
                    <span className="block text-xs text-slate-400">{windsShort(area)}</span>
                  </span>
                </span>
                <span className="flex-shrink-0 text-right text-sm tabular-nums text-slate-200">
                  {approximate(area.people)}
                  <span className="block text-xs text-slate-400">people</span>
                </span>
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <p className="mt-2 text-xs text-slate-400">
              + {hidden} more {hidden === 1 ? 'area' : 'areas'} in the full details
            </p>
          )}
        </section>
      )}

      {!none && (
        <section aria-labelledby="summary-glance" data-testid="summary-stats">
          <h4 id="summary-glance" className="text-sm font-semibold text-slate-200">
            At a glance
          </h4>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Stat icon={Users} value={people.value} label="people" title={people.full} />
            <Stat icon={Home} value={buildings.value} label="buildings" title={buildings.full} />
            <Stat icon={Building2} value={String(total)} label="key facilities" />
          </div>
          {total > 0 && (
            <p className="mt-2 text-xs text-slate-400">
              {health} health · {schools} schools · {evacuationCentres} evacuation centres
            </p>
          )}
        </section>
      )}

      {insight.trend && (
        <section aria-labelledby="summary-trend" data-testid="summary-trend">
          <h4 id="summary-trend" className="text-sm font-semibold text-slate-200">
            People under forecast winds, advisory by advisory
          </h4>
          <div className="mt-2">
            <ForecastTrendChart
              points={insight.trend.points}
              currentId={insight.trend.current?.id ?? null}
              onSelect={onSelectAdvisory}
            />
          </div>
          <p className="mt-2 text-sm leading-snug text-slate-300">{insight.trend.summary}</p>
        </section>
      )}

      <section aria-labelledby="summary-limits" data-testid="summary-limits">
        <h4 id="summary-limits" className="text-sm font-semibold text-slate-200">
          What this does and doesn’t tell you
        </h4>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-snug text-slate-300 marker:text-slate-500">
          <li>
            It is a snapshot of what could be affected under one forecast, not an estimate of
            damage.
          </li>
          <li>Winds only. Storm surge, waves and heavy rain are not part of this forecast.</li>
          {!none && (insight.people.possible ?? 0) > 0 && (
            <li>
              “Possible” means the winds are inside the forecast track’s uncertainty: less certain,
              not weaker.
            </li>
          )}
          <li>A newer advisory can change all of this.</li>
        </ul>
      </section>

      <div className="space-y-1 pt-1">
        <button
          type="button"
          onClick={onShowDetails}
          className="min-h-[44px] w-full rounded-lg bg-sky-400 px-3 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
        >
          Show full details
        </button>
        {onAbout && (
          <button
            type="button"
            onClick={onAbout}
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 text-sm text-sky-300 underline-offset-2 hover:text-sky-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
            How to read this forecast
          </button>
        )}
      </div>
    </div>
  );
}
