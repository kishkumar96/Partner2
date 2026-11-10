'use client';

import { useEffect, useState } from 'react';
import type { EventRecord } from '@/data/eventRecords';
import { prependBasePath } from '@/utils/basePath';

const KIND_LABEL: Record<string, string> = {
  forecast: 'Forecast',
  observed: 'Post-disaster',
  scenario: 'Scenario',
};

function shortDate(date: string): string {
  const ms = Date.parse(date);
  return Number.isNaN(ms)
    ? ''
    : new Date(ms).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
}

/** A country's newest event on the landing page, so the list says where there is something to see */
export default function CountryLatestEvent({ countryCode }: { countryCode: string }) {
  const [state, setState] = useState<'loading' | 'none' | EventRecord>('loading');

  useEffect(() => {
    const controller = new AbortController();
    fetch(prependBasePath(`/api/events?country=${countryCode}`), { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(payload => {
        const events: EventRecord[] = Array.isArray(payload?.events) ? payload.events : [];
        const newest = [...events].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
        setState(newest ?? 'none');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('none');
      });
    return () => controller.abort();
  }, [countryCode]);

  if (state === 'loading') return <p className="mt-3 text-xs text-slate-500">Checking events…</p>;
  if (state === 'none') return <p className="mt-3 text-xs text-slate-500">No events yet</p>;
  const kind = state.eventKind ? KIND_LABEL[state.eventKind] : state.isForecast ? 'Forecast' : null;
  return (
    <p className="mt-3 text-xs text-slate-300">
      <span className="font-semibold text-slate-100">Latest:</span> {state.name}
      {kind ? ` · ${kind}` : ''}
      {shortDate(state.date) ? ` · ${shortDate(state.date)}` : ''}
    </p>
  );
}
