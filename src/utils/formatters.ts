import { getHazardColor as getThemeHazardColor } from '@/theme/colors';

export function formatCurrency(value: number | undefined | null): string {
  if (value == null || isNaN(value)) {
    return '$0';
  }
  if (value >= 1000000000) {
    return `$${(value / 1000000000).toFixed(1)}B`;
  }
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value}`;
}

export function formatNumber(value: number | undefined | null): string {
  if (value == null || isNaN(value)) {
    return '0';
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
}

export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    low: "bg-green-500/20 text-green-300",
    medium: "bg-yellow-500/20 text-yellow-300",
    high: "bg-orange-500/20 text-orange-300",
    critical: "bg-red-500/20 text-red-300",
  };
  return colors[severity] || "bg-slate-800/70 text-slate-200";
}

export function getHazardColor(hazardId: string): string {
  return getThemeHazardColor(hazardId);
}
