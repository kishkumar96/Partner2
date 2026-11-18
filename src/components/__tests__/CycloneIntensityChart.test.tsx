import { render } from '@testing-library/react';
import CycloneIntensityChart from '../CycloneIntensityChart';
import { parseForecastPointsFromGeometry } from '@/utils/cycloneAnimationLoader';

const mockChart = jest.fn();
jest.mock('react-chartjs-2', () => ({
  Chart: (props: unknown) => {
    mockChart(props);
    return null;
  },
}));

const points = parseForecastPointsFromGeometry({
  type: 'FeatureCollection',
  features: [55, null, 80].map((wind, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [170, -17] },
    properties: {
      Time: `2026-11-19T${String(i * 6).padStart(2, '0')}:00:00Z`,
      Latitude: -17,
      Longitude: 170,
      MeanWind: wind,
      Category: i === 1 ? null : 3,
    },
  })),
})!;

beforeEach(() => mockChart.mockClear());

it('plots missing measurements as gaps and explains unavailable categories', () => {
  render(
    <CycloneIntensityChart forecastTrack={points} currentIndex={0} onPointClick={jest.fn()} />
  );
  const props = mockChart.mock.calls.at(-1)![0];
  expect(props.data.datasets[0].data).toEqual([55, null, 80]);
  expect(props.data.datasets[1].data).toEqual([null, null, null]);
  expect(props.data.datasets[2].data).toEqual([null, null, null]);
  expect(props.data.datasets[0].pointBackgroundColor[1]).toBe('#94a3b8');
  expect(props.options.plugins.tooltip.callbacks.afterBody([{ dataIndex: 1 }])).toEqual([
    'Category unavailable',
    'Gust: Unavailable',
  ]);
});

it('draws a finite cursor at a known point immediately before a data gap', () => {
  render(
    <CycloneIntensityChart forecastTrack={points} currentIndex={0} onPointClick={jest.fn()} />
  );
  const props = mockChart.mock.calls.at(-1)![0];
  const ctx = {
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
  };
  props.plugins[0].afterDatasetsDraw({
    ctx,
    getDatasetMeta: () => ({
      data: [
        { x: 0, y: 40 },
        { x: 10, y: NaN },
        { x: 20, y: 90 },
      ],
    }),
  });
  expect(ctx.arc).toHaveBeenCalled();
  for (const [x, y] of ctx.arc.mock.calls) {
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
  }
});
