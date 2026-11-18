import React from 'react';
import { render, screen } from '@testing-library/react';
import { NeighbourNote } from '../ForecastExposurePanels';

describe('NeighbourNote', () => {
  it('says which neighbouring countries the forecast also reaches, and that they are not counted', () => {
    render(<NeighbourNote countries={['Samoa', 'Tonga']} />);
    const note = screen.getByTestId('neighbour-note');
    expect(note).toHaveTextContent('This forecast also reaches Samoa and Tonga.');
    expect(note).toHaveTextContent('not shown or counted here');
  });

  it('names one country, and joins three with commas', () => {
    const { rerender } = render(<NeighbourNote countries={['Samoa']} />);
    expect(screen.getByTestId('neighbour-note')).toHaveTextContent('reaches Samoa.');
    rerender(<NeighbourNote countries={['Fiji', 'Samoa', 'Tonga']} />);
    expect(screen.getByTestId('neighbour-note')).toHaveTextContent('Fiji, Samoa and Tonga');
  });

  it('is absent when the run covers only this country', () => {
    const { container } = render(<NeighbourNote countries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
