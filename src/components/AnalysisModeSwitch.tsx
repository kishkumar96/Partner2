'use client';

export type AnalysisMode = 'forecast' | 'assessment' | 'scenarios' | 'history';

export const ANALYSIS_MODES: Record<
  AnalysisMode,
  { label: string; question: string; status: string; active: string }
> = {
  forecast: {
    label: 'Forecast',
    question: 'Rapid Exposure Forecast: what may be exposed under the latest advisory?',
    status: 'Forecast exposure',
    active: 'bg-amber-500/20 text-amber-200',
  },
  assessment: {
    label: 'Assessment',
    question: 'Post-event impact: what damage and loss occurred?',
    status: 'Post-event impact',
    active: 'bg-emerald-500/20 text-emerald-200',
  },
  scenarios: {
    label: 'Scenarios',
    question: 'Future risk: what could happen at a given return period and sea-level rise?',
    status: 'Scenario',
    active: 'bg-blue-500/20 text-blue-200',
  },
  history: {
    label: 'History',
    question: 'Past events: what happened in previous cyclones and swell events?',
    status: 'Historical event',
    active: 'bg-purple-500/20 text-purple-200',
  },
};

const ORDER: AnalysisMode[] = ['forecast', 'assessment', 'scenarios', 'history'];

interface AnalysisModeSwitchProps {
  /** Modes this country has data for; the rest are not offered */
  available: AnalysisMode[];
  active: AnalysisMode;
  onChange: (mode: AnalysisMode) => void;
}

/**
 * The one first decision: which kind of evidence am I looking at?
 * A segmented control from tablet width up, a compact dropdown on phones.
 */
export default function AnalysisModeSwitch({
  available,
  active,
  onChange,
}: AnalysisModeSwitchProps) {
  const modes = ORDER.filter(mode => available.includes(mode));
  if (modes.length === 0) return null;

  return (
    <div className="mt-1.5">
      <div
        role="group"
        aria-label="Analysis mode"
        className="hidden max-w-full rounded-lg border border-slate-600/60 bg-slate-900/50 p-0.5 sm:inline-flex"
      >
        {modes.map(mode => (
          <button
            key={mode}
            type="button"
            aria-pressed={active === mode}
            title={ANALYSIS_MODES[mode].question}
            onClick={() => active !== mode && onChange(mode)}
            className={`shrink-0 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              active === mode ? ANALYSIS_MODES[mode].active : 'text-slate-300 hover:bg-slate-700/50'
            }`}
          >
            {ANALYSIS_MODES[mode].label}
          </button>
        ))}
      </div>
      <label className="sm:hidden">
        <span className="sr-only">Analysis mode</span>
        <select
          value={active}
          onChange={event => onChange(event.target.value as AnalysisMode)}
          className="w-full rounded-lg border border-slate-600/60 bg-slate-900/70 px-2.5 py-1.5 text-xs font-semibold text-slate-100"
        >
          {modes.map(mode => (
            <option key={mode} value={mode}>
              {ANALYSIS_MODES[mode].label}: {ANALYSIS_MODES[mode].status}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
