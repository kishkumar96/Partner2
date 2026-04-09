import { getHazardColor as getThemeHazardColor } from '@/theme/colors';

export function formatCurrency(value: number | undefined | null): string {
  if (value == null || isNaN(value)) {
    return '$0.00';
  }
  if (value >= 1000000000) {
    return `$${(value / 1000000000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}B`;
  }
  if (value >= 1000000) {
    return `$${(value / 1000000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}K`;
  }
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number | undefined | null): string {
  if (value == null || isNaN(value)) {
    return '0.00';
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}K`;
  }
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
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
