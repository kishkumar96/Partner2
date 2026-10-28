import { fireEvent, render, screen } from '@testing-library/react';
import ViewStatusLine, { buildViewStatusSegments } from '../ViewStatusLine';

describe('ViewStatusLine', () => {
  it('describes an observed storm without repeating the mode', () => {
    expect(
      buildViewStatusSegments({
        mode: 'event',
        eventName: 'Tropical Cyclone Lola',
        aggregationLabel: 'Province',
      })
    ).toEqual(['TC Lola', 'by province']);
  });

  it('describes a planning scenario and any sector filter', () => {
    expect(
      buildViewStatusSegments({
        mode: 'planning',
        scenarioParts: ['Coastal Flood', 'SLR 0 m', '5-yr return period'],
        sectorNames: ['Housing'],
      })
    ).toEqual(['Coastal Flood · SLR 0 m · 5-yr return period', 'sector: Housing']);
  });

  it('renders nothing when there is nothing to say, so no empty line is left in the header', () => {
    const { container } = render(<ViewStatusLine mode="event" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('takes its spacing from the caller', () => {
    render(<ViewStatusLine mode="event" eventName="Tropical Cyclone Lola" className="" />);
    expect(screen.getByTestId('view-status-line').className).not.toContain('mt-1');
  });

  it('renders the line', () => {
    render(<ViewStatusLine mode="event" eventName="Tropical Cyclone Lola" />);
    expect(screen.getByTestId('view-status-line')).toHaveTextContent('TC Lola');
  });
});

describe('forecast status', () => {
  it('labels a forecast as exposure and shows when the track was issued', () => {
    expect(
      buildViewStatusSegments({
        mode: 'event',
        isForecast: true,
        eventName: 'Tropical Cyclone Lola',
        issuedAt: '2026-04-08T12:00:00Z',
      })
    ).toEqual(['TC Lola', 'track issued 2026-04-08 12:00 UTC']);
  });
});

describe('change scenario shortcut', () => {
  it('is offered only in planning mode', () => {
    const onChange = jest.fn();
    const { rerender } = render(<ViewStatusLine mode="planning" onChangeScenario={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /change scenario/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    rerender(<ViewStatusLine mode="event" onChangeScenario={onChange} />);
    expect(screen.queryByRole('button', { name: /change scenario/i })).not.toBeInTheDocument();
  });
});

describe('browse historical events shortcut', () => {
  it('is offered only in observed mode', () => {
    const onBrowse = jest.fn();
    const { rerender } = render(<ViewStatusLine mode="event" onBrowseHistorical={onBrowse} />);
    fireEvent.click(screen.getByRole('button', { name: /browse historical events/i }));
    expect(onBrowse).toHaveBeenCalledTimes(1);
    rerender(<ViewStatusLine mode="planning" onBrowseHistorical={onBrowse} />);
    expect(
      screen.queryByRole('button', { name: /browse historical events/i })
    ).not.toBeInTheDocument();
  });
});
