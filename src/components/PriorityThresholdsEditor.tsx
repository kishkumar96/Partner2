'use client';

import { RotateCcw } from 'lucide-react';
import {
  METRIC_LABELS,
  type PriorityLevel,
  type PriorityMetric,
  type PriorityRule,
  type PriorityThresholds,
} from '@/utils/responsePriority';
import { WIND_DANGER_ORDER } from '@/utils/forecastExposure';

interface Props {
  countryName: string;
  thresholds: PriorityThresholds;
  isCustom: boolean;
  /** How many areas each level would have under these thresholds (updates as you edit) */
  counts?: Record<Exclude<PriorityLevel, 'grey'>, number>;
  onChange: (thresholds: PriorityThresholds) => void;
  onReset: () => void;
}

/** Short labels for the narrow side panel; the full ones stay as the accessible names. */
const SHORT_LABEL: Record<PriorityMetric, string> = {
  windBand: 'Wind at least',
  people: 'People ≥',
  peopleInFloodplains: 'In floodplain ≥',
  peopleInTrackUncertainty: 'In uncertainty ≥',
  healthFacilities: 'Health sites ≥',
  schools: 'Schools ≥',
  evacuationCentres: 'Evac. centres ≥',
};

const WIND_OPTION_LABEL = (band: string) =>
  band.replace(/ Winds$/, '').replace(/^Possible /, 'Possible ');

const LEVELS = {
  red: {
    title: 'Red',
    meaning: 'Act now',
    bar: 'border-l-red-500',
    dot: 'bg-red-500',
    text: 'text-red-300',
    pill: 'border-red-500/40 bg-red-500/10 text-red-200',
  },
  amber: {
    title: 'Amber',
    meaning: 'Prepare',
    bar: 'border-l-amber-400',
    dot: 'bg-amber-400',
    text: 'text-amber-300',
    pill: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  },
} as const;

// The app sets a 44px minimum height on every input and button; these are dense
// controls in a narrow panel, so they override it (!) and keep a comfortable height.
const field =
  '!min-h-[1.75rem] rounded-md border border-slate-600/70 bg-slate-950/60 px-1.5 py-1 text-[11px] text-slate-100 ' +
  'focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:opacity-50 ' +
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      // before: widens the tap area to 44px without enlarging the switch itself
      className={`relative mt-0.5 inline-flex !min-h-0 !min-w-0 h-4 w-7 flex-shrink-0 items-center rounded-full transition-colors before:absolute before:-inset-3 before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
        checked ? 'bg-sky-500' : 'bg-slate-600'
      }`}
    >
      <span
        className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-3.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

/**
 * Edit the rules behind a country's priorities. Changes apply at once and are
 * saved for this country only (in this browser).
 */
