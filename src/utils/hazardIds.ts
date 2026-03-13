const HAZARD_ID_ALIASES: Record<string, string> = {
  tc: 'tropical-cyclone',
  tropicalcyclone: 'tropical-cyclone',
  tropical_cyclone: 'tropical-cyclone',
  'tropical-cyclone': 'tropical-cyclone',
  cyclone: 'tropical-cyclone',

  fl: 'flood',
  flood: 'flood',

  cyclonetrack: 'cyclone_track',
  cyclone_track: 'cyclone_track',

  inundation: 'inundation',
  floodwater: 'inundation',

  wind: 'wind',
};

export function normalizeHazardId(hazardId: string): string {
  const normalized = hazardId.trim().toLowerCase().replace(/\s+/g, '-');
  const compact = normalized.replace(/[-_]/g, '');
  return HAZARD_ID_ALIASES[normalized] || HAZARD_ID_ALIASES[compact] || normalized;
}

export function normalizeHazardIds(hazardIds: string[]): string[] {
  return Array.from(new Set(hazardIds.map(normalizeHazardId).filter(Boolean)));
}
