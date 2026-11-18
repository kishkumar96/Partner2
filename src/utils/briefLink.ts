/**
 * The link printed as a QR code on the forecast brief. It should open the same forecast for whoever scans it, not
 * the exact screen the officer happened to be looking at: a panel left open, a selected area, a map position or a
 * playback frame make a phone open on something odd. Those are dropped; what says *which forecast* (the advisory,
 * the mode) and how it is drawn (basemap, layers, EEZ outlines) is kept.
 */
const TRANSIENT_PARAMS = [
  'panel',
  'map',
  'filters',
  'summary',
  'region',
  'story',
  'cyclone',
  'lat',
  'lng',
  'zoom',
];

export function briefDashboardLink(href: string): string {
  try {
    const url = new URL(href);
    for (const key of TRANSIENT_PARAMS) url.searchParams.delete(key);
    url.hash = '';
    return url.toString();
  } catch {
    return href;
  }
}
