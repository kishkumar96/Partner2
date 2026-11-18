import {
  CATEGORY_THRESHOLDS,
  resolveCycloneCategory,
  windInKnots,
  type CycloneScale,
} from '../cycloneCategory';
import { getCategoryColor, getCategoryLabel } from '@/theme/cycloneScale';
import { parseForecastPointsFromGeometry } from '../cycloneAnimationLoader';
import { detectStoryBeats } from '../cycloneStory';

describe('source-aware cyclone classification', () => {
  it.each(['australian', 'saffir-simpson'] as CycloneScale[])(
    'respects every %s threshold',
    scale => {
      const context = {
        scale,
        windUnit: 'kt' as const,
        averagingMinutes: scale === 'australian' ? (10 as const) : (1 as const),
      };
      CATEGORY_THRESHOLDS[scale].forEach((threshold, i) => {
        expect(resolveCycloneCategory(null, threshold, context)).toMatchObject({
          category: i + 1,
          provenance: 'derived',
        });
        expect(resolveCycloneCategory(null, threshold - 0.01, context).category).toBe(i || null);
      });
    }
  );

  it('preserves reported values even when the scale or wind is unknown', () => {
    expect(resolveCycloneCategory(2, 150)).toEqual({ category: 2, provenance: 'reported' });
    expect(resolveCycloneCategory(3, null)).toEqual({ category: 3, provenance: 'reported' });
  });

  it('requires a known scale, units and the matching averaging period', () => {
    expect(resolveCycloneCategory(null, 120).category).toBeNull();
    expect(
      resolveCycloneCategory(null, 120, { scale: 'australian', windUnit: 'kt' }).category
    ).toBeNull();
    expect(
      resolveCycloneCategory(null, 120, {
        scale: 'australian',
        windUnit: 'kt',
        averagingMinutes: 1,
      }).category
    ).toBeNull();
    expect(
      resolveCycloneCategory(null, 120, { scale: 'saffir-simpson', averagingMinutes: 1 }).category
    ).toBeNull();
  });

  it.each([0, -3, 6, 2.5, NaN, Infinity])(
    'does not reinterpret invalid/non-category code %s',
    category => {
      expect(
        resolveCycloneCategory(category, 150, {
          scale: 'australian',
          windUnit: 'kt',
          averagingMinutes: 10,
        }).category
      ).toBeNull();
      expect(getCategoryLabel(category)).toBe('Category unavailable');
      expect(getCategoryColor(category)).toBe('#94a3b8');
    }
  );

  it('does not assign a new cyclone category to an explicitly ex-tropical system', () => {
    expect(
      resolveCycloneCategory(null, 120, {
        scale: 'australian',
        windUnit: 'kt',
        averagingMinutes: 10,
        status: 'Ex-tropical',
      }).category
    ).toBeNull();
  });

  it('converts units without converting wind averaging periods', () => {
    expect(windInKnots(185.2, 'km/h')).toBeCloseTo(100);
    expect(windInKnots(51.44444444444445, 'm/s')).toBeCloseTo(100);
    expect(windInKnots(0, 'kt')).toBe(0);
    expect(windInKnots(-1, 'kt')).toBeNull();
    expect(windInKnots(100)).toBeNull();
  });
});

const geometry = (properties: Record<string, unknown>) => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [179, -17] },
      properties: { Time: '2026-11-19T00:00:00Z', Latitude: -17, Longitude: 179, ...properties },
    },
  ],
});

describe('category metadata through track ingestion', () => {
  it('retains scale, source, status and phase and derives only with explicit metadata', () => {
    const point = parseForecastPointsFromGeometry(
      geometry({
        MeanWind: 100 * 1.852,
        WindUnit: 'km/h',
        CategoryScale: 'australian',
        AveragingMinutes: 10,
        DataSource: 'Test advisory',
        CycloneStatus: 'Tropical cyclone',
        TrackPhase: 'forecast',
      })
    )![0];
    expect(point).toMatchObject({
      category: 4,
      meanWind: 100,
      windGust: null,
      pressure: null,
      source: 'Test advisory',
      status: 'Tropical cyclone',
      phase: 'forecast',
      classification: { provenance: 'derived', scale: 'australian' },
    });
  });

  it('supports explicit adapter context without country-based guessing', () => {
    expect(
      parseForecastPointsFromGeometry(geometry({ MeanWind: 55 }), {
        scale: 'australian',
        windUnit: 'kt',
        averagingMinutes: 10,
      })![0].category
    ).toBe(2);
    expect(parseForecastPointsFromGeometry(geometry({ MeanWind: 55 }))![0].category).toBeNull();
  });

  it('does not silently reinterpret unsupported wind units or malformed categories', () => {
    expect(
      parseForecastPointsFromGeometry(geometry({ MeanWind: 100, WindUnit: 'mph' }))![0].meanWind
    ).toBeNull();
    expect(
      parseForecastPointsFromGeometry(
        geometry({
          Category: 'bad',
          MeanWind: 100,
          CategoryScale: 'australian',
          AveragingMinutes: 10,
        })
      )![0].category
    ).toBeNull();
  });

  it('keeps missing intensity out of category and peak-intensity stories', () => {
    const points = parseForecastPointsFromGeometry(geometry({}))!;
    expect(points[0]).toMatchObject({
      meanWind: null,
      pressure: null,
      windGust: null,
      category: null,
    });
    expect(
      detectStoryBeats(points).some(beat =>
        ['peak-intensity', 'category-upgrade', 'rapid-intensification'].includes(beat.type)
      )
    ).toBe(false);
  });
});
