/** Colours for a forecast's map layers, shared by the map, its legend and the PDF brief. */
export const FACILITY_COLORS: Record<string, string> = {
  'Health Facility': '#22d3ee',
  School: '#a78bfa',
  'Evacuation Centre': '#34d399',
};
export const FLOODPLAIN_COLOR = '#2563eb';
export const TRACK_COLOR = '#4c1d95';
export const PRIORITY_COLORS: Record<string, string> = {
  red: '#dc2626',
  amber: '#f59e0b',
  green: '#16a34a',
  grey: '#64748b',
};

/** Wind-radius rings by threshold: gale (34 kt) outermost, hurricane (64 kt) innermost */
export const WIND_RADIUS_COLORS = {
  gale: '#f59e0b',
  storm: '#ea580c',
  hurricane: '#b91c1c',
};

/** Advisory start points and the day markers on a track */
export const ORIGIN_COLORS = {
  selected: '#f59e0b',
  other: '#a78bfa',
  day: '#f97316',
};