export default function PriorityThresholdsEditor({
  countryName,
  thresholds,
  isCustom,
  counts,
  onChange,
  onReset,
}: Props) {
  const setRule = (
    level: 'red' | 'amber',
    ruleId: string,
    next: (rule: PriorityRule) => PriorityRule
  ) =>
    onChange({
      ...thresholds,
      [level]: thresholds[level].map(rule => (rule.id === ruleId ? next(rule) : rule)),
    });

  const setMin = (
    level: 'red' | 'amber',
    rule: PriorityRule,
    metric: PriorityMetric,
    value: number
  ) =>
    setRule(level, rule.id, r => ({
      ...r,
      conditions: r.conditions.map(c =>
        c.metric === metric ? { ...c, min: Math.max(0, Number.isFinite(value) ? value : 0) } : c
      ),
    }));

  const renderLevel = (level: 'red' | 'amber') => {
    const style = LEVELS[level];
    return (
      <section
        className={`rounded-lg border border-slate-700/60 border-l-4 bg-slate-900/40 ${style.bar}`}
        aria-label={`${style.title} rules`}
      >
        <header className="flex items-center justify-between gap-2 px-2.5 pt-2">
          <h4 className={`flex items-center gap-1.5 text-[11px] font-semibold ${style.text}`}>
            <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />
            {style.title} · {style.meaning}
          </h4>
          <span className="text-[10px] text-slate-400">any rule</span>
        </header>
        <ul className="divide-y divide-slate-700/50 px-2.5 pb-1">
          {thresholds[level].map(rule => (
            <li key={rule.id} className={`py-2 ${rule.enabled ? '' : 'opacity-60'}`}>
              <div className="flex items-start gap-2">
                <Switch
                  checked={rule.enabled}
                  onChange={value => setRule(level, rule.id, r => ({ ...r, enabled: value }))}
                  label={`${rule.label} enabled`}
                />
                <span className="text-[11px] font-medium leading-snug text-slate-100">
                  {rule.label}
                </span>
              </div>
              <div className="mt-1.5 space-y-1 pl-9">
                {rule.conditions.map((condition, index) => (
                  <div key={condition.metric}>
                    {index > 0 && (
                      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                        and
                      </p>
                    )}
                    <label className="grid grid-cols-[minmax(0,1fr)_7.25rem] items-center gap-2 text-[10px] text-slate-300">
                      <span>{SHORT_LABEL[condition.metric]}</span>
                      {condition.metric === 'windBand' ? (
                        <select
                          value={condition.min}
                          disabled={!rule.enabled}
                          onChange={e => setMin(level, rule, 'windBand', Number(e.target.value))}
                          className={`${field} w-[7.25rem]`}
                          aria-label={`${rule.label}: forecast wind at least`}
                        >
                          {WIND_DANGER_ORDER.map((band, i) =>
                            i === 0 ? null : (
                              <option key={band} value={i}>
                                {WIND_OPTION_LABEL(band)}
                              </option>
                            )
                          )}
                        </select>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={condition.min}
                          disabled={!rule.enabled}
                          onChange={e =>
                            setMin(level, rule, condition.metric, Number(e.target.value))
                          }
                          className={`${field} w-[7.25rem] text-right tabular-nums`}
                          aria-label={`${rule.label}: ${METRIC_LABELS[condition.metric]}`}
                        />
                      )}
                    </label>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className="space-y-2.5 border-t border-slate-700/60 pt-3" data-testid="priority-editor">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold text-slate-100">Thresholds · {countryName}</h3>
        <span
          className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
            isCustom
              ? 'border-sky-400/40 bg-sky-400/10 text-sky-200'
              : 'border-slate-600/60 text-slate-400'
          }`}
        >
          {isCustom ? 'Custom' : 'Defaults'}
        </span>
      </div>

      {counts && (
        <div
          className="flex flex-wrap items-center gap-1.5 rounded-md bg-slate-900/60 px-2 py-1.5"
          data-testid="priority-editor-preview"
          aria-live="polite"
        >
          <span className="text-[10px] text-slate-400">With these rules:</span>
          {(['red', 'amber'] as const).map(level => (
            <span
              key={level}
              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${LEVELS[level].pill}`}
            >
              {LEVELS[level].title} {counts[level]}
            </span>
          ))}
          <span className="rounded-full border border-green-500/40 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-green-200">
            Green {counts.green}
          </span>
        </div>
      )}

      <p className="text-[10px] leading-snug text-slate-400">
        A level applies when <em>any</em> of its rules is met; a rule is met when <em>all</em> its
        conditions are. Saved for {countryName} only, in this browser; other countries keep their
        own.
      </p>

      {renderLevel('red')}
      {renderLevel('amber')}

      <section className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-2.5 py-2">
        <label className="flex items-center justify-between gap-2 text-[10px] text-slate-300">
          <span className="leading-snug">Advisory is unknown (grey) after</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={thresholds.staleAfterHours}
              onChange={e =>
                onChange({
                  ...thresholds,
                  staleAfterHours: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className={`${field} w-16 text-right tabular-nums`}
              aria-label="Treat an advisory older than this many hours as unknown"
            />
            <span className="text-[10px] text-slate-400">hours</span>
          </span>
        </label>
      </section>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] leading-snug text-slate-400">
          {isCustom ? `Saved for ${countryName}` : 'Starting defaults: review before use'}
        </span>
        <button
          type="button"
          onClick={onReset}
          disabled={!isCustom}
          className="inline-flex !min-h-[1.75rem] items-center gap-1 rounded-md border border-slate-600/70 px-2 py-1 text-[10px] font-medium text-slate-200 hover:bg-slate-700/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
