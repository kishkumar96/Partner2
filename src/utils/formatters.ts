export function formatCurrency(value: number): string {
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

export function formatNumber(value: number): string {
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
    low: "bg-green-100 text-green-800",
    medium: "bg-yellow-100 text-yellow-800",
    high: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800",
  };
  return colors[severity] || "bg-gray-100 text-gray-800";
}

export function getHazardColor(hazardId: string): string {
  const colors: Record<string, string> = {
    flood: "#3B82F6",
    drought: "#F59E0B",
    cyclone: "#8B5CF6",
    earthquake: "#EF4444",
    wildfire: "#F97316",
  };
  return colors[hazardId] || "#6B7280";
}
