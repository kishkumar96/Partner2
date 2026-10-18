/**
 * Forecast mode offers the cyclone animation, and only that overlay: the wind,
 * inundation, buildings and roads rows belong to the post-event assessment.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MapPanel from '../MapPanel';

describe('MapPanel cyclone overlay in forecast mode', () => {
  it('shows just the Tropical Cyclone row, and says its positions are forecast', () => {
    const onCycloneLayerToggle = jest.fn();
    render(
      <MapPanel
        showOverlayRows
        onCycloneLayerToggle={onCycloneLayerToggle}
        hasCycloneData
        cycloneIsForecast
      />
    );
    expect(screen.getByText('Tropical Cyclone')).toBeInTheDocument();
    expect(screen.queryByText('Maximum Wind')).toBeNull();
    expect(screen.queryByText('Maximum Inundation')).toBeNull();
    expect(screen.queryByText('Buildings')).toBeNull();
    expect(screen.queryByText('Roads')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Tropical Cyclone/i }));
    expect(screen.getByText(/forecast, not observed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show cyclone track' }));
    expect(onCycloneLayerToggle).toHaveBeenCalledWith(true);
  });

  it('does not make the forecast claim for an assessment, where the track is what happened', () => {
    render(<MapPanel showOverlayRows onCycloneLayerToggle={jest.fn()} hasCycloneData />);
    fireEvent.click(screen.getByRole('button', { name: /Tropical Cyclone/i }));
    expect(screen.getByText(/Playback and timeline controls/i)).toBeInTheDocument();
    expect(screen.queryByText(/forecast, not observed/i)).toBeNull();
  });

  it('shows no overlay rows when none is offered (Scenarios, History)', () => {
    render(<MapPanel showOverlayRows={false} />);
    expect(screen.queryByText('Tropical Cyclone')).toBeNull();
  });
});
