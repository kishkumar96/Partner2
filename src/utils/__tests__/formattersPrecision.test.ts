import {
  formatCount,
  formatMillionsUsd,
  formatPercent,
  formatQuantity,
  formatUtcDateTime,
} from '../formatters';
import { forecastCsvRows } from '../forecastBriefing';
import type { ForecastExposure } from '../forecastExposure';

describe('formatPercent', () => {
  it('never shows a real share as 0%', () => {
    expect(formatPercent(0.3, 0)).toBe('<1%');
    expect(formatPercent(0.04)).toBe('<0.1%');
  });

  it('shows ordinary values at the requested precision, and a true zero as 0', () => {
    expect(formatPercent(12.34)).toBe('12.3%');
    expect(formatPercent(12.6, 0)).toBe('13%');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(0, 0)).toBe('0%');
  });

  it('copes with missing or non-finite values', () => {
    expect(formatPercent(undefined)).toBe('0%');
    expect(formatPercent(NaN)).toBe('0%');
  });
});

describe('formatCount', () => {
  it('shows a fraction under one as "<1", not 0', () => {
    expect(formatCount(0.4)).toBe('<1');
  });

  it('rounds and groups ordinary counts; a true zero is 0', () => {
    expect(formatCount(1608.4)).toBe('1,608');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(null)).toBe('0');
  });
});

describe('formatQuantity', () => {
  it('keeps one decimal below 10 so a short length is not rounded away', () => {
    expect(formatQuantity(0.4)).toBe('0.4');
    expect(formatQuantity(2.46)).toBe('2.5');
    expect(formatQuantity(0.02)).toBe('<0.1');
  });

  it('rounds larger values to whole numbers, and a true zero is 0', () => {
    expect(formatQuantity(234.74)).toBe('235');
    expect(formatQuantity(1234.5)).toBe('1,235');
    expect(formatQuantity(0)).toBe('0');
  });
});

describe('formatMillionsUsd', () => {
  it('marks a real but tiny amount instead of "$0.0M"', () => {
    expect(formatMillionsUsd(0.03)).toBe('<$0.1M');
    expect(formatMillionsUsd(2.345)).toBe('$2.3M');
    expect(formatMillionsUsd(0)).toBe('$0M');
  });
});

describe('forecast CSV export', () => {
  const area = (name: string, roadKm: number) => ({
    name,
    overallWinds: 'Gale Winds',
    exposed: {
      population: 10,
      buildings: 4,
      residentialBuildings: 3,
      nonresidentialBuildings: 1,
      buildingValue: 1000,
      roadKm,
      roadValue: 0,
      cropValue: 0,
      infrastructureValue: 0,
      evacuationCentres: 0,
      healthFacilities: 0,
      schools: 0,
    },
    inFloodplains: {},
    inTrackUncertainty: {},
    total: {},
  });

  it('keeps the decimals of road length instead of rounding 0.4 km to 0', () => {
    const exposure = { national: area('Cook Islands', 234.74), regions: [area('Atiu', 0.4)] };
    const rows = forecastCsvRows(exposure as unknown as ForecastExposure);
    const header = rows.find(r => r[0] === 'area') as string[];
    const col = header.indexOf('road_km_exposed');
    const body = Object.fromEntries(
      rows.filter(r => r.length === header.length).map(r => [r[0], r])
    );
    expect(col).toBeGreaterThan(0);
    expect(body['Atiu'][col]).toBe('0.4');
    expect(body['Cook Islands'][col]).toBe('234.74');
  });
});

describe('formatUtcDateTime', () => {
  it("always states UTC, whatever the machine's time zone", () => {
    expect(formatUtcDateTime('2026-10-17T18:00:00Z')).toBe('2026-10-17 18:00 UTC');
    expect(formatUtcDateTime('2026-10-18T06:30:00+12:00')).toBe('2026-10-17 18:30 UTC');
  });

  it('returns nothing for a missing or unreadable time', () => {
    expect(formatUtcDateTime(undefined)).toBe('');
    expect(formatUtcDateTime('')).toBe('');
    expect(formatUtcDateTime('not a date')).toBe('');
  });
});
