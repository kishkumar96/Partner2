import React from 'react';
import { render, screen } from '@testing-library/react';
import REFPDFTemplate from '../REFPDFTemplate';
import { buildForecastBrief } from '@/utils/forecastBrief';
import { exposureFixture } from '@/utils/testing/forecastFixtures';
import { defaultThresholds, prioritise } from '@/utils/responsePriority';
import { PRIORITY_COLORS } from '@/utils/forecastColors';

const brief = (over: Record<string, unknown> = {}) =>
  buildForecastBrief({
    exposure: exposureFixture({
      regions: [
        { name: 'Pukapuka', winds: 'Possible Storm Winds', people: 463 },
        { name: 'Nassau', winds: 'Radius of Maximum Winds', people: 70, maxWindKmph: 120 },
        { name: 'Aitutaki', winds: '', people: 0 },
        { name: 'Atiu', winds: '', people: 0 },
        { name: 'Mauke', winds: 'Not exposed', people: 0 },
      ],
    }),
    countryName: 'Cook Islands',
    eventName: 'Tropical Cyclone Xavier',
    issuedAt: '2026-11-18T12:00:00Z',
    layerSummary: 'Track · Wind swaths',
    areaLabel: 'islands',
    regionLabel: 'islands',
    generatedAt: new Date('2026-11-18T22:58:00Z'),
    ...over,
  } as never);

const renderBrief = (mapImageUrl?: string) =>
  render(
    <REFPDFTemplate brief={brief()} mapImageUrl={mapImageUrl} activeLayers={['track', 'swaths']} />
  );

describe('forecast brief page 1', () => {
  it('prints the title in a plain block: line-clamp cut it in half in the PDF', () => {
    renderBrief();
    const heading = screen.getByTestId('ref-brief-heading');
    expect(heading).toHaveTextContent('TC Xavier · Cook Islands');
    expect(heading.style.display).not.toBe('-webkit-box');
    expect(heading.getAttribute('style')).not.toMatch(/line-clamp/i);
    expect(heading.style.overflow).not.toBe('hidden');
  });

  it('shows the whole captured map, letterboxed, instead of cropping it to fit', () => {
    renderBrief('data:image/png;base64,AAAA');
    const image = screen.getByAltText('Forecast wind exposure map');
    expect(image.style.objectFit).toBe('contain');
  });
});

describe('forecast brief area table', () => {
  it('lists the areas that matter and counts the rest in one line, not a dozen rows of zeros', () => {
    const model = brief();
    expect(model.areaTable.rows.map(row => row[0])).toEqual(['Pukapuka', 'Nassau']);
    expect(model.areaTable.note).toBe('3 other areas: no forecast winds.');
  });

  it('prints the note under the table', () => {
    renderBrief();
    expect(screen.getAllByTestId('table-note')[0]).toHaveTextContent(
      '3 other areas: no forecast winds.'
    );
  });

  it('keeps an area that is only inside the track’s uncertainty', () => {
    const model = buildForecastBrief({
      exposure: exposureFixture({
        regions: [
          { name: 'Pukapuka', winds: 'Gale Winds', people: 50 },
          { name: 'Motu Tou', winds: 'Track Uncertainty', people: 0 },
          { name: 'Atiu', winds: '', people: 0 },
        ],
      }),
      countryName: 'Cook Islands',
      eventName: 'TC Xavier',
      issuedAt: '2026-11-18T12:00:00Z',
      layerSummary: 'Track',
      areaLabel: 'islands',
      regionLabel: 'islands',
      generatedAt: new Date('2026-11-18T22:58:00Z'),
    } as never);
    expect(model.areaTable.rows.map(row => row[0])).toEqual(['Pukapuka', 'Motu Tou']);
    expect(model.areaTable.note).toBe('1 other area: no forecast winds.');
  });

  it('has no note when every area is listed', () => {
    const model = buildForecastBrief({
      exposure: exposureFixture({
        regions: [{ name: 'Pukapuka', winds: 'Gale Winds', people: 50 }],
      }),
      countryName: 'Cook Islands',
      eventName: 'TC Xavier',
      issuedAt: '2026-11-18T12:00:00Z',
      layerSummary: 'Track',
      areaLabel: 'islands',
      regionLabel: 'islands',
      generatedAt: new Date('2026-11-18T22:58:00Z'),
    } as never);
    expect(model.areaTable.note).toBeUndefined();
  });

  it('names the core by its legend name, not as a plain band', () => {
    expect(brief().areaTable.rows.find(row => row[0] === 'Nassau')![1]).toBe(
      'Core (radius of max. winds)'
    );
  });
});

describe('forecast brief priorities for an old advisory', () => {
  const exposure = exposureFixture({
    regions: [
      { name: 'Pukapuka', winds: 'Possible Storm Winds', people: 463 },
      { name: 'Nassau', winds: 'Radius of Maximum Winds', people: 70, maxWindKmph: 120 },
      { name: 'Atiu', winds: '', people: 0 },
    ],
  });
  const withAge = (ageHours: number) => {
    const results = prioritise(
      exposure.regions.map(a => ({ name: a.name, area: a })),
      defaultThresholds(),
      ageHours
    );
    const counts = { red: 0, amber: 0, green: 0, grey: 0 };
    results.forEach(r => (counts[r.level] += 1));
    return buildForecastBrief({
      exposure,
      countryName: 'Cook Islands',
      eventName: 'Tropical Cyclone Xavier',
      issuedAt: '2026-11-18T12:00:00Z',
      layerSummary: 'Track',
      areaLabel: 'islands',
      regionLabel: 'islands',
      generatedAt: new Date('2026-11-22T22:58:00Z'),
      priority: { results, counts, isCustom: false, staleAfterHours: 24, ageHours },
    } as never);
  };
  const badges = () => screen.getAllByTestId('ref-brief-level');
  const rgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
  };

  it('draws the levels of a fresh advisory in their alert colours', () => {
    render(<REFPDFTemplate brief={withAge(2)} activeLayers={['track']} />);
    expect(badges().length).toBeGreaterThan(0);
    const colours = badges().map(b => b.style.background || b.style.backgroundColor);
    expect(colours).toEqual(
      expect.arrayContaining([rgb(PRIORITY_COLORS.amber), rgb(PRIORITY_COLORS.green)])
    );
    expect(badges().every(b => !b.hasAttribute('data-unverified'))).toBe(true);
    expect(screen.queryByTestId('ref-brief-unverified')).toBeNull();
  });

  it('greys them out, dashed and without an alert colour, once the advisory is too old to act on', () => {
    render(<REFPDFTemplate brief={withAge(100)} activeLayers={['track']} />);
    const alertColours = [PRIORITY_COLORS.red, PRIORITY_COLORS.amber, PRIORITY_COLORS.green].map(
      rgb
    );
    for (const badge of badges()) {
      expect(alertColours).not.toContain(badge.style.backgroundColor);
      expect(badge.style.border).toMatch(/dashed/);
      expect(badge.getAttribute('data-unverified')).toBe('true');
      expect(badge.style.whiteSpace).toBe('nowrap');
    }
  });

  it('still names each level, since the rules’ reading is kept for reference, and says why in a box', () => {
    render(<REFPDFTemplate brief={withAge(100)} activeLayers={['track']} />);
    expect(badges().map(b => b.textContent)).toEqual(['AMBER', 'GREEN']);
    const note = screen.getByTestId('ref-brief-unverified');
    expect(note).toHaveTextContent(/too old to act on/i);
    expect(note.style.border).toMatch(/solid/);
  });
});
