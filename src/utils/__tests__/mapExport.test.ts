import {
  basemapCredit,
  drawExportFooter,
  exportPixelRatio,
  exportStamp,
  forecastLegendItems,
  formatExportTimestamp,
  layoutExportFooter,
  mapExportCredits,
  mapExportFilename,
  wrapText,
  type FooterText,
} from '../mapExport';
import { BASEMAP_STYLES } from '../basemaps';

const at = new Date(Date.UTC(2026, 10, 19, 6, 30, 45));

describe('timestamps say UTC, and say it in the name too', () => {
  it('writes the export time in UTC with the zone', () => {
    expect(formatExportTimestamp(at)).toBe('19 Nov 2026 06:30 UTC');
    // The same instant in Samoa is the next day: the text must not follow the viewer's clock
    expect(formatExportTimestamp(new Date(Date.UTC(2026, 11, 31, 23, 59)))).toBe(
      '31 Dec 2026 23:59 UTC'
    );
  });

  it('stamps file names compactly in UTC', () => {
    expect(exportStamp(at)).toBe('20261119T0630Z');
  });
});

describe('exportPixelRatio', () => {
  it('is 2x for an ordinary map, so the export is high resolution', () => {
    expect(exportPixelRatio(960, 792)).toBe(2);
  });

  it('is capped by the longest side a canvas can have', () => {
    expect(exportPixelRatio(3000, 1000)).toBeCloseTo(1.36, 1);
    expect(exportPixelRatio(3000, 1000) * 3000).toBeLessThanOrEqual(4096);
  });

  it('is capped by a total pixel budget, for phones', () => {
    const ratio = exportPixelRatio(2400, 2400);
    expect(ratio * 2400 * ratio * 2400).toBeLessThanOrEqual(16_000_000);
  });

  it('is never below 1, and is 1 for a size it cannot use', () => {
    expect(exportPixelRatio(10000, 10000)).toBe(1);
    expect(exportPixelRatio(0, 0)).toBe(1);
    expect(exportPixelRatio(NaN, 100)).toBe(1);
  });
});

describe('credits', () => {
  it('credit OpenStreetMap and CARTO for the Carto basemaps', () => {
    for (const style of Object.values(BASEMAP_STYLES)) {
      expect(basemapCredit(style)).toBe('Basemap: © OpenStreetMap contributors © CARTO');
    }
  });

  it('credit the data to the Pacific Community, never to a server name', () => {
    const text = mapExportCredits({ basemapStyle: BASEMAP_STYLES.dark });
    expect(text).toContain('Data: Pacific Community (SPC)');
    expect(text).not.toMatch(/thredds/i);
  });

  it('add the EEZ source only when the outlines are drawn', () => {
    expect(mapExportCredits({ eezVisible: true })).toContain('Marine Regions (VLIZ), CC BY 4.0');
    expect(mapExportCredits({ eezVisible: false })).not.toContain('Marine Regions');
  });
});

describe('mapExportFilename', () => {
  it('names the country, storm, advisory and UTC export time', () => {
    expect(
      mapExportFilename({
        countryCode: 'CK',
        eventName: 'Tropical Cyclone Xavier',
        issuedAt: '2026-11-18T12:00:00Z',
        exportedAt: at,
      })
    ).toBe('pdie-map-ck-xavier-2026111812-exported-20261119T0630Z.png');
  });

  it('copes with no event or a bad time, and never makes an unsafe name', () => {
    expect(mapExportFilename({ countryCode: 'VU', exportedAt: at })).toBe(
      'pdie-map-vu-exported-20261119T0630Z.png'
    );
    const odd = mapExportFilename({
      countryCode: 'WS',
      eventName: 'Cyclone / Évan <2012>',
      issuedAt: 'not a date',
      exportedAt: at,
    });
    expect(odd).toMatch(/^[A-Za-z0-9-]+\.png$/);
    expect(odd).toContain('evan');
  });
});

describe('wrapText', () => {
  const measure = (t: string) => t.length * 10;

  it('wraps at word boundaries to the width', () => {
    expect(wrapText(measure, 'one two three four', 100)).toEqual(['one two', 'three four']);
  });

  it('keeps a word wider than the width on its own line, and returns nothing for no text', () => {
    expect(wrapText(measure, 'a supercalifragilistic b', 100)).toEqual([
      'a',
      'supercalifragilistic',
      'b',
    ]);
    expect(wrapText(measure, '   ', 100)).toEqual([]);
  });
});

