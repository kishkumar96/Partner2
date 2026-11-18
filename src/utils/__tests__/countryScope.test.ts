import fixture from './fixtures/xavier-run35.json';
import { extractPartnerRiskBundle } from '../realDataLoader';
import { rowCountry, scopeNationalRows, scopeRows, scopeBundleToCountry } from '../countryScope';
import { buildForecastExposure } from '../forecastExposure';
import { buildForecastInsight } from '../forecastInsight';
import { forecastCsvRows } from '../forecastBriefing';
import { areaMetrics, defaultThresholds, prioritise } from '../responsePriority';

const unscoped = () => extractPartnerRiskBundle(fixture.rows as Array<Record<string, unknown>>);
const countriesOf = (rows: Array<Record<string, unknown>>) =>
  [...new Set(rows.map(rowCountry))].sort();

describe('TC Xavier 18 Nov 12:00 as the partner API served it', () => {
  it('really does mix three countries, which is what the dashboard must cope with', () => {
    const bundle = unscoped();
    expect(countriesOf(bundle.regionalSummary)).toEqual(['Cook Islands', 'Samoa', 'Tonga']);
    expect(countriesOf(bundle.forecastByWindSpeed)).toEqual(['Cook Islands', 'Samoa', 'Tonga']);
    expect(bundle.forecastNational).toHaveLength(3);
    expect(bundle.regionalImpacts?.features).toHaveLength(223);
  });

  describe('scoped to the Cook Islands', () => {
    const scoped = () => scopeBundleToCountry(unscoped(), 'Cook Islands');

    it('keeps only Cook Islands rows in every table and map layer', () => {
      const bundle = scoped();
      expect(countriesOf(bundle.regionalSummary)).toEqual(['Cook Islands']);
      expect(bundle.regionalSummary).toHaveLength(13);
      expect(countriesOf(bundle.forecastByWindSpeed)).toEqual(['Cook Islands']);
      expect(countriesOf(bundle.forecastByTrackDistance)).toEqual(['Cook Islands']);
      expect(bundle.forecastNational.map(row => row.Region)).toEqual(['Cook Islands']);
      expect(bundle.regionalImpacts?.features).toHaveLength(13);
      expect(
        bundle.exposureByCluster?.features.every(f => f.properties?.Country === 'Cook Islands')
      ).toBe(true);
    });

    it('says which neighbours the run also covered, so the dashboard can say what it left out', () => {
      expect(scoped().neighbouringCountries).toEqual(['Samoa', 'Tonga']);
    });

    it('is not fooled by case or spacing in the name', () => {
      expect(scopeBundleToCountry(unscoped(), '  cook ISLANDS ').regionalSummary).toHaveLength(13);
    });

    describe('what the officer sees', () => {
      const exposure = () => {
        const bundle = scoped();
        return buildForecastExposure({
          national: bundle.forecastNational,
          regional: bundle.regionalSummary,
          byWindSpeed: bundle.forecastByWindSpeed,
          byTrackDistance: bundle.forecastByTrackDistance,
          facilities: bundle.exposureByCluster,
          neighbouringCountries: bundle.neighbouringCountries,
        })!;
      };

      it('lists 13 areas, all Cook Islands, with the national figures unchanged', () => {
        const e = exposure();
        expect(e.regions).toHaveLength(13);
        expect(e.national?.exposed.population).toBe(533);
        expect(e.national?.exposed.buildings).toBe(635);
        expect(e.neighbouringCountries).toEqual(['Samoa', 'Tonga']);
      });

      it('has the wind table of the Cook Islands alone: 15,279 people, none of Samoa’s', () => {
        const total = exposure().byWindDanger.reduce(
          (sum, band) => sum + band.totals.population,
          0
        );
        expect(total).toBe(15279);
      });

      it('has no Samoan or Tongan area in the priority list, the CSV or the headline', () => {
        const e = exposure();
        const priority = prioritise(
          e.regions.map(area => ({ name: area.name, area })),
          defaultThresholds(),
          3
        );
        const names = priority.map(r => r.name);
        expect(names).not.toContain("A'ana");
        expect(names).not.toContain('Lotofaga');
        expect(names).toHaveLength(13);
        const csvAreas = forecastCsvRows(e).map(row => row[0]);
        expect(csvAreas).not.toContain("A'ana");
        const { headline } = buildForecastInsight({ exposure: e, countryName: 'Cook Islands' });
        expect(headline).toMatch(/Nassau/);
      });

      it('rates Nassau, in the core, above green (QA C2 on the real run)', () => {
        const e = exposure();
        const nassau = e.regions.find(a => a.name === 'Nassau')!;
        expect(nassau.overallWinds).toBe('Radius of Maximum Winds');
        expect(areaMetrics(nassau).windBand).toBeGreaterThan(3);
      });
    });
  });

  it('leaves another country’s dashboard its own rows', () => {
    const samoa = scopeBundleToCountry(unscoped(), 'Samoa');
    expect(countriesOf(samoa.regionalSummary)).toEqual(['Samoa']);
    expect(samoa.neighbouringCountries).toEqual(['Cook Islands', 'Tonga']);
  });
});

describe('scopeRows', () => {
  const country = (row: { c?: string }) => row.c ?? '';

  it('keeps rows with no country: no column is not a neighbour', () => {
    const { rows, others } = scopeRows(
      [{ c: 'Samoa' }, {}, { c: 'Cook Islands' }],
      'Cook Islands',
      country
    );
    expect(rows).toEqual([{}, { c: 'Cook Islands' }]);
    expect(others).toEqual(['Samoa']);
  });

  it('leaves a table whole when nothing matches the name, rather than blanking it', () => {
    const input = [{ c: 'Samoa' }, { c: 'Tonga' }];
    const { rows, others } = scopeRows(input, 'Cook Isles', country);
    expect(rows).toEqual(input);
    expect(others).toEqual([]);
  });

  it('is fine with an empty table', () => {
    expect(scopeRows([], 'Cook Islands', country)).toEqual({ rows: [], others: [] });
  });
});

describe('scopeNationalRows', () => {
  it('picks the country’s own row by Region, and treats the others as neighbours', () => {
    const { rows, others } = scopeNationalRows(
      [{ Region: 'Samoa' }, { Region: 'Cook Islands' }, { Region: 'Tonga' }],
      'Cook Islands'
    );
    expect(rows).toEqual([{ Region: 'Cook Islands' }]);
    expect(others).toEqual(['Samoa', 'Tonga']);
  });
});

describe('rowCountry', () => {
  it('reads the three spellings the API uses, and nothing else', () => {
    expect(rowCountry({ Country: 'Samoa' })).toBe('Samoa');
    expect(rowCountry({ 'Region.Country': ' Tonga ' })).toBe('Tonga');
    expect(rowCountry({ country: 'Fiji' })).toBe('Fiji');
    expect(rowCountry({ Country: 3 })).toBe('');
    expect(rowCountry(null)).toBe('');
  });
});
