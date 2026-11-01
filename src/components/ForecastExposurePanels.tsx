'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  DollarSign,
  GraduationCap,
  HeartPulse,
  Home,
  Info,
  Route,
  Users,
  Waves,
} from 'lucide-react';
import HeroMetric from './HeroMetric';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatQuantity,
  formatUtcDateTime,
} from '@/utils/formatters';
import {
  isExposedDanger,
  windDangerColor,
  findExposureArea,
  type ExposureBand,
  type ExposedFacility,
  type ExposureTotals,
  type ForecastExposure,
} from '@/utils/forecastExposure';
import type { EventRecord } from '@/data/eventRecords';
import { FORECAST_SIGNAL, advisoryAge, operationalPriorities } from '@/utils/forecastBriefing';
import ResponsePriorityPanel from './ResponsePriorityPanel';
import AdvisoryStatusBanner from './AdvisoryStatusBanner';
import ForecastSummaryView from './ForecastSummaryView';
import { buildForecastInsight } from '@/utils/forecastInsight';
import { strongestBandLabel, type TimelinePoint } from '@/utils/forecastTimeline';
import { parseWindBand, windAreaLabel } from '@/utils/windScale';
import { compareForecasts } from '@/utils/forecastComparison';
import type { ResponsePriority } from '@/utils/useResponsePriority';

/**
 * The Event view for a Rapid Exposure Forecast: what is exposed to the
 * forecast winds. REF models exposure, not damage, so these panels replace
 * the loss summary and tables rather than showing every loss as $0.
 */

const PANEL_CLASSES =
  'w-full max-w-full h-full min-h-0 glass-panel border-l border-white/10 flex flex-col flex-shrink-0 overflow-hidden z-50 md:w-80 md:max-w-[min(320px,calc(100vw-40px))]';

function ForecastNote() {
  return (
    <div
      role="note"
      className="flex gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-xs leading-snug text-sky-100"
    >
      <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-300" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold text-sky-50">{FORECAST_SIGNAL}</p>
        <p>
          What lies under the forecast winds along the official forecast track. It is not a
          probability of damage; the post-event assessment follows once the best track is released.
        </p>
      </div>
    </div>
  );
}

export function ForecastFreshness({ event }: { event: EventRecord | null }) {
  if (!event) return null;
  const issued = event.trackIssuedTime || event.date;
  const status = event.modelRunStatus?.replace(/_/g, ' ') || 'imported result';
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const superseded = event.modelRunStatus === 'superseded';

  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-800/60 p-3 text-xs text-slate-300">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-100">Forecast data status</span>
        <span
          className={`rounded px-1.5 py-0.5 font-medium ${
            superseded ? 'bg-amber-500/20 text-amber-200' : 'bg-sky-500/15 text-sky-200'
          }`}
        >
          {superseded ? 'Superseded' : statusLabel}
        </span>
      </div>
      <p className="mt-1">
        Event {event.backendEventId ?? event.id}
        {event.cycloneName ? ` · ${event.cycloneName}` : ''}
      </p>
      <p>
        Source:{' '}
        {event.dataSource === 'rapid_exposure_forecast' ? 'Rapid Exposure Forecast' : 'Partner API'}
      </p>
      {issued && <p>Track issued: {formatUtcDateTime(issued)}</p>}
      {event.modelRunFinishedAt && (
        <p>Run completed: {formatUtcDateTime(event.modelRunFinishedAt)}</p>
      )}
      {event.modelRunCreatedAt && !event.modelRunFinishedAt && (
        <p>Run started: {formatUtcDateTime(event.modelRunCreatedAt)}</p>
      )}
      <p className="text-xs text-slate-400">
        Exposure data: as supplied with the run (its date isn’t recorded here)
      </p>
      {superseded && (
        <p className="mt-1 text-amber-200">A newer advisory is available; use it for decisions.</p>
      )}
    </div>
  );
}

