/**
 * Scenario losses read from files, for a partner API that has no `risk_scenario` endpoint.
 *
 * `manage.py publish_scenario_losses` writes the loss tables (by sea-level rise and return
 * period, and their split by sector and asset type) as compressed JSON beside the flood-depth
 * store, in the field names the API uses:
 *
 *   <bucket>/scenario_losses/v1/<CC>/scenarios.json
 *   <bucket>/scenario_losses/v1/<CC>/breakdown/<risk_information id>.json   {"<scenario id>": [rows]}
 *
 * The address comes from the `zarr` pointer row in `hazard_information`, so the dashboard knows
 * no bucket of its own. The files are served with `Content-Encoding: gzip`, which the browser
 * undoes. Only used when the API itself returns nothing; it never replaces a real answer.
 */
import type { HazardScenarioSelection } from '@/data/realThreddsLayers';

export const SCENARIO_LOSSES_FOLDER = 'scenario_losses/v1';

type Row = Record<string, unknown>;

/** The folder beside a Zarr store: `…/bucket/hazard_catalog.zarr` gives `…/bucket/scenario_losses/v1`. */
export function scenarioLossesBase(storeUrls: string[]): string | null {
  for (const raw of storeUrls) {
    try {
      const url = new URL(raw.trim().replace(/\/+$/, ''));
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length === 0) continue; // an address with no store in it
      const parent = segments.slice(0, -1).join('/');
      return `${url.origin}${parent ? `/${parent}` : ''}/${SCENARIO_LOSSES_FOLDER}`;
    } catch {
      // a pointer row with something other than an address is no use to us
    }
  }
  return null;
}

const bases = new Map<string, Promise<string | null>>();

/**
 * The folder for a country, found once per page load. Only a folder that was found is kept: a
 * missing pointer row, or a request that failed, is looked for again at the next figure.
 */
export function scenarioLossesBaseOf(
  key: string,
  find: () => Promise<string | null>
): Promise<string | null> {
  let base = bases.get(key);
  if (!base) {
    base = find().then(found => {
      if (found === null) bases.delete(key);
      return found;
    });
    bases.set(key, base);
    base.catch(() => bases.delete(key));
  }
  return base;
}

const files = new Map<string, Promise<unknown>>();

/**
 * The file's JSON. A server that sends `Content-Encoding: gzip` has the browser undo it; one that
 * does not hands over the gzip bytes themselves, which start 1f 8b and are undone here.
 */
async function readJson(response: Response): Promise<unknown> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const gzipped = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gzipped) return JSON.parse(new TextDecoder().decode(bytes));
  const plain = new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  );
  return plain.json();
}

/** One download per file; a failure is not remembered, so the next request tries again. */
function fetchFile(url: string, signal?: AbortSignal): Promise<unknown> {
  let pending = files.get(url);
  if (!pending) {
    pending = fetch(url, { signal }).then(response => {
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return readJson(response);
    });
    files.set(url, pending);
    pending.catch(() => files.delete(url));
  }
  return pending;
}

export function clearScenarioLossesCache(): void {
  files.clear();
  bases.clear();
}

/** Every scenario row of a country, or null when the files are not there. */
export async function loadScenarioRows(
  base: string,
  country: string,
  signal?: AbortSignal
): Promise<Row[] | null> {
  try {
    const rows = await fetchFile(`${base}/${country}/scenarios.json`, signal);
    return Array.isArray(rows) ? (rows as Row[]) : null;
  } catch {
    return null;
  }
}

/** One scenario's breakdown rows (sector and asset type together), or null when not published. */
export async function loadBreakdownRows(
  base: string,
  country: string,
  riskInformationId: number,
  riskScenarioId: number,
  signal?: AbortSignal
): Promise<Row[] | null> {
  try {
    const grouped = await fetchFile(
      `${base}/${country}/breakdown/${riskInformationId}.json`,
      signal
    );
    if (!grouped || typeof grouped !== 'object' || Array.isArray(grouped)) return null;
    const rows = (grouped as Record<string, unknown>)[String(riskScenarioId)];
    return Array.isArray(rows) ? (rows as Row[]) : null;
  } catch {
    return null;
  }
}

const num = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(parsed)
    ? null
    : parsed;
};

/**
 * The rows the API would return for the same request: the selection's sea-level rise, not an
 * annual-average row, and the return period and event only when the selection names one.
 */
export function selectScenarioRows(rows: Row[], scenario: HazardScenarioSelection): Row[] {
  return rows
    .filter(
      row =>
        num(row.slr_scenario_m) === scenario.slrScenarioM &&
        row.is_annual_average_loss !== true &&
        (scenario.returnPeriodYears === null ||
          num(row.return_period_years) === scenario.returnPeriodYears) &&
        (scenario.eventLabel === null || row.event_label === scenario.eventLabel)
    )
    .sort((a, b) => (num(a.id) ?? 0) - (num(b.id) ?? 0));
}
