'use client';

import { useState } from 'react';
import { Flag, SlidersHorizontal } from 'lucide-react';
import { formatNumber } from '@/utils/formatters';
import type { PriorityLevel, PriorityResult } from '@/utils/responsePriority';
import type { ResponsePriority } from '@/utils/useResponsePriority';
import PriorityThresholdsEditor from './PriorityThresholdsEditor';

export const PRIORITY_STYLE: Record<
  PriorityLevel,
  { label: string; meaning: string; dot: string; text: string }
> = {
  red: { label: 'RED', meaning: 'Act now', dot: 'bg-red-500', text: 'text-red-300' },
  amber: { label: 'AMBER', meaning: 'Prepare', dot: 'bg-amber-400', text: 'text-amber-300' },
  green: { label: 'GREEN', meaning: 'Monitor', dot: 'bg-green-500', text: 'text-green-300' },
  grey: { label: 'GREY', meaning: 'Unknown', dot: 'bg-slate-400', text: 'text-slate-300' },
};

const QUEUE_PREVIEW = 5;

function Row({ result }: { result: PriorityResult }) {
  const m = result.metrics;
  return (
    <li className="rounded border border-slate-700/50 bg-slate-900/50 p-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-slate-100">{result.name}</span>
        <span className="tabular-nums text-slate-300">{formatNumber(m.people)} people</span>
      </div>
      <p className="text-xs text-slate-400">
        {formatNumber(m.healthFacilities)} health · {formatNumber(m.evacuationCentres)} evacuation
        centres · {formatNumber(m.peopleInFloodplains)} in floodplains
      </p>
      <details className="mt-1 text-xs text-slate-300">
        <summary className="cursor-pointer text-sky-300">Why this priority</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {result.reasons.map(reason => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </details>
    </li>
  );
}

/**
 * "Operational priority — preliminary": where to act first, with the rules'
 * reasons. Supports human decisions; it does not declare an emergency.
 */
export default function ResponsePriorityPanel({
  priority,
  countryName,
  areaLabel,
}: {
  priority: ResponsePriority;
  countryName: string;
  /** What the areas are called here, e.g. "districts" */
  areaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [showAllRed, setShowAllRed] = useState(false);
  const stale = priority.results.some(result => result.level === 'grey');
  const red = priority.results.filter(r => r.underlyingLevel === 'red');
  const amber = priority.results.filter(r => r.underlyingLevel === 'amber');
  const green = priority.results.filter(r => r.underlyingLevel === 'green');
  const shownRed = showAllRed ? red : red.slice(0, QUEUE_PREVIEW);
  const amberNames =
    amber
      .slice(0, 3)
      .map(result => result.name)
      .join(', ') + (amber.length > 3 ? ` and ${amber.length - 3} more` : '');

  return (
    <section
      className="space-y-2 rounded-lg border border-slate-600/60 bg-slate-800/60 p-3"
      aria-label="Operational priority"
      data-testid="response-priority"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
            <Flag className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
            Operational priority — preliminary
          </h3>
          <p className="text-xs leading-snug text-slate-400">
            Supports decisions; it does not declare an emergency. By {areaLabel}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(value => !value)}
          aria-expanded={editing}
          className="flex !min-h-[1.75rem] flex-shrink-0 items-center gap-1 rounded-md border border-slate-600/60 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-700/50"
        >
          <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
          Thresholds
        </button>
      </div>

      {stale && (
        <p
          role="note"
          className="rounded border border-slate-500/50 bg-slate-700/40 p-2 text-xs leading-snug text-slate-200"
          data-testid="priority-stale"
        >
          {priority.ageHours === null
            ? 'The advisory time is unknown'
            : `The advisory is older than ${priority.thresholds.staleAfterHours} h`}
          , so priorities are shown as unknown (grey). The rules’ reading is listed below for
          reference; check for a newer advisory before acting.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5" aria-label="Areas by priority">
        {(['red', 'amber', 'green'] as const).map(level => {
          const style = PRIORITY_STYLE[level];
          const count = priority.results.filter(r => r.underlyingLevel === level).length;
          return (
            <span
              key={level}
              className={`inline-flex items-center gap-1 rounded-full border border-slate-600/60 px-2 py-0.5 text-xs font-semibold ${style.text}`}
              data-testid={`priority-count-${level}`}
            >
              <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />
              {style.label} {count}
              <span className="font-normal text-slate-400">· {style.meaning}</span>
            </span>
          );
        })}
        {stale && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-slate-600/60 px-2 py-0.5 text-xs font-semibold text-slate-300"
            data-testid="priority-count-grey"
          >
            <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
            GREY {priority.counts.grey} · Unverified
          </span>
        )}
      </div>

      {red.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-red-300">
            RED · {red.length} priority {red.length === 1 ? 'area' : 'areas'}
          </p>
          <ol className="space-y-1.5">
            {shownRed.map(result => (
              <Row key={result.name} result={result} />
            ))}
          </ol>
          {red.length > QUEUE_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAllRed(value => !value)}
              className="mt-1 !min-h-0 text-xs text-sky-300 underline"
            >
              {showAllRed ? 'Show fewer' : `Show all ${red.length}`}
            </button>
          )}
        </div>
      )}

      {amber.length > 0 && (
        <details className="text-xs text-slate-200">
          <summary
            className={`cursor-pointer font-semibold ${stale ? 'text-slate-300' : 'text-amber-300'}`}
            data-testid="priority-amber-summary"
          >
            {stale ? 'Rules read AMBER' : 'AMBER'} · {amber.length} watch{' '}
            {amber.length === 1 ? 'area' : 'areas'}: {amberNames}
            {stale ? ' (unverified)' : ''}
          </summary>
          <p className="mt-1 text-xs text-slate-400">
            Confirm readiness and local contacts; monitor advisory changes.
          </p>
          <ol className="mt-1 space-y-1.5">
            {amber.map(result => (
              <Row key={result.name} result={result} />
            ))}
          </ol>
        </details>
      )}

      {green.length > 0 && (
        <p className="text-xs text-slate-400">
          GREEN · {green.length} {green.length === 1 ? 'area' : 'areas'} to monitor: no Red or Amber
          rule met.
        </p>
      )}

      {editing && (
        <PriorityThresholdsEditor
          countryName={countryName}
          thresholds={priority.thresholds}
          isCustom={priority.isCustom}
          counts={{ red: red.length, amber: amber.length, green: green.length }}
          onChange={priority.update}
          onReset={priority.reset}
        />
      )}
    </section>
  );
}