function runOutcome(event: EventRecord | null): { title: string; detail: string } {
  switch (event?.modelRunStatus) {
    case 'queued':
    case 'running':
      return {
        title: 'Exposure results are not ready yet',
        detail: `The model is ${event.modelRunStatus} for this advisory. Use an earlier advisory in the meantime and check how old it is.`,
      };
    case 'failed':
      return {
        title: 'The model run for this advisory failed',
        detail: event.modelRunError || 'No reason was recorded. Use an earlier advisory with care.',
      };
    case 'superseded':
      return {
        title: 'A newer advisory replaced this one',
        detail: event.modelRunError || 'This run was skipped before it started.',
      };
    default:
      return {
        title: 'This run returned no exposure results',
        detail:
          'The run finished but produced no exposure rows. That can mean the track misses every exposed area, or that the model did not read the track. This is not a confirmed finding of zero exposure: check the run before relying on it.',
      };
  }
}

/**
 * The Exposure Forecast panel for an advisory that has no exposure to show
 * (pending, failed, superseded, or finished empty). It says which, and keeps
 * the run picker so another advisory is one click away.
 */
export function ForecastRunStatusPanel({ event }: { event: EventRecord | null }) {
  const outcome = runOutcome(event);
  return (
    <div className={PANEL_CLASSES} data-testid="forecast-run-status-panel">
      <div className="p-4 border-b border-borderGlow bg-surface/95 backdrop-blur-sm flex-shrink-0">
        <h2 className="text-lg font-semibold text-slate-100">Exposure Forecast</h2>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
        <ForecastNote />
        <div
          role="status"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-snug text-amber-100"
        >
          <p className="font-semibold">{outcome.title}</p>
          <p className="mt-1">{outcome.detail}</p>
          <p className="mt-1">
            Choose another advisory under “Forecast advisory” in the left panel.
          </p>
        </div>
        <ForecastFreshness event={event} />
      </div>
    </div>
  );
}

function signed(value: number, format: (n: number) => string): string {
  if (value === 0) return 'no change';
  return `${value > 0 ? '+' : '−'}${format(Math.abs(value))}`;
}

function utcStamp(iso?: string): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return 'the previous advisory';
  return `${date.toISOString().slice(11, 16)} UTC ${date.getUTCDate()} ${date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}`;
}

