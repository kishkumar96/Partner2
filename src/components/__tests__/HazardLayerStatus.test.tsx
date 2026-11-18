import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import HazardLayerStatus from '../HazardLayerStatus';

const issue = { layerId: 'wms-layer-x', name: 'Cook Islands tc flood depth — SLR 0m, 100yr' };

describe('HazardLayerStatus', () => {
  it('says the depths are being drawn, and that it can take a while', () => {
    render(<HazardLayerStatus loading issue={null} onRetry={jest.fn()} />);
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent('Drawing flood depths');
    expect(note).toHaveTextContent('several seconds');
  });

  it('says a scenario could not be drawn, that this is not a finding of no flooding, and offers a retry', () => {
    const onRetry = jest.fn();
    render(<HazardLayerStatus loading={false} issue={issue} onRetry={onRetry} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('could not be drawn');
    expect(alert).toHaveTextContent('not a finding that nothing floods');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the problem rather than "loading" when both are true', () => {
    render(<HazardLayerStatus loading issue={issue} onRetry={jest.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows nothing when there is nothing to say', () => {
    const { container } = render(
      <HazardLayerStatus loading={false} issue={null} onRetry={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
