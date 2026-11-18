import fixture from './fixtures/xavier-run35.json';
import { extractPartnerRiskBundle } from '../realDataLoader';
import { scopeBundleToCountry } from '../countryScope';
import { buildForecastExposure, toArea } from '../forecastExposure';
import { forecastCsvRows } from '../forecastBriefing';

const exposureFromRun = (withCodes: boolean) => {
  const bundle = scopeBundleToCountry(
    extractPartnerRiskBundle(fixture.rows as Array<Record<string, unknown>>),
    'Cook Islands'
  );
  return buildForecastExposure({
    national: bundle.forecastNational,
    regional: bundle.regionalSummary,
    byWindSpeed: bundle.forecastByWindSpeed,
    byTrackDistance: bundle.forecastByTrackDistance,
    areaFeatures: withCodes ? bundle.regionalImpacts : null,
  })!;
};

const table = (rows: string[][]) => {
  const header = rows.find(row => row[0] === 'area')!;
  const body = rows.slice(rows.indexOf(header) + 1);
  const col = (name: string) => header.indexOf(name);
  return { header, body, col };
};

describe('forecast CSV on the real Xavier run', () => {
  const rows = forecastCsvRows(exposureFromRun(true), {
    eventName: 'Tropical Cyclone Xavier',
    countryName: 'Cook Islands',
    issuedAt: '2026-11-18T12:00:00Z',
  });
  const { header, body, col } = table(rows);

  it('fills area_code for every Cook Islands area (it was empty on every row)', () => {
    const areas = body.filter(row => row[0] !== 'Cook Islands');
    expect(areas).toHaveLength(13);
    for (const row of areas) expect(row[col('area_code')]).not.toBe('');
    const nassau = body.find(row => row[0] === 'Nassau')!;
    expect(nassau[col('area_code')]).toMatch(/\S/);
  });

  it('leaves the national row without a code: it is not an area', () => {
    expect(body.find(row => row[0] === 'Cook Islands')![col('area_code')]).toBe('');
  });

  it('names the country on the file and on every row', () => {
    expect(rows.find(row => row[0] === 'country')).toEqual(['country', 'Cook Islands']);
    for (const row of body) expect(row[col('country')]).toBe('Cook Islands');
  });

  it('has only Cook Islands rows: no Samoan or Tongan area', () => {
    const names = body.map(row => row[0]);
    expect(names).not.toContain("A'ana");
    expect(names).toHaveLength(14); // the country and 13 areas
  });

  it('gives the strongest wind in km/h, blank (not 0) when REF gave none', () => {
    const nassau = body.find(row => row[0] === 'Nassau')!;
    expect(nassau[col('strongest_forecast_wind')]).toBe('Radius of Maximum Winds');
    expect(nassau[col('strongest_wind_kmph')]).toBe('120');
    const unexposed = body.find(row => row[col('strongest_wind_kmph')] === '');
    expect(unexposed).toBeDefined();
  });

  it('keeps the original columns first, in their order, so positional readers still work', () => {
    expect(header.slice(0, 3)).toEqual(['area', 'area_code', 'strongest_forecast_wind']);
    expect(header[3]).toBe('people_exposed_to_forecast_winds');
    expect(header.indexOf('evacuation_centres_exposed')).toBe(11);
    expect(header.slice(12)).toEqual([
      'country',
      'strongest_wind_kmph',
      'people_in_track_uncertainty',
      'buildings_in_track_uncertainty',
    ]);
  });

  it('still reports the run’s national figures', () => {
    const national = body.find(row => row[0] === 'Cook Islands')!;
    expect(national[col('people_exposed_to_forecast_winds')]).toBe('533');
    expect(national[col('buildings_in_forecast_wind_zones')]).toBe('635');
  });
});

describe('forecast CSV area codes', () => {
  it('are left blank when the map layer is not there to look them up in', () => {
    const { body, col } = table(forecastCsvRows(exposureFromRun(false)));
    for (const row of body) expect(row[col('area_code')]).toBe('');
  });

  it('prefer the id a summary row carries to the map layer’s', () => {
    expect(toArea({ Region: 'Aitutaki', Region_ID: '9' }, 'Aitutaki', '77').code).toBe('9');
    expect(toArea({ Region: 'Aitutaki' }, 'Aitutaki', '77').code).toBe('77');
    expect(toArea({ Region: 'Aitutaki' }, 'Aitutaki').code).toBeNull();
  });

  it('match an area to its layer feature whatever the case or spacing of its name', () => {
    const exposure = buildForecastExposure({
      national: [],
      regional: [{ Region: ' RAROTONGA ', Overall_Winds: 'Gale Winds', Exposed_Population: 10 }],
      byWindSpeed: [],
      byTrackDistance: [],
      areaFeatures: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [0, 0] },
            properties: { 'Region.Region': 'Rarotonga', 'Region.ID': '14' },
          },
        ],
      },
    })!;
    expect(exposure.regions[0].code).toBe('14');
  });
});

describe('forecast CSV track uncertainty (QA: 338 people were missing from the export)', () => {
  const exposure = {
    national: toArea(
      {
        Region: 'Cook Islands',
        Overall_Winds: 'Possible Storm Winds',
        Exposed_Population: 100,
        Population_in_Track_Uncertainty: 338,
        Buildings_In_Track_Uncertainty: 120,
      },
      'Cook Islands'
    ),
    regions: [
      toArea(
        {
          Region: 'Manihiki',
          Overall_Winds: 'Track Uncertainty',
          Exposed_Population: 0,
          Population_in_Track_Uncertainty: 220,
          Buildings_In_Track_Uncertainty: 80,
        },
        'Manihiki'
      ),
      toArea(
        {
          Region: 'Rakahanga',
          Overall_Winds: 'Track Uncertainty',
          Exposed_Population: 0,
          Population_in_Track_Uncertainty: 118,
          Buildings_In_Track_Uncertainty: 40,
        },
        'Rakahanga'
      ),
    ],
  } as never;

  it('exports the people and buildings that are inside the track’s error but not exposed', () => {
    const { body, col } = table(forecastCsvRows(exposure, { countryName: 'Cook Islands' }));
    const byName = Object.fromEntries(body.map(row => [row[0], row]));
    expect(byName['Cook Islands'][col('people_in_track_uncertainty')]).toBe('338');
    expect(byName['Manihiki'][col('people_in_track_uncertainty')]).toBe('220');
    expect(byName['Rakahanga'][col('people_in_track_uncertainty')]).toBe('118');
    expect(byName['Manihiki'][col('buildings_in_track_uncertainty')]).toBe('80');
    // They are not exposed to forecast winds, and the exposed column says so
    expect(byName['Manihiki'][col('people_exposed_to_forecast_winds')]).toBe('0');
  });
});
