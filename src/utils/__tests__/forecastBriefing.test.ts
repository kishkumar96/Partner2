import {
  advisoryAge,
  forecastCsvRows,
  operationalPriorities,
  FORECAST_SIGNAL,
} from '../forecastBriefing';
import type { ExposureArea, ExposureTotals, ForecastExposure } from '../forecastExposure';

const totals = (over: Partial<ExposureTotals> = {}): ExposureTotals =>
  ({
    population: 0,
    buildings: 0,
    residentialBuildings: 0,
    nonresidentialBuildings: 0,
    buildingValue: 0,
    roadKm: 0,
    roadValue: 0,
    cropValue: 0,
    infrastructureValue: 0,
    evacuationCentres: 0,
    healthFacilities: 0,
    schools: 0,
    ...over,
  }) as ExposureTotals;

const area = (name: string, exposed: Partial<ExposureTotals>, over: Partial<ExposureArea> = {}) =>
  ({
    name,
    overallWinds: 'Hurricane Winds',
    minWindKmph: null,
    maxWindKmph: null,
    exposed: totals(exposed),
    inFloodplains: totals(),
    inTrackUncertainty: totals(),
    total: totals(),
    totalPopulation: 0,
    totalBuildings: 0,
    populationInFloodplains: 0,
    populationInTrackUncertainty: 0,
    ...over,
  }) as ExposureArea;

const exposure = (): ForecastExposure => ({
  national: area(
    'Vanuatu',
    { population: 1000, healthFacilities: 9, schools: 20, evacuationCentres: 4, roadKm: 55 },
    { populationInFloodplains: 300 }
  ),
  regions: [
    area('A', { population: 100, evacuationCentres: 1 }),
    area('B', { population: 500, evacuationCentres: 2 }),
    area('C', { population: 300 }),
    area('D', { population: 50 }),
  ],
  byWindDanger: [],
  byTrackDistance: [],
  facilities: [
    {
      id: '1',
      name: 'Clinic',
      asset: 'Health Facility',
      useType: '',
      area: 'B',
      danger: 'Hurricane Winds',
      windKmph: 100,
      trackDistance: '',
      inFloodplain: true,
    },
    {
      id: '2',
      name: 'School',
      asset: 'School',
      useType: '',
      area: 'B',
      danger: 'Hurricane Winds',
      windKmph: 100,
      trackDistance: '',
      inFloodplain: false,
    },
    {
      id: '3',
      name: 'Far clinic',
      asset: 'Health Facility',
      useType: '',
      area: 'C',
      danger: 'Not exposed',
      windKmph: 0,
      trackDistance: '',
      inFloodplain: true,
    },
  ],
  layers: {
    facilities: null,
    windSwaths: null,
    trackDistance: null,
    cycloneTrack: null,
    cycloneTrackSource: null,
    floodplainRowId: null,
  },
});

describe('advisoryAge', () => {
  const now = Date.parse('2026-04-08T17:00:00Z');
  it('reads hours for a recent advisory', () => {
    const age = advisoryAge('2026-04-08T12:00:00Z', now);
    expect(age?.label).toBe('5 hours ago');
    expect(age?.stale).toBe(false);
  });
  it('flags an advisory older than the usual issue interval', () => {
    expect(advisoryAge('2026-04-08T00:00:00Z', now)?.stale).toBe(true);
  });
  it('switches to days and months for old runs', () => {
    expect(advisoryAge('2026-04-05T17:00:00Z', now)?.label).toBe('3 days ago');
    expect(advisoryAge('2023-10-23T03:00:00Z', now)?.label).toMatch(/months? ago/);
  });
  it('returns null for a missing or unreadable time', () => {
    expect(advisoryAge(undefined, now)).toBeNull();
    expect(advisoryAge('not a date', now)).toBeNull();
  });
});

describe('operationalPriorities', () => {
  it('counts facilities, floodplain overlap and ranks the worst-hit areas', () => {
    const p = operationalPriorities(exposure());
    expect(p).toMatchObject({
      healthFacilities: 9,
      schools: 20,
      evacuationCentres: 4,
      populationInFloodplains: 300,
      roadKm: 55,
      facilitiesInFloodplain: 1, // the unexposed clinic does not count
    });
    expect(p.topAreas.map(a => a.name)).toEqual(['B', 'C', 'A']);
  });
});

describe('forecastCsvRows', () => {
  it('leads with the framing and provenance, then national and area rows', () => {
    const rows = forecastCsvRows(exposure(), {
      eventName: 'TC Lola',
      issuedAt: '2026-04-08T12:00:00Z',
    });
    expect(rows[0][0]).toContain(FORECAST_SIGNAL);
    expect(rows[1]).toEqual(['event', 'TC Lola']);
    const header = rows.find(r => r[0] === 'area')!;
    expect(header).toContain('people_exposed_to_forecast_winds');
    expect(header.join(',')).not.toMatch(/damage|loss|affected/i);
    expect(
      rows
        .filter(r => r.length > 2)
        .slice(1)
        .map(r => r[0])
    ).toEqual(['Vanuatu', 'A', 'B', 'C', 'D']);
  });
});
