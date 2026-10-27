import React from 'react';
import { render, screen } from '@testing-library/react';
import ZarrDepthLegend, { depthScaleGradient } from '../ZarrDepthLegend';
import { DEPTH_ALPHA, depthRgb } from '@/utils/hazardZarr';

describe('depthScaleGradient', () => {
  it('has a stop for each metre, from 0 to 5 m, at the colours the picture is painted with', () => {
    const gradient = depthScaleGradient();
    const stops = [...gradient.matchAll(/rgba\((\d+), (\d+), (\d+), ([\d.]+)\) ([\d.]+)%/g)];
    expect(stops).toHaveLength(6);
    stops.forEach((stop, metres) => {
      expect([Number(stop[1]), Number(stop[2]), Number(stop[3])]).toEqual(depthRgb(metres));
      expect(Number(stop[5])).toBeCloseTo((metres / 5) * 100, 6);
    });
  });

  it('is painted at the opacity the map draws it with, over a pale backdrop', () => {
    const gradient = depthScaleGradient();
    const alpha = Number(/, ([\d.]+)\) 0%/.exec(gradient)?.[1]);
    expect(alpha).toBeCloseTo((DEPTH_ALPHA / 255) * 0.85, 3);
    expect(gradient.endsWith(', #e2e8f0')).toBe(true);
    expect(gradient.startsWith('linear-gradient(to right,')).toBe(true);
  });
});

describe('ZarrDepthLegend', () => {
  const layer = { name: 'Cook Islands tc flood depth — SLR 0.5m, 100yr return period' };

  it('names the scenario and describes the scale in words', () => {
    render(<ZarrDepthLegend layer={layer} />);
    expect(screen.getByText(layer.name)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /0 metres.*5 metres and deeper/i })).toBeInTheDocument();
    expect(screen.getByText('Flood depth in metres.')).toBeInTheDocument();
  });

  it('labels the scale 0 to 5+ metres', () => {
    const { container } = render(<ZarrDepthLegend layer={layer} />);
    const ticks = Array.from(container.querySelectorAll('[aria-hidden="true"] > span')).map(
      t => t.textContent
    );
    expect(ticks).toEqual(['0', '1', '2', '3', '4', '5+']);
  });

  it('puts the end labels flush with the ends of the bar and the middle ones on their stops', () => {
    const { container } = render(<ZarrDepthLegend layer={layer} />);
    const spans = Array.from(
      container.querySelectorAll<HTMLElement>('[aria-hidden="true"] > span')
    );
    expect(spans.map(s => s.style.left)).toEqual(['0%', '20%', '40%', '60%', '80%', '100%']);
    expect(spans[0].style.transform).toBe('translateX(-0%)');
    expect(spans[5].style.transform).toBe('translateX(-100%)');
  });

  it('explains that no colour means no flooding, and that the map can be clicked', () => {
    render(<ZarrDepthLegend layer={layer} />);
    expect(screen.getByText('No colour: no flooding modelled.')).toBeInTheDocument();
    expect(screen.getByText(/Click the map to read the depth at a point/)).toBeInTheDocument();
    expect(screen.getByText(/press Enter to read the depth at its centre/)).toBeInTheDocument();
  });
});
