import {
  loadCycloneForecastTrack,
  parseForecastPointsFromGeometry,
} from '../cycloneAnimationLoader';

jest.mock('../dataLoader', () => ({
  loadTextData: jest.fn(),
}));

const { loadTextData } = jest.requireMock('../dataLoader') as {
  loadTextData: jest.Mock;
};

describe('loadCycloneForecastTrack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts sparse Samoa-style forecast rows with missing uncertainty', async () => {
    loadTextData.mockResolvedValue({
      data: [
        "Time[fmt=yyyy-MM-dd'T'HH:mm:ss'Z'],Latitude,Longitude,Symbol,Category,Pressure,PressureOCI,RadiusOCI,Radius1000hPa,RadiusMaxWinds,MeanWind,WindGust,VerticalExtent,Uncertainty",
        '2018-02-07 06:00:00,-15.4,172.1,-3,-3,1007,1007,NaN,NaN,NaN,20,24,,',
      ].join('\n'),
      error: null,
      cached: false,
    });

    const result = await loadCycloneForecastTrack({ forecastFile: '/samoa/test.csv' });

    expect(result).toHaveLength(1);
    expect(result?.[0].timeString).toBe('2018-02-07 06:00:00');
    expect(result?.[0].latitude).toBe(-15.4);
    expect(result?.[0].longitude).toBeCloseTo(172.1, 6);
    expect(result?.[0]).toMatchObject({
      category: -3,
      pressure: 1007,
      meanWind: 20,
      windGust: 24,
      uncertainty: 0,
    });
  });

  it('accepts partner analysis-track headers and fills missing intensity defaults', async () => {
    loadTextData.mockResolvedValue({
      data: [
        'TIME,LATITUDE,LONGITUDE,SYMBOL,CATEGORY,PRESSURE_CENTRAL,PRESSURE_OCI,WIND_SPD,WIND_GUST,UNCERTAINTY,NE_GALE_RADIUS,SE_GALE_RADIUS,SW_GALE_RADIUS,NW_GALE_RADIUS',
        '2026-04-01 18:00:00,-10,173,8,,1007,,35,,,,,,',
      ].join('\n'),
      error: null,
      cached: false,
    });

    const result = await loadCycloneForecastTrack({ forecastFile: '/partner/test.csv' });

    expect(result).toHaveLength(1);
    expect(result?.[0]).toMatchObject({
      timeString: '2026-04-01 18:00:00',
      latitude: -10,
      longitude: 173,
      category: 0,
      pressure: 1007,
      meanWind: 35,
      windGust: 42,
      uncertainty: 0,
    });
  });
});

describe('parseForecastPointsFromGeometry (the partner API track, one property per CSV column)', () => {
  // The first and last points of 2026101812_Wati as the shared API serves them
  const point = (properties: Record<string, unknown>) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-160.8, -17.8] },
    properties,
  });
  const wati = {
    Time: '2026-10-18T12:00:00Z',
    Latitude: -17.8,
    Longitude: -160.8,
    Category: 2,
    Pressure: 975,
    MEAN_WIND: 55,
    WindGust: 75,
    NEGaleRadius: 120,
    SEGaleRadius: 130,
    SWGaleRadius: 100,
    NWGaleRadius: 70,
    NEStormRadius: 50,
  };
  const geometry = (...rows: Array<Record<string, unknown>>) => ({
    type: 'FeatureCollection',
    features: rows.map(point),
  });

  it('reads the mean wind from MEAN_WIND, so the wind glow and the story do not see 0 kt', () => {
    const points = parseForecastPointsFromGeometry(geometry(wati));
    expect(points?.[0]).toMatchObject({ meanWind: 55, windGust: 75, category: 2, pressure: 975 });
  });

  it('reads the wind radii of the point too', () => {
    const points = parseForecastPointsFromGeometry(geometry(wati));
    expect(points?.[0]).toMatchObject({
      galeRadiusNE: 120,
      galeRadiusSE: 130,
      galeRadiusSW: 100,
      galeRadiusNW: 70,
      stormRadiusNE: 50,
    });
  });

  it('still reads the older MeanWind column of the CSV files', () => {
    const { MEAN_WIND: _unused, ...rest } = wati;
    const points = parseForecastPointsFromGeometry(geometry({ ...rest, MeanWind: 40 }));
    expect(points?.[0].meanWind).toBe(40);
  });

  it('keeps a late forecast point with no wind or category, as 0 and category 0', () => {
    const late = {
      Time: '2026-10-21T12:00:00Z',
      Latitude: -34.6,
      Longitude: -131.6,
      MEAN_WIND: null,
    };
    const points = parseForecastPointsFromGeometry(geometry(wati, late));
    expect(points).toHaveLength(2);
    expect(points?.[1]).toMatchObject({ meanWind: 0, category: 0, latitude: -34.6 });
  });
});
