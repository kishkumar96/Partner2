import { fireEvent, render, screen } from '@testing-library/react';
import {
  CycloneCategoryBadge,
  CycloneCategoryLegend,
  CycloneCategoryTimeline,
} from '../CycloneCategoryPanel';
import { parseForecastPointsFromGeometry } from '@/utils/cycloneAnimationLoader';

const points = parseForecastPointsFromGeometry({
  type: 'FeatureCollection',
  features: [2, null, 4].map((category, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [179 + i, -17] },
    properties: {
      Time: `2026-11-19T${String(i * 6).padStart(2, '0')}:00:00Z`,
      Latitude: -17,
      Longitude: 179 + i,
      Category: category,
    },
  })),
})!;

it('shows source-reported category with an explicit unspecified scale', () => {
  render(<CycloneCategoryBadge point={points[0]} />);
  expect(screen.getByText('Category 2')).toBeInTheDocument();
  expect(screen.getByText('reported')).toBeInTheDocument();
  expect(screen.getByText('Scale unspecified')).toBeInTheDocument();
  expect(screen.getByText(/00:00 UTC/)).toBeInTheDocument();
  expect(screen.queryByText('Forecast')).not.toBeInTheDocument();
});

it('synchronises buttons and the keyboard-accessible slider with the supplied playback index', () => {
  const onSelect = jest.fn();
  const { rerender } = render(
    <CycloneCategoryTimeline points={points} currentIndex={0} onSelect={onSelect} />
  );
  fireEvent.click(screen.getByRole('button', { name: /Category unavailable/ }));
  expect(onSelect).toHaveBeenLastCalledWith(1);
  rerender(<CycloneCategoryTimeline points={points} currentIndex={1} onSelect={onSelect} />);
  expect(screen.getByRole('button', { name: /Category unavailable/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(screen.getByRole('slider')).toHaveValue('1');
  expect(screen.getByText('Sustained wind: Unavailable')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } });
  expect(onSelect).toHaveBeenLastCalledWith(2);
});

it('shows wind thresholds only for a known classification scale', () => {
  const { rerender } = render(<CycloneCategoryLegend />);
  expect(screen.queryByText(/34–/)).not.toBeInTheDocument();
  rerender(<CycloneCategoryLegend scale="australian" />);
  expect(screen.getByText('Category 1 · 34–<48 kt')).toBeInTheDocument();
  expect(screen.getByText(/Local wind, rain and coastal impacts can differ/)).toBeInTheDocument();
});

it('handles empty and single-point tracks without invalid slider ranges', () => {
  const { rerender } = render(
    <CycloneCategoryTimeline points={[]} currentIndex={0} onSelect={jest.fn()} />
  );
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  rerender(
    <CycloneCategoryTimeline points={points.slice(0, 1)} currentIndex={100} onSelect={jest.fn()} />
  );
  expect(screen.getByRole('slider')).toBeDisabled();
});

it('keeps story moments on the same timeline controller', () => {
  const onSelect = jest.fn();
  render(
    <CycloneCategoryTimeline
      points={points}
      currentIndex={0}
      onSelect={onSelect}
      beats={[{ id: 'peak', index: 2, title: 'Peak intensity' }]}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Story beat: Peak intensity' }));
  expect(onSelect).toHaveBeenCalledWith(2);
  expect(screen.getAllByRole('slider')).toHaveLength(1);
});
