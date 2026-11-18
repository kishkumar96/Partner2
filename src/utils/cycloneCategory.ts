/** Classification is source-specific; a country's location does not establish its scale. */
export type CycloneScale = 'australian' | 'saffir-simpson';
export interface CycloneSourceContext {
  scale?: CycloneScale;
  windUnit?: 'kt' | 'km/h' | 'm/s';
  averagingMinutes?: 1 | 10;
  source?: string;
  phase?: 'observed' | 'forecast';
  status?: string;
}

export interface CycloneClassification extends CycloneSourceContext {
  category: number | null;
  provenance: 'reported' | 'derived' | 'unknown';
}

// Australian: MetService / Fiji scale, 10-minute mean. Saffir–Simpson: NHC, 1-minute mean.
// https://about.metservice.com/tropical-cyclone-monitoring
// https://www.nhc.noaa.gov/aboutsshws.php
export const CATEGORY_THRESHOLDS: Record<CycloneScale, readonly number[]> = {
  australian: [34, 48, 64, 86, 108],
  'saffir-simpson': [64, 83, 96, 113, 137],
};

export function windInKnots(value: number | null, unit?: CycloneSourceContext['windUnit']) {
  if (
    value === null ||
    !Number.isFinite(value) ||
    value < 0 ||
    !unit ||
    !['kt', 'km/h', 'm/s'].includes(unit)
  )
    return null;
  return unit === 'km/h' ? value / 1.852 : unit === 'm/s' ? value / 0.5144444444444445 : value;
}

export function resolveCycloneCategory(
  reported: number | null | undefined,
  wind: number | null,
  context: CycloneSourceContext = {}
): CycloneClassification {
  if (
    typeof reported === 'number' &&
    Number.isInteger(reported) &&
    reported >= 1 &&
    reported <= 5
  ) {
    return { ...context, category: reported, provenance: 'reported' };
  }
  // Explicit non-category codes and invalid source values must not be reclassified from wind.
  if (reported !== null && reported !== undefined) {
    return { ...context, category: null, provenance: 'unknown' };
  }
  if (
    /^(ex[- ]?tropical|extra[- ]?tropical|post[- ]?tropical|subtropical|tropical depression|tropical disturbance)/i.test(
      context.status ?? ''
    )
  ) {
    return { ...context, category: null, provenance: 'unknown' };
  }
  const knots = windInKnots(wind, context.windUnit);
  const periodMatches =
    context.scale === 'australian'
      ? context.averagingMinutes === 10
      : context.scale === 'saffir-simpson' && context.averagingMinutes === 1;
  if (!context.scale || !periodMatches || knots === null) {
    return { ...context, category: null, provenance: 'unknown' };
  }
  const category = CATEGORY_THRESHOLDS[context.scale].filter(
    threshold => knots >= threshold
  ).length;
  return { ...context, category: category || null, provenance: category ? 'derived' : 'unknown' };
}

export function cycloneScaleLabel(scale?: CycloneScale) {
  return scale === 'australian'
    ? 'Australian scale · 10-minute mean'
    : scale === 'saffir-simpson'
      ? 'Saffir–Simpson · 1-minute mean'
      : 'Scale unspecified';
}

export function formatCycloneTime(time: Date) {
  return `${time.toLocaleString('en-GB', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })} UTC`;
}

export function formatCycloneMetric(value: number | null | undefined, unit = '') {
  return value == null || !Number.isFinite(value)
    ? 'Unavailable'
    : `${Math.round(value)}${unit ? ` ${unit}` : ''}`;
}
