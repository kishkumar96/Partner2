'use client';

export type AnalysisMode = 'forecast' | 'assessment' | 'scenarios' | 'history';

export const ANALYSIS_MODES: Record<
  AnalysisMode,
  {
    label: string;
    question: string;
    status: string;
    active: string;
    /** The model behind the mode, so its abbreviation can be spelled out where it is shown */
    acronym?: string;
    fullName?: string;
  }
> = {
  forecast: {
    label: 'Forecast',
    acronym: 'REF',
    fullName: 'Rapid Exposure Forecast',
    question: 'what may be exposed under the latest advisory?',
    status: 'Forecast exposure',
    active: 'bg-amber-500/20 text-amber-200',
  },
  assessment: {
    label: 'Post Disaster Analysis',
    question: 'Post-event: what damage and loss occurred?',
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

/** "REF · Rapid Exposure Forecast: what may be exposed…" for the modes that name a model, else the question */
export function modeTooltip(mode: AnalysisMode): string {
  const { acronym, fullName, question } = ANALYSIS_MODES[mode];
  return acronym && fullName ? `${acronym} · ${fullName}: ${question}` : question;
}

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
    <div className="w-full sm:w-auto">
      <div
        role="group"
        aria-label="Analysis mode"
        className="hidden max-w-full flex-wrap gap-1 rounded-lg border border-slate-600/60 bg-slate-900/50 p-1 sm:inline-flex"
      >
        {modes.map(mode => {
          const { label, acronym, fullName } = ANALYSIS_MODES[mode];
          const named = acronym && fullName ? `${fullName} (${acronym})` : null;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={active === mode}
              aria-label={named ?? undefined}
              title={modeTooltip(mode)}
              onClick={() => active !== mode && onChange(mode)}
              className={`shrink-0 rounded-md border px-3.5 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
                active === mode
                  ? `${ANALYSIS_MODES[mode].active} border-current/25`
                  : 'border-transparent text-slate-300 hover:bg-slate-700/50 hover:text-white'
              }`}
            >
              {named ? (
                <>
                  {/* The full name needs the width; below large screens it is the label and the
                      abbreviation. The button's aria-label carries the full name either way. */}
                  <span aria-hidden="true" className="hidden lg:inline">
                    {named}
                  </span>
                  <span aria-hidden="true" className="lg:hidden">
                    {label} ({acronym})
                  </span>
                </>
              ) : (
                label
              )}
            </button>
          );
        })}
      </div>
      <label className="sm:hidden">
        <span className="sr-only">Analysis mode</span>
        <select
          value={active}
          onChange={event => onChange(event.target.value as AnalysisMode)}
          className="w-full rounded-lg border border-slate-600/60 bg-slate-900/70 px-2.5 py-1.5 text-xs font-semibold text-slate-100"
        >
          {modes.map(mode => (
            <option key={mode} value={mode} title={modeTooltip(mode)}>
              {ANALYSIS_MODES[mode].label}
              {ANALYSIS_MODES[mode].acronym ? ` (${ANALYSIS_MODES[mode].acronym})` : ''}:{' '}
              {ANALYSIS_MODES[mode].status}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
