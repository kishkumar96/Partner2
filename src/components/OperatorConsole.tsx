'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { prependBasePath } from '@/utils/basePath';
import { CODE_TO_SLUG } from '@/utils/countrySlug';
import type { CountryCode } from '@/types/thredds';

// Operator page: a superuser submits a cyclone track by hand (Rapid forecast
// or PDNA best track) and follows the model runs it starts. All requests go
// through the /api/operator routes, which hold the Partner API token.

interface Runner {
  server_name: string;
  online: boolean;
  last_seen_at: string | null;
}
interface Pipeline {
  country: string | null;
  models: string[];
  runner: Runner;
}
interface TrackType {
  id: number;
  name: string;
  label: string;
  pipelines: Pipeline[];
}
interface Country {
  id: number;
  code: string;
  name: string;
}
interface RunSummary {
  id: number;
  status: 'queued' | 'running' | 'complete' | 'failed' | 'superseded';
  error: string;
  models: string[];
  runner: Runner;
  logs: string[];
  event: { id: number; title: string; country: string } | null;
}
interface SubmitResult {
  track: { id: number; cyclone_name: string; points: number };
  runs: RunSummary[];
  message: string | null;
}

const STATUS_STYLE: Record<RunSummary['status'], string> = {
  queued: 'bg-slate-600/40 text-slate-200',
  running: 'bg-blue-500/20 text-blue-200',
  complete: 'bg-emerald-500/20 text-emerald-200',
  failed: 'bg-red-500/20 text-red-200',
  superseded: 'bg-slate-600/40 text-slate-300',
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(prependBasePath(path), { cache: 'no-store', ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      (body && typeof body.detail === 'string' && body.detail) ||
        firstFieldError(body) ||
        `Error ${response.status}`
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body as T;
}

// DRF validation errors come back as { field: ["message"] }
function firstFieldError(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  for (const [field, value] of Object.entries(body as Record<string, unknown>)) {
    if (Array.isArray(value) && typeof value[0] === 'string')
      return `${field.replace(/_/g, ' ')}: ${value[0]}`;
  }
  return null;
}

/** Reads the CSV in the browser so the operator can check it before sending. */
export function previewTrackCsv(
  text: string
): { points: number; first?: string; last?: string } | string {
  const lines = text.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#'));
  if (lines.length < 2) return 'The file has no track rows.';
  const header = lines[0].split(',').map(h =>
    h
      .trim()
      .toLowerCase()
      .replace(/\[.*\]$/, '')
  );
  const lat = header.findIndex(h => h === 'latitude' || h === 'lat');
  const lon = header.findIndex(h => h === 'longitude' || h === 'lon');
  const time = header.findIndex(h => h === 'time');
  if (lat < 0 || lon < 0) return 'No Latitude / Longitude columns found.';
  const rows = lines.slice(1).map(line => line.split(','));
  const valid = rows.filter(
    r => Number.isFinite(parseFloat(r[lat])) && Number.isFinite(parseFloat(r[lon]))
  );
  if (valid.length === 0) return 'No rows with a latitude and longitude.';
  return {
    points: valid.length,
    first: time >= 0 ? valid[0][time] : undefined,
    last: time >= 0 ? valid[valid.length - 1][time] : undefined,
  };
}

function RunnerBadge({ runner }: { runner: Runner }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        runner.online ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-200'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${runner.online ? 'bg-emerald-400' : 'bg-amber-400'}`}
      />
      {runner.server_name}: {runner.online ? 'online' : 'offline'}
    </span>
  );
}

export default function OperatorConsole() {
  const [session, setSession] = useState<{ username: string } | null | undefined>(undefined);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [options, setOptions] = useState<{ track_types: TrackType[]; countries: Country[] } | null>(
    null
  );
  const [trackTypeId, setTrackTypeId] = useState<number | null>(null);
  const [countryId, setCountryId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [issued, setIssued] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof previewTrackCsv> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const loadOptions = useCallback(async () => {
    const data = await api<{ track_types: TrackType[]; countries: Country[] }>(
      '/api/operator/pipelines'
    );
    setOptions(data);
    setTrackTypeId(
      current => current ?? data.track_types.find(t => t.pipelines.length > 0)?.id ?? null
    );
    setCountryId(current => current ?? data.countries[0]?.id ?? null);
  }, []);

  useEffect(() => {
    api<{ username: string }>('/api/operator/session')
      .then(user => {
        setSession(user);
        return loadOptions();
      })
      .catch(() => setSession(null));
  }, [loadOptions]);

  // Follow the submitted track's runs until none is waiting or running
  useEffect(() => {
    if (!result || result.runs.every(run => !['queued', 'running'].includes(run.status))) return;
    const timer = window.setTimeout(async () => {
      try {
        const { runs } = await api<{ runs: RunSummary[] }>(
          `/api/operator/runs?track=${result.track.id}`
        );
        setResult(current => (current ? { ...current, runs } : current));
      } catch {
        // Keep the last known state; the next tick retries
        setResult(current => (current ? { ...current } : current));
      }
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [result]);

  const selectedType = options?.track_types.find(t => t.id === trackTypeId) ?? null;
  const selectedCountry = options?.countries.find(c => c.id === countryId) ?? null;
  const matchingPipelines = useMemo(
    () =>
      selectedType?.pipelines.filter(
        p => p.country === null || p.country === selectedCountry?.code
      ) ?? [],
    [selectedType, selectedCountry]
  );

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError(null);
    const form = new FormData(event.currentTarget);
    try {
      const user = await api<{ username: string }>('/api/operator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      });
      setSession(user);
      await loadOptions();
    } catch (error) {
      setLoginError((error as Error).message);
    }
  }

  async function signOut() {
    await fetch(prependBasePath('/api/operator/logout'), { method: 'POST' }).catch(() => undefined);
    setSession(null);
    setOptions(null);
    setResult(null);
  }

  async function chooseFile(next: File | null) {
    setFile(next);
    setPreview(next ? previewTrackCsv(await next.text()) : null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !trackTypeId || !countryId) return;
    setSubmitting(true);
    setSubmitError(null);
    const form = new FormData();
    form.set('cyclone_name', name.trim());
    form.set('issued_time', new Date(`${issued}:00Z`).toISOString());
    form.set('cyclone_track_type', String(trackTypeId));
    form.set('country', String(countryId));
    form.set('track_file', file);
    try {
      setResult(await api<SubmitResult>('/api/operator/tracks', { method: 'POST', body: form }));
    } catch (error) {
      if ((error as Error & { status?: number }).status === 401) setSession(null);
      setSubmitError((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const input =
    'w-full rounded-lg border border-slate-600/60 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400';
  const label = 'block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1';

  if (session === undefined) {
    return <p className="text-sm text-slate-400">Checking your session…</p>;
  }

  if (session === null) {
    return (
      <form onSubmit={signIn} className="max-w-sm space-y-4" aria-labelledby="operator-signin">
        <h2 id="operator-signin" className="text-lg font-semibold text-slate-100">
          Operator sign-in
        </h2>
        <p className="text-sm text-slate-400">
          Use a Partner API superuser account. It covers every country.
        </p>
        <div>
          <label htmlFor="operator-username" className={label}>
            Username
          </label>
          <input
            id="operator-username"
            name="username"
            autoComplete="username"
            required
            className={input}
          />
        </div>
        <div>
          <label htmlFor="operator-password" className={label}>
            Password
          </label>
          <input
            id="operator-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={input}
          />
        </div>
        {loginError && (
          <p role="alert" className="text-sm text-red-300">
            {loginError}
          </p>
        )}
        <button
          type="submit"
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
        >
          Sign in
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-100">Submit a cyclone track</h2>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          Signed in as <strong className="text-slate-200">{session.username}</strong>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg border border-slate-600/60 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>

      {!options ? (
        <p className="text-sm text-slate-400">Loading pipelines…</p>
      ) : (
        <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className={label}>Pipeline</legend>
            {options.track_types.map(type => (
              <label
                key={type.id}
                className={`block cursor-pointer rounded-lg border p-3 ${
                  type.id === trackTypeId
                    ? 'border-cyan-400/60 bg-cyan-500/10'
                    : 'border-slate-700 bg-slate-900/60'
                }`}
              >
                <input
                  type="radio"
                  name="track_type"
                  className="sr-only"
                  checked={type.id === trackTypeId}
                  onChange={() => setTrackTypeId(type.id)}
                />
                <span className="block text-sm font-semibold text-slate-100">{type.label}</span>
                <span className="block text-xs text-slate-400">Track type: {type.name}</span>
                {type.pipelines.length === 0 ? (
                  <span className="mt-1 block text-xs text-amber-200">No pipeline configured</span>
                ) : (
                  type.pipelines.map((pipeline, index) => (
                    <span
                      key={index}
                      className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-300"
                    >
                      {pipeline.models.join(' → ')}
                      {pipeline.country && <span>({pipeline.country} only)</span>}
                      <RunnerBadge runner={pipeline.runner} />
                    </span>
                  ))
                )}
              </label>
            ))}
          </fieldset>

          <div className="space-y-4">
            <div>
              <label htmlFor="operator-country" className={label}>
                Country
              </label>
              <select
                id="operator-country"
                className={input}
                value={countryId ?? ''}
                onChange={e => setCountryId(Number(e.target.value))}
              >
                {options.countries.map(country => (
                  <option key={country.id} value={country.id}>
                    {country.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="operator-name" className={label}>
                Cyclone name
              </label>
              <input
                id="operator-name"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. 2026042221_VAIANU"
                className={input}
              />
            </div>
            <div>
              <label htmlFor="operator-issued" className={label}>
                Issued (UTC)
              </label>
              <input
                id="operator-issued"
                type="datetime-local"
                required
                value={issued}
                onChange={e => setIssued(e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label htmlFor="operator-file" className={label}>
                Track file (CSV)
              </label>
              <input
                id="operator-file"
                type="file"
                accept=".csv,text/csv"
                required
                onChange={e => chooseFile(e.target.files?.[0] ?? null)}
                className={`${input} file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-slate-100`}
              />
              {preview &&
                (typeof preview === 'string' ? (
                  <p className="mt-1 text-xs text-red-300">{preview}</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-300">
                    {preview.points} track points
                    {preview.first && ` · ${preview.first} → ${preview.last}`}
                  </p>
                ))}
            </div>

            {matchingPipelines.length === 0 && selectedType && (
              <p role="note" className="text-xs text-amber-200">
                No pipeline runs {selectedType.label} tracks for {selectedCountry?.name}. The track
                will be saved, but no model will run.
              </p>
            )}
            {submitError && (
              <p role="alert" className="text-sm text-red-300">
                {submitError}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting || typeof preview === 'string'}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit track and start runs'}
            </button>
          </div>
        </form>
      )}

      {result && (
        <section
          aria-live="polite"
          className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
        >
          <h3 className="text-sm font-semibold text-slate-100">
            Track {result.track.cyclone_name} saved ({result.track.points} points)
          </h3>
          {result.message && <p className="text-sm text-amber-200">{result.message}</p>}
          {result.runs.map(run => (
            <div key={run.id} className="space-y-1 rounded-lg border border-slate-700/70 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-slate-100">Run {run.id}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[run.status]}`}
                >
                  {run.status}
                </span>
                <span className="text-xs text-slate-400">{run.models.join(' → ')}</span>
                <RunnerBadge runner={run.runner} />
              </div>
              {run.status === 'queued' && !run.runner.online && (
                <p className="text-xs text-amber-200">
                  Waiting: the runner {run.runner.server_name} hasn’t checked in. The run starts
                  when it does.
                </p>
              )}
              {run.error && <p className="whitespace-pre-wrap text-xs text-red-300">{run.error}</p>}
              {run.logs.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-slate-400">
                  {run.logs.map((entry, index) => (
                    <li key={index}>{entry.split('\n')[0]}</li>
                  ))}
                </ul>
              )}
              {run.event && (
                <a
                  className="text-xs font-semibold text-cyan-300 underline"
                  href={prependBasePath(
                    `/${CODE_TO_SLUG[run.event.country as CountryCode] ?? ''}?mode=event`
                  )}
                >
                  View {run.event.title} on the dashboard
                </a>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
