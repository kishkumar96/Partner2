import { WIND_DANGER_ORDER, windDangerColor } from '@/utils/forecastExposure';
import { windBandShortLabel } from '@/utils/windScale';
import { BASEMAP_STYLES } from '@/utils/basemaps';
import { EEZ_ATTRIBUTION } from '@/utils/pacificEez';

/**
 * What a map PNG export needs beyond the map itself: a footer that says what it shows, when it was made, where
 * the data and basemap come from, and (for a forecast) what the colours mean. Pure functions, so the wording and
 * the layout are tested; the dashboard only supplies a canvas.
 *
 * QA found the old footer had no legend, clipped its attribution off the right edge, credited "THREDDS" (a
 * server, not a source), gave the export time with no time zone, was 960 px wide although the tour promised
 * high resolution, and named the file only by country and local date.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "19 Nov 2026 06:30 UTC": always UTC and always says so, since a regional map is read across time zones */
export function formatExportTimestamp(date: Date): string {
  return `${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/** "20261119T0630Z", for file names */
export function exportStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}Z`;
}

/**
 * The scale to render the export map at: sharp (2x) where it fits, less where it would not. Canvases have a
 * longest-side limit and a memory cost, and a phone's budget is smaller than a desktop's.
 */
export function exportPixelRatio(
  width: number,
  height: number,
  requested = 2,
  maxEdge = 4096,
  maxPixels = 16_000_000
): number {
  if (!(width > 0) || !(height > 0)) return 1;
  let ratio = Math.max(1, requested);
  ratio = Math.min(ratio, maxEdge / Math.max(width, height));
  ratio = Math.min(ratio, Math.sqrt(maxPixels / (width * height)));
  return Math.max(1, Math.floor(ratio * 100) / 100);
}

/** The basemap's own credit. Carto's styles are built on OpenStreetMap, and both are required. */
export function basemapCredit(basemapStyle: string | undefined): string {
  const carto = Object.values(BASEMAP_STYLES).includes(
    (basemapStyle ?? '') as (typeof BASEMAP_STYLES)[keyof typeof BASEMAP_STYLES]
  );
  return carto || !basemapStyle
    ? 'Basemap: © OpenStreetMap contributors © CARTO'
    : 'Basemap: © OpenStreetMap contributors';
}

/**
 * Credits for the footer: the basemap, the Pacific EEZ outlines when drawn, and the data's owner. The data is
 * credited to the Pacific Community, not to a server name.
 */
export function mapExportCredits(options: { basemapStyle?: string; eezVisible?: boolean }): string {
  return [
    basemapCredit(options.basemapStyle),
    options.eezVisible ? EEZ_ATTRIBUTION : null,
    'Data: Pacific Community (SPC)',
  ]
    .filter(Boolean)
    .join(' · ');
}

const slug = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');

/**
 * "pdie-map-ck-xavier-2026111812-exported-20261119T0630Z.png": the country, the storm and advisory when there
 * is one, and the UTC time it was made, so two exports never share a name and a name says what it holds.
 */
export function mapExportFilename(options: {
  countryCode: string;
  eventName?: string | null;
  /** The advisory's issue time, ISO */
  issuedAt?: string | null;
  exportedAt: Date;
}): string {
  const parts = ['pdie-map', slug(options.countryCode) || 'country'];
  const event = options.eventName
    ? slug(options.eventName.replace(/^tropical cyclone\s+/i, ''))
    : '';
  if (event) parts.push(event);
  const issued = options.issuedAt ? new Date(options.issuedAt) : null;
  if (issued && !Number.isNaN(issued.getTime())) {
    parts.push(
      `${issued.getUTCFullYear()}${pad(issued.getUTCMonth() + 1)}${pad(issued.getUTCDate())}${pad(issued.getUTCHours())}`
    );
  }
  parts.push(`exported-${exportStamp(options.exportedAt)}`);
  return `${parts.join('-')}.png`;
}

export interface LegendItem {
  label: string;
  color: string;
}

/** The forecast's wind bands, strongest first: the colours of the area shading */
export function forecastLegendItems(): LegendItem[] {
  return [...WIND_DANGER_ORDER]
    .reverse()
    .map(band => ({ label: windBandShortLabel(band), color: windDangerColor(band) }));
}

