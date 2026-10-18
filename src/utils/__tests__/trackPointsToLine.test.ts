import { buildForecastExposure, trackPointsToLine } from '../forecastExposure';

const point = (lon: number, lat: number): GeoJSON.Feature => ({
  type: 'Feature',
  properties: { Latitude: lat, Longitude: lon },
  geometry: { type: 'Point', coordinates: [lon, lat] },
});
const points = (n: number): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: Array.from({ length: n }, (_, i) => point(166 + i, -14 - i)),
});

describe('trackPointsToLine', () => {
  it('joins the track points, in order, into one line', () => {
    const line = trackPointsToLine(points(3))!;
    expect(line.features).toHaveLength(1);
    expect(line.features[0].geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [166, -14],
        [167, -15],
        [168, -16],
      ],
    });
  });

  it('keeps a track that is already a line', () => {
    const lines: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
      ],
    };
    expect(trackPointsToLine(lines)).toBe(lines);
  });

  it('returns null when there is nothing to draw', () => {
    expect(trackPointsToLine(null)).toBeNull();
    expect(trackPointsToLine(points(1))).toBeNull();
  });
});

describe('forecast track source', () => {
  const tables = {
    national: [{ Exposed_Population: '10', Region: 'Vanuatu' }],
    regional: [],
    byWindSpeed: [],
    byTrackDistance: [],
  };

  it("uses the run's own track when it kept one", () => {
    const own = points(3);
    const result = buildForecastExposure({ ...tables, cycloneTrack: own, eventTrack: points(4) })!;
    expect(result.layers.cycloneTrackSource).toBe('run');
    expect(result.layers.cycloneTrack).toBe(own);
  });

  it("falls back to the event's linked track as a line", () => {
    const result = buildForecastExposure({ ...tables, eventTrack: points(4) })!;
    expect(result.layers.cycloneTrackSource).toBe('event');
    expect(result.layers.cycloneTrack?.features[0].geometry.type).toBe('LineString');
  });

  it('has no track when neither exists', () => {
    const result = buildForecastExposure(tables)!;
    expect(result.layers.cycloneTrack).toBeNull();
    expect(result.layers.cycloneTrackSource).toBeNull();
  });
});
