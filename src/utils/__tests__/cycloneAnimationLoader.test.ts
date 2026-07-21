import { loadCycloneForecastTrack } from '../cycloneAnimationLoader';

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