/** Words wrapped to a width. A single word wider than the width goes on a line of its own. */
export function wrapText(
  measure: (text: string) => number,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface ExportFooterInput {
  headline: string;
  context: string;
  exportedAt: Date;
  credits: string;
  legendTitle?: string;
  legend?: LegendItem[];
}

export interface FooterText {
  kind: 'text';
  text: string;
  x: number;
  y: number;
  font: string;
  color: string;
}
export interface FooterSwatch {
  kind: 'swatch';
  x: number;
  y: number;
  size: number;
  color: string;
}
export interface FooterLayout {
  /** Height in canvas pixels */
  height: number;
  items: Array<FooterText | FooterSwatch>;
}

const FONT = 'system-ui, -apple-system, sans-serif';

/**
 * Lays the footer out for a canvas `width` pixels wide at `ratio` times CSS size. `measure(text, font)` is the
 * canvas's own text measurement. Every line is wrapped to fit, so nothing runs off the right edge, and the
 * footer grows to the lines it needs, so nothing is cut off at the bottom.
 */
export function layoutExportFooter(
  measure: (text: string, font: string) => number,
  width: number,
  ratio: number,
  input: ExportFooterInput
): FooterLayout {
  const pad = Math.round(14 * ratio);
  const usable = Math.max(1, width - pad * 2);
  const items: FooterLayout['items'] = [];
  let y = pad;

  const block = (text: string, size: number, weight: number, color: string, gapAfter: number) => {
    const font = `${weight} ${Math.round(size * ratio)}px ${FONT}`;
    const lineHeight = Math.round(size * ratio * 1.3);
    for (const line of wrapText(t => measure(t, font), text, usable)) {
      y += lineHeight;
      items.push({
        kind: 'text',
        text: line,
        x: pad,
        y: y - Math.round(lineHeight * 0.25),
        font,
        color,
      });
    }
    y += Math.round(gapAfter * ratio);
  };

  block(input.headline, 15, 600, '#f8fafc', 2);
  block(input.context, 12, 400, '#cbd5e1', 6);

  if (input.legend && input.legend.length > 0) {
    const size = Math.round(12 * ratio);
    const font = `400 ${size}px ${FONT}`;
    const swatch = Math.round(11 * ratio);
    const gap = Math.round(14 * ratio);
    const rowHeight = Math.round(size * 1.5);
    const title = input.legendTitle ? `${input.legendTitle}: ` : '';
    let x = pad;
    let rowY = y;
    if (title) {
      rowY += rowHeight;
      items.push({
        kind: 'text',
        text: title.trim(),
        x: pad,
        y: rowY - Math.round(size * 0.3),
        font: `600 ${size}px ${FONT}`,
        color: '#e2e8f0',
      });
      x += measure(title, `600 ${size}px ${FONT}`) + gap;
    } else {
      rowY += rowHeight;
    }
    for (const entry of input.legend) {
      const entryWidth = swatch + Math.round(5 * ratio) + measure(entry.label, font);
      if (x > pad && x + entryWidth > width - pad) {
        x = pad;
        rowY += rowHeight;
      }
      items.push({
        kind: 'swatch',
        x,
        y: rowY - swatch - Math.round(size * 0.05),
        size: swatch,
        color: entry.color,
      });
      items.push({
        kind: 'text',
        text: entry.label,
        x: x + swatch + Math.round(5 * ratio),
        y: rowY - Math.round(size * 0.3),
        font,
        color: '#cbd5e1',
      });
      x += entryWidth + gap;
    }
    y = rowY + Math.round(6 * ratio);
  }

  block(input.credits, 11, 400, '#94a3b8', 2);
  block(`Exported ${formatExportTimestamp(input.exportedAt)}`, 11, 400, '#94a3b8', 0);
  return { height: y + pad, items };
}

/** Draws a laid-out footer below the map, from `top` down */
export function drawExportFooter(
  ctx: {
    fillStyle: string | CanvasGradient | CanvasPattern;
    font: string;
    textAlign: CanvasTextAlign;
    fillRect: (x: number, y: number, w: number, h: number) => void;
    fillText: (text: string, x: number, y: number) => void;
  },
  layout: FooterLayout,
  top: number,
  width: number
) {
  ctx.fillStyle = 'rgba(15, 23, 42, 0.97)';
  ctx.fillRect(0, top, width, layout.height);
  ctx.textAlign = 'left';
  for (const item of layout.items) {
    ctx.fillStyle = item.color;
    if (item.kind === 'swatch') {
      ctx.fillRect(item.x, top + item.y, item.size, item.size);
    } else {
      ctx.font = item.font;
      ctx.fillText(item.text, item.x, top + item.y);
    }
  }
}
