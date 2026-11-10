import { fireEvent, render, screen } from '@testing-library/react';
import ForecastTrendChart from '../ForecastTrendChart';
import type { TimelinePoint } from '@/utils/forecastTimeline';

const point = (id: string, issuedAt: string, people: number): TimelinePoint => ({
  id,
  issuedAt,
  people,
  buildings: 0,
  strongest: people ? 'gale' : null,
});
const points = [
  point('a', '2026-10-17T12:00:00Z', 2622),
  point('b', '2026-10-18T18:00:00Z', 14118),
  point('c', '2026-10-19T12:00:00Z', 0),
];

describe('ForecastTrendChart', () => {
  it('draws nothing for a single advisory', () => {
    const { container } = render(<ForecastTrendChart points={[points[0]]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('gives every bar a plain-language label, with "no one" for zero', () => {
    render(<ForecastTrendChart points={points} currentId="b" onSelect={jest.fn()} />);

    expect(
      screen.getByRole('button', {
        name: /17 Oct 12:00 UTC: about 2,600 people under forecast winds$/,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /18 Oct 18:00 UTC: about 14,000 people under forecast winds \(shown now\)/,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /19 Oct 12:00 UTC: no one under forecast winds/ })
    ).toBeInTheDocument();
  });

  it('marks the advisory on screen and lets a person step to another', () => {
    const onSelect = jest.fn();
    render(<ForecastTrendChart points={points} currentId="b" onSelect={onSelect} />);

    const current = screen.getByRole('button', { name: /18 Oct 18:00/ });
    expect(current).toHaveAttribute('aria-pressed', 'true');
    expect(current).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /17 Oct 12:00/ }));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('is read-only when it cannot switch advisories', () => {
    render(<ForecastTrendChart points={points} currentId="b" />);
    screen.getAllByRole('button').forEach(button => expect(button).toBeDisabled());
  });

  it('scales bars to the biggest advisory and keeps a thin stub for zero', () => {
    render(<ForecastTrendChart points={points} currentId="b" onSelect={jest.fn()} />);
    const heights = screen
      .getAllByRole('button')
      .map(button => (button.firstElementChild as HTMLElement).style.height);

    expect(heights).toEqual(['19%', '100%', '3%']);
  });

  it('labels the first and last advisory under the bars', () => {
    render(<ForecastTrendChart points={points} />);
    const caption = screen.getByTestId('forecast-trend').querySelector('figcaption');
    expect(caption).toHaveTextContent('17 Oct 12:00 UTC');
    expect(caption).toHaveTextContent('19 Oct 12:00 UTC');
  });
});
