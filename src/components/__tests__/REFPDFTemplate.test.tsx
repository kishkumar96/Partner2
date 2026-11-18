import React from 'react';
import { render, screen } from '@testing-library/react';
import REFPDFTemplate from '../REFPDFTemplate';
import { buildForecastBrief } from '@/utils/forecastBrief';
import { exposureFixture } from '@/utils/testing/forecastFixtures';

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