describe('the footer', () => {
  const FONT_PX = /(\d+)px/;
  const measure = (text: string, font: string) =>
    text.length * (Number(FONT_PX.exec(font)?.[1] ?? 12) * 0.55);
  const input = {
    headline: 'Cook Islands Forecast Exposure Map',
    context: 'Exposure, not a damage estimate | Track issued: 18 Nov 2026 12:00 UTC',
    exportedAt: at,
    credits: mapExportCredits({ basemapStyle: BASEMAP_STYLES.positron, eezVisible: true }),
    legendTitle: 'Strongest forecast wind',
    legend: forecastLegendItems(),
  };

  it('keeps every line inside the image, however narrow it is (the old footer clipped its credits)', () => {
    for (const width of [640, 960, 1920]) {
      const ratio = width / 960;
      const layout = layoutExportFooter(measure, width, ratio, input);
      for (const item of layout.items) {
        if (item.kind === 'text') {
          expect(item.x + measure(item.text, item.font)).toBeLessThanOrEqual(width);
        } else {
          expect(item.x + item.size).toBeLessThanOrEqual(width);
        }
      }
    }
  });

  it('grows to hold what it says: a narrower image needs a taller footer', () => {
    const wide = layoutExportFooter(measure, 1920, 2, input);
    const narrow = layoutExportFooter(measure, 640, 1, input);
    const lines = (l: typeof wide) => l.items.filter(i => i.kind === 'text').length;
    expect(lines(narrow)).toBeGreaterThan(lines(wide) - 1);
    // Everything sits above the footer's bottom edge
    for (const layout of [wide, narrow]) {
      for (const item of layout.items) expect(item.y).toBeLessThan(layout.height);
    }
  });

  it('says what the image is, when it was made with its zone, and where the data comes from', () => {
    const texts = layoutExportFooter(measure, 1920, 2, input)
      .items.filter((i): i is FooterText => i.kind === 'text')
      .map(i => i.text)
      .join(' ');
    expect(texts).toContain('Cook Islands Forecast Exposure Map');
    expect(texts).toContain('Exported 19 Nov 2026 06:30 UTC');
    expect(texts).toContain('© OpenStreetMap contributors');
    expect(texts).toContain('Pacific Community (SPC)');
    expect(texts).not.toMatch(/thredds/i);
  });

  it('has a legend with a swatch and a name for every wind band, the core included', () => {
    const layout = layoutExportFooter(measure, 1920, 2, input);
    const swatches = layout.items.filter(i => i.kind === 'swatch');
    const labels = layout.items.filter((i): i is FooterText => i.kind === 'text').map(i => i.text);
    expect(swatches).toHaveLength(forecastLegendItems().length);
    expect(labels).toContain('Core (radius of max. winds)');
    expect(labels).toContain('Hurricane');
    expect(labels).toContain('Strongest forecast wind:');
  });

  it('has no legend block when there is no legend', () => {
    const layout = layoutExportFooter(measure, 960, 1, {
      ...input,
      legend: undefined,
      legendTitle: undefined,
    });
    expect(layout.items.filter(i => i.kind === 'swatch')).toHaveLength(0);
  });

  it('draws onto a canvas: a panel, then each swatch and line', () => {
    const calls: string[] = [];
    const ctx = {
      fillStyle: '' as string,
      font: '',
      textAlign: 'left' as CanvasTextAlign,
      fillRect: (x: number, y: number, w: number, h: number) =>
        calls.push(`rect ${x},${y},${w},${h}`),
      fillText: (text: string, x: number, y: number) => calls.push(`text ${text} ${x},${y}`),
    };
    const layout = layoutExportFooter(measure, 960, 1, input);
    drawExportFooter(ctx, layout, 800, 960);
    expect(calls[0]).toBe(`rect 0,800,960,${layout.height}`);
    expect(calls.filter(c => c.startsWith('rect')).length).toBe(1 + forecastLegendItems().length);
    // Lines are placed below the map's bottom edge
    const ys = calls.filter(c => c.startsWith('text')).map(c => Number(c.split(',').pop()));
    ys.forEach(y => expect(y).toBeGreaterThan(800));
  });
});
