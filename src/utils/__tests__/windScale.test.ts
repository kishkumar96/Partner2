import {
  windAreaLabel,
  WIND_CATEGORIES,
  parseWindBand,
  windBandLabel,
  windRange,
  windSeverity,
} from '../windScale';

describe('windScale', () => {
  it('reads REF band names, with and without "Possible"', () => {
    expect(parseWindBand('Gale Winds')).toEqual({ kind: 'gale', possible: false });
    expect(parseWindBand('Possible Gale Winds')).toEqual({ kind: 'gale', possible: true });
    expect(parseWindBand('Storm Winds')).toEqual({ kind: 'storm', possible: false });
    expect(parseWindBand('possible hurricane winds')).toEqual({
      kind: 'hurricane',
      possible: true,
    });
  });

  it('does not treat bands that are not winds as winds', () => {
    for (const band of ['Not exposed', 'Track Uncertainty', '', null, undefined, 'Gale', 'Rain']) {
      expect(parseWindBand(band)).toBeNull();
    }
  });

  it('gives the ranges the dashboard already teaches, so no screen contradicts another', () => {
    expect(windRange('gale')).toBe('63–88 km/h');
    expect(windRange('storm')).toBe('89–117 km/h');
    expect(windRange('hurricane')).toBe('118 km/h or more');
  });

  it("labels a band by name and range, never by the band's top speed", () => {
    // The data's "possible gale" band tops out at 89 km/h, which is where storm begins
    expect(windBandLabel('Possible Gale Winds')).toBe('possible gale winds (63–88 km/h)');
    expect(windBandLabel('Storm Winds')).toBe('storm winds (89–117 km/h)');
    expect(windBandLabel('Not exposed')).toBeNull();
  });

  it('orders gale below storm below hurricane, and the ranges do not overlap', () => {
    expect(windSeverity('gale')).toBeLessThan(windSeverity('storm'));
    expect(windSeverity('storm')).toBeLessThan(windSeverity('hurricane'));
    expect(WIND_CATEGORIES.gale.maxKmph! + 1).toBe(WIND_CATEGORIES.storm.minKmph);
    expect(WIND_CATEGORIES.storm.maxKmph! + 1).toBe(WIND_CATEGORIES.hurricane.minKmph);
  });
});

describe('windAreaLabel', () => {
  it('explains the ring of strongest winds instead of printing it as a wind category', () => {
    expect(windAreaLabel('Radius of Maximum Winds')).toBe('inside the radius of maximum winds');
  });

  it('describes wind bands by range and passes unknown names through', () => {
    expect(windAreaLabel('Gale Winds')).toBe('gale winds (63–88 km/h)');
    expect(windAreaLabel('Something New')).toBe('something new');
    expect(windAreaLabel(null)).toBeNull();
  });
});
