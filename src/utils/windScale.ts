/**
 * The wind scale the forecast uses, in one place, so every screen describes winds the same way.
 *
 * REF names its wind areas "Gale Winds", "Possible Storm Winds" and so on. "Possible" means the winds
 * lie within the forecast track's uncertainty: less certain, not weaker. The numbers are the ones the
 * dashboard's own "how to read this" text gives: gale 63-88 km/h, storm 89-117 km/h, hurricane 118+.
 */

export type WindKind = 'gale' | 'storm' | 'hurricane';

export interface WindCategory {
  kind: WindKind;
  /** "Gale" */
  name: string;
  /** "gale-force", for "gale-force winds" */
  adjective: string;
  minKmph: number;
  /** null for the top category */
  maxKmph: number | null;
  minKnots: number;
  maxKnots: number | null;
}

export const WIND_CATEGORIES: Record<WindKind, WindCategory> = {
  gale: {
    kind: 'gale',
    name: 'Gale',
    adjective: 'gale-force',
    minKmph: 63,
    maxKmph: 88,
    minKnots: 34,
    maxKnots: 47,
  },
  storm: {
    kind: 'storm',
    name: 'Storm',
    adjective: 'storm-force',
    minKmph: 89,
    maxKmph: 117,
    minKnots: 48,
    maxKnots: 63,
  },
  hurricane: {
    kind: 'hurricane',
    name: 'Hurricane',
    adjective: 'hurricane-force',
    minKmph: 118,
    maxKmph: null,
    minKnots: 64,
    maxKnots: null,
  },
};

/** Least to most severe */
export const WIND_KINDS: WindKind[] = ['gale', 'storm', 'hurricane'];

export const windSeverity = (kind: WindKind): number => WIND_KINDS.indexOf(kind) + 1;

export interface WindBand {
  kind: WindKind;
  /** Inside the track's uncertainty only: less certain, not weaker */
  possible: boolean;
}

/** "Possible Storm Winds" -> { kind: 'storm', possible: true }; bands that are not winds -> null. */
export function parseWindBand(overallWinds: string | null | undefined): WindBand | null {
  if (!overallWinds) return null;
  const match = /^\s*(possible\s+)?(gale|storm|hurricane)\s+winds?\s*$/i.exec(overallWinds);
  if (!match) return null;
  return { kind: match[2].toLowerCase() as WindKind, possible: Boolean(match[1]) };
}

/** "63–88 km/h", or "118 km/h or more" for hurricane */
export function windRange(kind: WindKind): string {
  const category = WIND_CATEGORIES[kind];
  return category.maxKmph == null
    ? `${category.minKmph} km/h or more`
    : `${category.minKmph}–${category.maxKmph} km/h`;
}

/** REF also draws the ring of strongest winds around the centre; it is an area, not a wind category. */
export const RADIUS_OF_MAX_WINDS = 'Radius of Maximum Winds';

/**
 * Any REF wind area in plain words: "Gale Winds" -> "gale winds (63–88 km/h)",
 * "Radius of Maximum Winds" -> "inside the radius of maximum winds". Unknown names come back as given.
 */
export function windAreaLabel(name: string | null | undefined): string | null {
  if (!name) return null;
  if (name.trim().toLowerCase() === RADIUS_OF_MAX_WINDS.toLowerCase()) {
    return 'inside the radius of maximum winds';
  }
  return windBandLabel(name) ?? name.toLowerCase();
}

/** "possible gale winds (63–88 km/h)": the band by name and range, never by the band's edge speed. */
export function windBandLabel(overallWinds: string | null | undefined): string | null {
  const band = parseWindBand(overallWinds);
  if (!band) return null;
  return `${band.possible ? 'possible ' : ''}${band.kind} winds (${windRange(band.kind)})`;
}
