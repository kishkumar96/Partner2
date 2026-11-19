import type { CountryCode } from '@/types/thredds';
import { COUNTRY_TIME_ZONES, timeZoneName, type TimeZoneMode } from '@/utils/trackTimeLabels';

/**
 * The time span a forecast's wind shading covers, for the legend. The shading is "the strongest forecast
 * wind reaching each area", so a reader needs to know over what period: from the first to the last point of
 * the forecast track the run was made from. Shown in the same zone as the track's time labels.
 */
export interface ForecastPeriod {
  start: Date;
  end: Date;
  /** "18 Nov 18:00 – 24 Nov 00:00 UTC" */
  label: string;
}

function formatInstant(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('hour')}:${get('minute')}`;
}

/** Null when the track has fewer than two usable times: one point is a moment, not a period. */
export function forecastPeriod(
  points: ReadonlyArray<{ time: Date }> | null | undefined,
  mode: TimeZoneMode,
  countryCode: CountryCode
): ForecastPeriod | null {
  const times = (points ?? [])
    .map(point => point.time)
    .filter(time => time instanceof Date && Number.isFinite(time.getTime()))
    .map(time => time.getTime());
  if (times.length < 2) return null;
  const start = new Date(Math.min(...times));
  const end = new Date(Math.max(...times));
  if (start.getTime() === end.getTime()) return null;
  try {
    const zone = mode === 'utc' ? 'UTC' : COUNTRY_TIME_ZONES[countryCode];
    return {
      start,
      end,
      label: `${formatInstant(start, zone)} – ${formatInstant(end, zone)} ${timeZoneName(mode, countryCode, start)}`,
    };
  } catch {
    // An unknown zone on this platform: no label is better than a wrong one
    return null;
  }
}
