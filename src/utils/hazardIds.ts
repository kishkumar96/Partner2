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

  // Other event types an Event can carry (see hazardIdForEventType)
  earthquake: 'earthquake',
  volcanic: 'volcanic',
  volcano: 'volcanic',
  volcanicactivity: 'volcanic',
  volcaniceruption: 'volcanic',
  tsunami: 'tsunami',
  landslide: 'landslide',
  drought: 'drought',
  stormsurge: 'storm-surge',
};

export function normalizeHazardId(hazardId: string): string {
  const normalized = hazardId.trim().toLowerCase().replace(/\s+/g, '-');
  const compact = normalized.replace(/[-_]/g, '');
  return HAZARD_ID_ALIASES[normalized] || HAZARD_ID_ALIASES[compact] || normalized;
}

export function normalizeHazardIds(hazardIds: string[]): string[] {
  return Array.from(new Set(hazardIds.map(normalizeHazardId).filter(Boolean)));
}

/**
 * The hazard an Event belongs to, from its event type name (the Partner API's
 * `event_type_name`, e.g. "Tropical Cyclone", "Earthquake"). Events with no
 * type are treated as cyclones, as every event was before types were read.
 */
export function hazardIdForEventType(eventType?: string | null): string {
  const name = (eventType ?? '').trim();
  return name ? normalizeHazardId(name) : 'tropical-cyclone';
}