/** What moved since the advisory before this one: totals, areas, and wind bands. */
function AdvisoryChange({
  exposure,
  previous,
}: {
  exposure: ForecastExposure;
  previous: { record: EventRecord; exposure: ForecastExposure };
}) {
  const change = compareForecasts(exposure, previous.exposure);
  return (
    <div
      className="rounded-lg border border-slate-700/60 bg-slate-800/60 p-3 text-xs text-slate-300"
      data-testid="advisory-change"
    >
      <p className="text-xs font-semibold text-slate-100">
        Since the {utcStamp(previous.record.trackIssuedTime)} advisory
      </p>
      {change.unchanged ? (
        <p className="mt-1">No change in exposure.</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          <li>People exposed: {signed(change.people, formatNumber)}</li>
          <li>Buildings exposed: {signed(change.buildings, formatNumber)}</li>
          <li>Building value exposed: {signed(change.buildingValue, formatCurrency)}</li>
          {change.newlyExposed.length > 0 && (
            <li className="text-amber-200">Newly exposed: {change.newlyExposed.join(', ')}</li>
          )}
          {change.noLongerExposed.length > 0 && (
            <li>No longer exposed: {change.noLongerExposed.join(', ')}</li>
          )}
          {change.speedChanges.map(item => (
            <li
              key={`speed-${item.area}`}
              className={item.to > item.from ? 'text-amber-200' : undefined}
            >
              {item.area}: strongest wind {item.from} → {item.to} km/h
            </li>
          ))}
          {change.windChanges.map(item => (
            <li key={item.area} className={item.stronger ? 'text-amber-200' : undefined}>
              {item.area}: {item.stronger ? 'stronger' : 'weaker'} winds ({item.from} → {item.to})
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-slate-400">
        Small changes can reflect the forecast moving, not a real change in risk.
      </p>
    </div>
  );
}

type ForecastView = 'summary' | 'details';
const VIEW_PREFERENCE_KEY = 'ref-forecast-panel-view';

function readViewPreference(): ForecastView | null {
  try {
    const stored = window.localStorage.getItem(VIEW_PREFERENCE_KEY);
    return stored === 'summary' || stored === 'details' ? stored : null;
  } catch {
    return null; // private window, blocked storage: the default view is fine
  }
}

function saveViewPreference(view: ForecastView): void {
  try {
    window.localStorage.setItem(VIEW_PREFERENCE_KEY, view);
  } catch {
    /* a remembered tab is a convenience, not something to fail over */
  }
}

/** What the Summary view needs beyond the exposure itself. Without it the panel is the detailed view only. */
export interface ForecastSummaryContext {
  /** Every advisory of the storm with results, for the trend */
  timeline?: TimelinePoint[];
  /** Issue time of the newest advisory with results */
  latestIssuedAt?: string | null;
  /** The page already shows the "not the latest forecast" notice above, so the panel leaves it out */
  statusShownAbove?: boolean;
  onSwitchToLatest?: () => void;
  onSelectAdvisory?: (id: string) => void;
}

export function ForecastExposureSummary({
  exposure,
  event,
  areaFeatures,
  selectedRegion,
  onRegionClear,
  priority,
  countryName,
  areaLabel,
  previous,
  summary,
}: {
  exposure: ForecastExposure;
  /** Turns on the Summary view (plain-language key points) beside the detailed one */
  summary?: ForecastSummaryContext;
  /** The advisory before this one, for "what changed" */
  previous?: { record: EventRecord; exposure: ForecastExposure } | null;
  /** Operational priority for this forecast (per-country thresholds) */
  priority?: ResponsePriority | null;
  countryName?: string;
  areaLabel?: string;
  event: EventRecord | null;
  /** The run's regional-impacts features, for an area council picked on the map */
  areaFeatures?: GeoJSON.FeatureCollection | null;
  selectedRegion?: string | null;
  onRegionClear?: () => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const region = findExposureArea(exposure, areaFeatures, selectedRegion);
  const area = region ?? exposure.national;
  const totals = area?.exposed;
  const exposedDanger = exposure.byWindDanger.filter(band => isExposedDanger(band.label));
  const exposedPopulation = exposedDanger.reduce((sum, band) => sum + band.totals.population, 0);
  // An area's own band; for the whole country the strongest band anywhere (the national row can lag it)
  const headerWinds = region
    ? region.overallWinds
    : (strongestBandLabel(exposure) ?? area?.overallWinds);

  const [view, setView] = useState<ForecastView>('summary');
  useEffect(() => {
    const stored = readViewPreference();
    if (stored) setView(stored);
  }, []);
  const chooseView = (next: ForecastView) => {
    setView(next);
    saveViewPreference(next);
  };
  const issuedAt = event?.trackIssuedTime || event?.date || null;
  const insight = useMemo(
    () =>
      summary
        ? buildForecastInsight({
            exposure,
            countryName: countryName ?? 'this country',
            issuedAt,
            latestIssuedAt: summary.latestIssuedAt ?? null,
            timeline: summary.timeline ?? [],
          })
        : null,
    [summary, exposure, countryName, issuedAt]
  );
  // An area picked on the map is a question about detail, so it shows the details
  const showSummary = Boolean(insight) && view === 'summary' && !region;
  // The page header shows the notice for an old advisory, older or newest-but-aging alike
  const statusShownAbove = insight?.status.kind !== 'latest' && Boolean(summary?.statusShownAbove);
  const bannerShown = Boolean(insight) && insight!.status.kind !== 'latest' && !statusShownAbove;

  return (
    <div className={PANEL_CLASSES} data-testid="summary-panel">
      <div className="p-4 border-b border-borderGlow bg-surface/95 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-100">Exposure Forecast</h2>
          <button
            type="button"
            onClick={() => setShowInfo(open => !open)}
            aria-expanded={showInfo}
            aria-controls="forecast-info"
            aria-label="About this forecast"
            title="About this forecast"
            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
              showInfo
                ? 'border-sky-400/60 bg-sky-500/20 text-sky-100'
                : 'border-slate-600/60 text-slate-300 hover:border-sky-500/40 hover:text-sky-200'
            }`}
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          {area ? area.name : 'National'}
          {headerWinds
            ? ` · ${parseWindBand(headerWinds) ? 'up to ' : ''}${windAreaLabel(headerWinds)}`
            : ''}
        </p>
        {region && onRegionClear && (
          <button
            type="button"
            onClick={onRegionClear}
            className="mt-2 text-xs text-sky-300 hover:text-sky-200 underline"
          >
            Show national totals
          </button>
        )}
        {insight && (
          <div
            role="tablist"
            aria-label="Forecast view"
            className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-800/80 p-1"
          >
            {(['summary', 'details'] as const).map(id => {
              const selected = (showSummary ? 'summary' : 'details') === id;
              return (
                <button
                  key={id}
                  id={`forecast-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="forecast-view-panel"
                  onClick={() => {
                    // Back to the summary means back to the whole country
                    if (id === 'summary') onRegionClear?.();
                    chooseView(id);
                  }}
                  className={`min-h-[44px] rounded-md px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
                    selected
                      ? 'bg-sky-400 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
                  }`}
                >
                  {id === 'summary' ? 'Summary' : 'Details'}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div
        id="forecast-view-panel"
        role={insight ? 'tabpanel' : undefined}
        aria-labelledby={
          insight ? `forecast-tab-${showSummary ? 'summary' : 'details'}` : undefined
        }
        className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3"
      >
        {insight && bannerShown && (
          <AdvisoryStatusBanner
            status={insight.status}
            onSwitchToLatest={summary?.onSwitchToLatest}
          />
        )}
        {showSummary && insight ? (
          <ForecastSummaryView
            insight={insight}
            showStatus={!bannerShown && !statusShownAbove}
            onSwitchToLatest={summary?.onSwitchToLatest}
            onSelectAdvisory={summary?.onSelectAdvisory}
            onShowDetails={() => chooseView('details')}
            onAbout={() => {
              setShowInfo(true);
              chooseView('details');
            }}
          />
        ) : (
          <>
            <p className="text-xs font-medium text-sky-200/90" data-testid="forecast-signal-short">
              {FORECAST_SIGNAL}
            </p>
            {showInfo && <ForecastInfo event={event} />}
            {!bannerShown && !statusShownAbove && <AdvisoryAgeLine event={event} />}
            {previous && <AdvisoryChange exposure={exposure} previous={previous} />}
            {totals ? (
              <>
                <HeroMetric
                  label="People exposed to forecast winds"
                  value={formatNumber(totals.population)}
                  subtitle={
                    area && area.totalPopulation > 0
                      ? `${formatPercent((totals.population / area.totalPopulation) * 100, 0)} of ${formatNumber(area.totalPopulation)} people`
                      : 'Under gale-force winds or stronger'
                  }
                  icon={Users}
                  color="orange"
                />
                <HeroMetric
                  label="Buildings in forecast wind zones"
                  value={formatNumber(totals.buildings)}
                  subtitle={`${formatNumber(totals.residentialBuildings)} residential`}
                  icon={Home}
                  color="amber"
                />
                <HeroMetric
                  label="Building value potentially exposed"
                  value={formatCurrency(totals.buildingValue)}
                  subtitle="Replacement value, not expected loss"
                  icon={DollarSign}
                  color="purple"
                />
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Facility icon={HeartPulse} label="Health" value={totals.healthFacilities} />
                  <Facility icon={GraduationCap} label="Schools" value={totals.schools} />
                  <Facility
                    icon={Building2}
                    label="Evac. centres"
                    value={totals.evacuationCentres}
                  />
                </div>
                {!region && priority && (
                  <ResponsePriorityPanel
                    priority={priority}
                    countryName={countryName ?? 'this country'}
                    areaLabel={areaLabel ?? 'areas'}
                  />
                )}
                {!region && <OperationalPriorities exposure={exposure} />}
              </>
            ) : null}

            {!region && exposedDanger.length > 0 && (
              <div className="space-y-2 rounded-lg border border-slate-700/50 bg-slate-800/60 p-3">
                <p className="text-xs font-semibold text-slate-200">People by forecast wind</p>
                {exposedDanger.map(band => (
                  <DangerBar
                    key={band.label}
                    band={band}
                    share={exposedPopulation > 0 ? band.totals.population / exposedPopulation : 0}
                  />
                ))}
                {area && area.populationInTrackUncertainty > 0 && (
                  <p className="text-xs text-slate-400 leading-snug">
                    A further {formatNumber(area.populationInTrackUncertainty)} people are within
                    the track’s uncertainty.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** What responders act on first: facilities, floodplain overlap, road length, worst-hit areas. */
function OperationalPriorities({ exposure }: { exposure: ForecastExposure }) {
  const p = operationalPriorities(exposure);
  return (
    <div
      className="space-y-2 rounded-lg border border-slate-700/50 bg-slate-800/60 p-3"
      data-testid="operational-priorities"
    >
      <p className="text-xs font-semibold text-slate-200">Operational priorities</p>
      <ul className="space-y-1 text-xs text-slate-300">
        <li className="flex items-center gap-2">
          <Waves className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
          {formatNumber(p.populationInFloodplains)} people in mapped floodplains
        </li>
        {p.facilitiesInFloodplain > 0 && (
          <li className="flex items-center gap-2">
            <Waves className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
            {formatNumber(p.facilitiesInFloodplain)} exposed facilities in floodplains
          </li>
        )}
        <li className="flex items-center gap-2">
          <Route className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
          {formatQuantity(p.roadKm)} km of road under forecast winds
        </li>
      </ul>
      {p.topAreas.length > 0 && (
        <div>
          <p className="mt-1 text-xs font-medium text-slate-400">Most people exposed</p>
          <ol className="mt-1 space-y-0.5 text-xs text-slate-300">
            {p.topAreas.map(area => (
              <li key={area.name} className="flex justify-between gap-2">
                <span>
                  {area.name}
                  {area.winds ? ` · ${area.winds}` : ''}
                </span>
                <span className="tabular-nums">{formatNumber(area.people)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/** The limits of the forecast, in plain words. */
function WindScaleKey() {
  return (
    <p className="text-xs leading-snug text-slate-300" data-testid="wind-scale-key">
      Strongest last: gale (63–88 km/h), storm (89–117 km/h), hurricane (118 km/h+). “Possible”
      means the winds lie within the track’s uncertainty, so they are less certain, not weaker.
    </p>
  );
}

function HowToRead() {
  return (
    <div className="text-xs leading-snug text-slate-300">
      <p className="text-xs font-semibold text-slate-200">How to read this forecast</p>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        <li>Exposure is what lies under forecast winds, not what will be damaged.</li>
        <li>
          Wind bands run gale, storm, hurricane, each with a “possible” version when only the
          track’s uncertainty reaches it. Rows in “By distance from track” are separate bands, not
          running totals.
        </li>
        <li>
          Track uncertainty is only one source of error. The wind field, building vulnerability,
          terrain, rain and coastal flooding are not forecast here.
        </li>
        <li>
          Floodplain overlap marks where flooding is possible, not that it will occur in this
          cyclone.
        </li>
        <li>
          Population, buildings, facilities and evacuation centres come from static datasets and may
          be out of date.
        </li>
        <li>Totals can hide local extremes: check the area table and the facilities on the map.</li>
        <li>Small changes between advisories can reflect forecast movement, not real change.</li>
      </ul>
    </div>
  );
}

/** How old the advisory is, always on show: a stale forecast must not look current. */
function AdvisoryAgeLine({ event }: { event: EventRecord | null }) {
  if (!event) return null;
  const issued = event.trackIssuedTime || event.date;
  const age = advisoryAge(issued);
  if (!age) return null;
  return (
    <p
      className={`flex items-start gap-1.5 text-xs ${age.stale ? 'text-amber-200' : 'text-slate-300'}`}
      data-testid="advisory-age"
    >
      {age.stale && (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      )}
      <span>
        Advisory issued {formatUtcDateTime(issued)} · {age.label}
        {age.stale ? ' · a newer advisory may be available; check before acting' : ''}
      </span>
    </p>
  );
}

/** What sits behind the (i) button: the explanation, the run's provenance, and how to read it. */
function ForecastInfo({ event }: { event: EventRecord | null }) {
  return (
    <div
      id="forecast-info"
      role="region"
      aria-label="About this forecast"
      className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-900/50 p-3"
      data-testid="forecast-info"
    >
      <ForecastNote />
      <ForecastFreshness event={event} />
      <WindScaleKey />
      <HowToRead />
    </div>
  );
}

function Facility({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/80 p-2">
      <Icon className="mx-auto h-4 w-4 text-sky-300" aria-hidden="true" />
      <div className="mt-1 text-sm font-semibold text-slate-100">{formatNumber(value)}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function DangerBar({ band, share }: { band: ExposureBand; share: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: windDangerColor(band.label) }}
            aria-hidden="true"
          />
          {band.label}
        </span>
        <span>{formatNumber(band.totals.population)}</span>
      </div>
      <div className="mt-1 h-1.5 rounded bg-slate-700/60">
        <div
          className="h-1.5 rounded"
          style={{
            width: `${Math.max(2, Math.round(share * 100))}%`,
            backgroundColor: windDangerColor(band.label),
          }}
        />
      </div>
    </div>
  );
}

type ForecastTab = 'regions' | 'wind' | 'distance' | 'facilities';

const COLUMNS: Array<{ key: keyof ExposureTotals; label: string; money?: boolean }> = [
  { key: 'population', label: 'People' },
  { key: 'buildings', label: 'Buildings' },
  { key: 'buildingValue', label: 'Building value', money: true },
  { key: 'roadKm', label: 'Road km' },
  { key: 'cropValue', label: 'Crop value', money: true },
  { key: 'healthFacilities', label: 'Health' },
  { key: 'schools', label: 'Schools' },
  { key: 'evacuationCentres', label: 'Evac. centres' },
];

export function ForecastExposureTables({
  exposure,
  areaLabel,
  selectedRegion,
  onRegionSelect,
}: {
  exposure: ForecastExposure;
  areaLabel: string;
  selectedRegion?: string | null;
  onRegionSelect?: (region: string) => void;
}) {
  const [tab, setTab] = useState<ForecastTab>('regions');
  const [showUnexposed, setShowUnexposed] = useState(false);
  const tabs: Array<{ id: ForecastTab; label: string }> = [
    { id: 'regions', label: `Exposure by ${areaLabel} (${exposure.regions.length})` },
    { id: 'wind', label: 'By forecast wind' },
    { id: 'distance', label: 'By distance from track' },
    ...(exposure.facilities.length > 0
      ? [{ id: 'facilities' as const, label: `Facilities (${exposure.facilities.length})` }]
      : []),
  ];

  const rows =
    tab === 'regions'
      ? exposure.regions.map(area => ({
          label: area.name,
          detail: parseWindBand(area.overallWinds)
            ? area.overallWinds
            : windAreaLabel(area.overallWinds),
          color: windDangerColor(area.overallWinds),
          totals: area.exposed,
        }))
      : (tab === 'wind' ? exposure.byWindDanger : exposure.byTrackDistance).map(band => ({
          label: band.label,
          detail: null,
          color: tab === 'wind' ? windDangerColor(band.label) : null,
          totals: band.totals,
        }));

  // Areas with nothing under forecast winds are rows of zeros; fold them away once there are several
  const nothingExposed = (totals: ExposureTotals) =>
    totals.population === 0 &&
    totals.buildings === 0 &&
    totals.roadKm === 0 &&
    totals.healthFacilities === 0 &&
    totals.schools === 0 &&
    totals.evacuationCentres === 0 &&
    totals.buildingValue === 0 &&
    totals.cropValue === 0;
  const isPicked = (label: string) =>
    !!selectedRegion && label.toLowerCase() === selectedRegion.toLowerCase();
  const unexposed =
    tab === 'regions' ? rows.filter(row => nothingExposed(row.totals) && !isPicked(row.label)) : [];
  const folded = unexposed.length >= 3 && !showUnexposed;
  const shownRows = folded ? rows.filter(row => !unexposed.includes(row)) : rows;
  const areasWord = `${areaLabel.toLowerCase()}${unexposed.length === 1 ? '' : 's'}`;

  return (
    <div
      className="h-[clamp(10rem,35vh,20rem)] glass-panel border-t border-white/10 flex flex-col overflow-hidden min-h-0"
      data-tour="data-workspace-panel"
    >
      <div
        className="flex overflow-x-auto border-b border-white/10 px-2 sm:px-4"
        role="tablist"
        aria-label="Exposure forecast tables"
      >
        {tabs.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`flex-shrink-0 whitespace-nowrap px-3 py-2 text-xs font-medium border-b-2 transition-colors sm:px-4 ${
              tab === item.id
                ? 'border-blue-400 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-3 sm:p-4">
        <p className="mb-2 text-xs font-medium text-sky-200/90" data-testid="forecast-signal">
          {FORECAST_SIGNAL}
        </p>
        {tab === 'regions' && (
          <p className="mb-2 text-xs text-slate-400">
            Exposed to gale-force winds or stronger, by the strongest forecast wind reaching each{' '}
            {areaLabel.toLowerCase()}.
          </p>
        )}
        {tab === 'distance' && (
          <p className="mb-2 text-xs text-slate-400">
            Each row counts only the people and assets between the ring before it and its own, so
            the rows add up to the whole country. Add the rows to get “everyone within” a distance.
          </p>
        )}
        {tab === 'wind' && (
          <p className="mb-2 text-xs text-slate-400">
            “Possible” bands lie within the forecast’s uncertainty; Track Uncertainty and Not
            exposed aren’t counted as exposed.
          </p>
        )}
        {tab === 'facilities' ? (
          <FacilityList
            facilities={exposure.facilities}
            areaLabel={areaLabel}
            selectedRegion={selectedRegion}
          />
        ) : (
          <table className="w-full text-xs text-slate-200">
            <thead>
              <tr className="text-left text-slate-400 border-b border-white/10">
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  {tab === 'regions' ? areaLabel : tab === 'wind' ? 'Forecast wind' : 'Distance'}
                </th>
                {COLUMNS.map(column => (
                  <th key={column.key} scope="col" className="py-1.5 px-2 text-right font-medium">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {folded && shownRows.length === 0 && (
                <tr data-testid="nothing-exposed-row">
                  <td colSpan={COLUMNS.length + 1} className="py-3 text-sm text-slate-300">
                    Nothing is under forecast winds in any {areaLabel.toLowerCase()}.
                  </td>
                </tr>
              )}
              {shownRows.map(row => {
                const selected =
                  tab === 'regions' &&
                  !!selectedRegion &&
                  row.label.toLowerCase() === selectedRegion.toLowerCase();
                return (
                  <tr
                    key={row.label}
                    className={`border-b border-white/5 ${selected ? 'bg-sky-500/10' : ''}`}
                  >
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                      {tab === 'regions' && onRegionSelect ? (
                        <button
                          type="button"
                          className="text-left hover:text-sky-300"
                          onClick={() => onRegionSelect(row.label)}
                        >
                          <RowLabel label={row.label} color={row.color} detail={row.detail} />
                        </button>
                      ) : (
                        <RowLabel label={row.label} color={row.color} detail={row.detail} />
                      )}
                    </th>
                    {COLUMNS.map(column => (
                      <td key={column.key} className="py-1.5 px-2 text-right tabular-nums">
                        {column.money
                          ? formatCurrency(row.totals[column.key])
                          : formatNumber(row.totals[column.key])}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {unexposed.length >= 3 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="py-2">
                    <button
                      type="button"
                      onClick={() => setShowUnexposed(open => !open)}
                      aria-expanded={showUnexposed}
                      className="min-h-[44px] text-sm text-sky-300 underline underline-offset-2 hover:text-sky-200"
                      data-testid="toggle-unexposed"
                    >
                      {showUnexposed
                        ? `Hide the ${unexposed.length} ${areasWord} with nothing exposed`
                        : `Show ${unexposed.length} ${areasWord} with nothing exposed`}
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const FACILITY_KINDS: Array<{ id: string; label: string; match: RegExp }> = [
  { id: 'all', label: 'All', match: /./ },
  { id: 'health', label: 'Health', match: /health/i },
  { id: 'school', label: 'Schools', match: /school/i },
  { id: 'evac', label: 'Evacuation centres', match: /evacuation/i },
];

/**
 * The named schools, health facilities and evacuation centres under forecast
 * winds. The counts elsewhere say how many; responders need to know which.
 */
export function FacilityList({
  facilities,
  areaLabel,
  selectedRegion,
}: {
  facilities: ExposedFacility[];
  areaLabel: string;
  selectedRegion?: string | null;
}) {
  const [kind, setKind] = useState('all');
  const region = (selectedRegion ?? '').trim().toLowerCase();
  const inRegion = region
    ? facilities.filter(facility => facility.area.trim().toLowerCase() === region)
    : facilities;
  // A region that has no facilities (or an id that names no area) shows them all
  const scoped = inRegion.length > 0 ? inRegion : facilities;
  const matcher = FACILITY_KINDS.find(item => item.id === kind)!.match;
  const shown = scoped.filter(facility => matcher.test(facility.asset));
  const detail = (facility: ExposedFacility) =>
    [
      facility.useType.replace(/_/g, ' ').replace(/,/g, ', ').trim(),
      facility.inFloodplain ? 'In floodplain' : '',
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <div data-testid="facility-list">
      <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Facility type">
        {FACILITY_KINDS.map(item => {
          const count = scoped.filter(facility => item.match.test(facility.asset)).length;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={kind === item.id}
              onClick={() => setKind(item.id)}
              className={`rounded-full border px-2 py-0.5 text-xs ${
                kind === item.id
                  ? 'border-sky-400/60 bg-sky-500/20 text-sky-50'
                  : 'border-slate-600/60 text-slate-300 hover:border-sky-500/40'
              }`}
            >
              {item.label} ({count})
            </button>
          );
        })}
      </div>
      <table className="w-full text-xs text-slate-200">
        <thead>
          <tr className="text-left text-slate-400 border-b border-white/10">
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Facility
            </th>
            <th scope="col" className="py-1.5 px-2 font-medium">
              Type
            </th>
            <th scope="col" className="py-1.5 px-2 font-medium">
              {areaLabel}
            </th>
            <th scope="col" className="py-1.5 px-2 font-medium">
              Forecast wind
            </th>
            <th scope="col" className="py-1.5 px-2 font-medium">
              Notes
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map(facility => (
            <tr key={facility.id} className="border-b border-white/5">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                {facility.name}
              </th>
              <td className="py-1.5 px-2">{facility.asset}</td>
              <td className="py-1.5 px-2">{facility.area}</td>
              <td className="py-1.5 px-2">
                {facility.danger ?? 'Not exposed'}
                {facility.windKmph != null ? ` (${Math.round(facility.windKmph)} km/h)` : ''}
              </td>
              <td className="py-1.5 px-2 text-slate-400">{detail(facility)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length === 0 && (
        <p className="mt-2 text-xs text-slate-400">No facilities of this type are exposed.</p>
      )}
    </div>
  );
}

function RowLabel({
  label,
  color,
  detail,
}: {
  label: string;
  color: string | null;
  detail: string | null;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {color && (
        <span
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
      {detail && <span className="text-xs text-slate-400">· {detail}</span>}
    </span>
  );
}
