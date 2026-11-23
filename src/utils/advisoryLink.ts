/**
 * Naming an advisory in a link, for good.
 *
 * The newest advisory of a storm keeps the Event's own id, and an older one is `<event>-run-<n>`
 * (see partnerEvents). So an id in a link means "that advisory" only until the next one arrives, when the
 * same id quietly means the newer. A situation report, or the QR code on a printed brief, would then show
 * a different forecast from the one it was made with. The model run's id never moves, so the address also
 * carries `advisory=<run id>`, and a link that has it opens that advisory, whichever is newest by then.
 */

/** What the id of a run may look like: it is read from the address, so only plain characters are taken */
const RUN_ID = /^[A-Za-z0-9_-]{1,40}$/;

export function parseAdvisoryPin(value: string | null | undefined): string | undefined {
  const text = (value ?? '').trim();
  return RUN_ID.test(text) ? text : undefined;
}

interface AdvisoryLike {
  id: string;
  isForecast?: boolean;
  forecastRunId?: string;
}

/** The run id to put in the address for the advisory on screen; nothing for an event that has no runs. */
export function advisoryPin(
  record: Pick<AdvisoryLike, 'isForecast' | 'forecastRunId'> | null | undefined
): string | undefined {
  return record?.isForecast ? parseAdvisoryPin(record.forecastRunId) : undefined;
}

/** The forecast advisory a link names, or null when that run is no longer there. */
export function findPinnedAdvisory<T extends AdvisoryLike>(
  records: readonly T[],
  pin: string | null | undefined
): T | null {
  const wanted = parseAdvisoryPin(pin);
  if (!wanted) return null;
  return records.find(record => record.isForecast && record.forecastRunId === wanted) ?? null;
}
