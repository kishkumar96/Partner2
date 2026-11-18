import type { CountryCode } from '@/types/thredds';

/**
 * Date and time labels along a forecast track, with a marker wherever the calendar day
 * changes. A forecaster reads "where will it be at 06Z on the 19th" straight off the map.
 *
 * Day changes are computed in the chosen zone, so they land where that zone's midnight is.
 * That matters near the dateline: Samoa and Tonga are on a different calendar day from UTC
 * for much of the day, and a day marker in the wrong zone would be a day out.
 */

export type TimeZoneMode = 'utc' | 'local';

/** Each country's civil time zone (IANA names, so DST rules come from the platform) */
export const COUNTRY_TIME_ZONES: Record<CountryCode, string> = {
  VU: 'Pacific/Efate',
  WS: 'Pacific/Apia',
  TO: 'Pacific/Tongatapu',
  CK: 'Pacific/Rarotonga',
};

export interface TrackTimePoint {
  time: Date;
  latitude: number;
  longitude: number;
}

export interface TrackTimeLabelProperties {
  /** `day` marks a change of calendar day; `time` is a labelled hour on the track */
  kind: 'day' | 'time';
  /** Text drawn on the map: "19 Nov", "06Z" or "06:00" */
  label: string;
  /** The instant, for the tooltip and tests */
  at: string;
  /** Lower sorts first, so a day label wins a collision with an hour label */
  sortKey: number;
}

export type TrackTimeLabelCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  TrackTimeLabelProperties
>;

const MS_PER_MINUTE = 60_000;

interface Parts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

function makePartsReader(timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (date: Date): Parts => {
    const parts = Object.fromEntries(
      formatter.formatToParts(date).map(part => [part.type, part.value])
    );
    return parts as unknown as Parts;
  };
}

const dayKey = (p: Parts) => `${p.year}-${p.month}-${p.day}`;

function makeDayLabeller(timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' });
  return (date: Date) => formatter.format(date);
}

/** "UTC" or "UTC+13", for the toggle and the legend. */
export function timeZoneName(
  mode: TimeZoneMode,
  countryCode: CountryCode,
  at = new Date()
): string {
  if (mode === 'utc') return 'UTC';
  try {
    const name = new Intl.DateTimeFormat('en-GB', {
      timeZone: COUNTRY_TIME_ZONES[countryCode],
      timeZoneName: 'shortOffset',
    })
      .formatToParts(at)
      .find(part => part.type === 'timeZoneName')?.value;
    return name ? name.replace('GMT', 'UTC') : 'local time';
  } catch {
    return 'local time';
  }
}

/** Walk the longitude the short way round, so a step across ±180° interpolates sensibly. */
function interpolate(a: TrackTimePoint, b: TrackTimePoint, t: number): [number, number] {
  const dLon = ((((b.longitude - a.longitude) % 360) + 540) % 360) - 180;
  const lon = a.longitude + dLon * t;
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return [wrapped, a.latitude + (b.latitude - a.latitude) * t];
}

/**
 * The first minute at which the day key differs from `from`'s, found by bisection.
 * `a` and `b` straddle a change of day.
 */
function firstInstantOfNewDay(a: Date, b: Date, read: (d: Date) => Parts): Date {
  const startKey = dayKey(read(a));
  let lo = a.getTime();
  let hi = b.getTime();
  while (hi - lo > MS_PER_MINUTE) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey(read(new Date(mid))) === startKey) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}

export interface TrackTimeLabelOptions {
  mode: TimeZoneMode;
  countryCode: CountryCode;
  /** Label every point that falls on a multiple of this many hours of UTC */
  everyHours?: number;
}

/**
 * Label features for a track: a day marker at each midnight (interpolated along the track
 * when no point falls exactly on it) and an hour label at each point on the grid.
 * Points without a valid time are skipped; fewer than two timed points gives nothing.
 */
export function buildTrackTimeLabels(
  points: TrackTimePoint[] | null | undefined,
  { mode, countryCode, everyHours = 6 }: TrackTimeLabelOptions
): TrackTimeLabelCollection | null {
  const timed = (points ?? [])
    .filter(p => p.time instanceof Date && !Number.isNaN(p.time.getTime()))
    .filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
    .sort((a, b) => a.time.getTime() - b.time.getTime());
  if (timed.length < 2) return null;

  const timeZone = mode === 'utc' ? 'UTC' : COUNTRY_TIME_ZONES[countryCode];
  const read = makePartsReader(timeZone);
  const dayLabel = makeDayLabeller(timeZone);
  const features: GeoJSON.Feature<GeoJSON.Point, TrackTimeLabelProperties>[] = [];
  const dayInstants: number[] = [];

  for (let i = 1; i < timed.length; i++) {
    const a = timed[i - 1];
    const b = timed[i];
    if (dayKey(read(a.time)) === dayKey(read(b.time))) continue;
    const midnight = firstInstantOfNewDay(a.time, b.time, read);
    const span = b.time.getTime() - a.time.getTime();
    const t = span > 0 ? (midnight.getTime() - a.time.getTime()) / span : 0;
    dayInstants.push(midnight.getTime());
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: interpolate(a, b, t) },
      properties: {
        kind: 'day',
        label: dayLabel(midnight),
        at: midnight.toISOString(),
        sortKey: 0,
      },
    });
  }

  for (const point of timed) {
    // Which points to label is chosen on the UTC grid, so a 6-hourly track keeps its labels in
    // a zone like Cook Islands (UTC-10) where those instants fall on 02:00, 08:00 ...
    if (point.time.getUTCMinutes() !== 0 || point.time.getUTCHours() % everyHours !== 0) continue;
    // A point on midnight is already carried by its day marker
    if (dayInstants.some(ms => Math.abs(ms - point.time.getTime()) < 30 * MS_PER_MINUTE)) continue;
    const parts = read(point.time);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
      properties: {
        kind: 'time',
        label: mode === 'utc' ? `${parts.hour}Z` : `${parts.hour}:${parts.minute}`,
        at: point.time.toISOString(),
        sortKey: 1,
      },
    });
  }

  return features.length > 0 ? { type: 'FeatureCollection', features } : null;
}
