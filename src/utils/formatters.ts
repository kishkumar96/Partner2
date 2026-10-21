import { getHazardColor as getThemeHazardColor } from '@/theme/colors';

export function formatCurrency(value: number | undefined | null): string {
  if (value == null || isNaN(value)) {
    return '$0';
  }
  if (value >= 1000000000) {
    return `$${(value / 1000000000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}B`;
  }
  if (value >= 1000000) {
    return `$${(value / 1000000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}K`;
  }
  // For whole numbers, don't show decimal places
  // For decimals, show up to 2 decimal places
  const isWholeNumber = Number.isInteger(value);
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: isWholeNumber ? 0 : 0,
    maximumFractionDigits: isWholeNumber ? 0 : 2,
  })}`;
}

export function formatNumber(value: number | undefined | null): string {
  if (value == null || isNaN(value)) {
    return '0';
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}K`;
  }
  // For whole numbers, don't show decimal places
  // For decimals, show up to 2 decimal places
  const isWholeNumber = Number.isInteger(value);
  return value.toLocaleString('en-US', {
    minimumFractionDigits: isWholeNumber ? 0 : 0,
    maximumFractionDigits: isWholeNumber ? 0 : 2,
  });
}

/**
 * A percentage that never rounds a real, non-zero share down to "0%".
 * `digits` is the number of decimals shown; a share too small for them reads
 * as "<1%" (or "<0.1%"), because "0%" would claim nothing is there.
 */
export function formatPercent(value: number | undefined | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '0%';
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  if (value !== 0 && rounded === 0) {
    const floor = (1 / factor).toFixed(digits);
    return value > 0 ? `<${floor}%` : `>-${floor}%`;
  }
  return `${rounded.toFixed(digits)}%`;
}

/**
 * A count (people, buildings, facilities) rounded to a whole number, where a
 * fraction under one still reads "<1" rather than "0".
 */
export function formatCount(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '0';
  const rounded = Math.round(value);
  if (value > 0 && rounded === 0) return '<1';
  return rounded.toLocaleString('en-US');
}

/**
 * A measured quantity (km of road, area): one decimal below 10 so a short
 * length keeps its size, whole numbers above; "<0.1" for a trace.
 */
export function formatQuantity(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  if (abs >= 10) return Math.round(value).toLocaleString('en-US');
  const rounded = Math.round(value * 10) / 10;
  if (value !== 0 && rounded === 0) return value > 0 ? '<0.1' : '>-0.1';
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/** Millions of dollars to one decimal, with "<$0.1M" for a real but tiny amount. */
export function formatMillionsUsd(valueInMillions: number | undefined | null): string {
  if (valueInMillions == null || !Number.isFinite(valueInMillions) || valueInMillions <= 0) {
    return '$0M';
  }
  return valueInMillions < 0.05 ? '<$0.1M' : `$${valueInMillions.toFixed(1)}M`;
}

/**
 * A timestamp in UTC with the zone stated ("2026-10-17 18:00 UTC"). Forecast
 * advisories are issued in UTC; a local time with no zone beside UTC times
 * leaves a duty officer unsure how old the data is.
 */
export function formatUtcDateTime(value: string | number | Date | null | undefined): string {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    low: 'bg-green-500/20 text-green-300',
    medium: 'bg-yellow-500/20 text-yellow-300',
    high: 'bg-orange-500/20 text-orange-300',
    critical: 'bg-red-500/20 text-red-300',
  };
  return colors[severity] || 'bg-slate-800/70 text-slate-200';
}

export function getHazardColor(hazardId: string): string {
  return getThemeHazardColor(hazardId);
}
