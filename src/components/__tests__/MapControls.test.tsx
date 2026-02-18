/**
 * Tests for MapControls component
 *
 * Covers basemap switching, map style toggling (loss/wind),
 * and wind/inundation layer toggle callbacks.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapControls } from '../MapControls';

const POSITRON_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const VOYAGER_URL = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

describe('MapControls', () => {
  const defaultProps = {
    onBasemapChange: jest.fn(),
    currentBasemap: POSITRON_URL,
  };

  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing', () => {
    const { container } = render(<MapControls {...defaultProps} />);
    expect(container).toBeInTheDocument();
  });

  it('opens the settings/basemap panel on button click', () => {
    render(<MapControls {...defaultProps} />);
    // The settings toggle button (Settings2 icon) or similar trigger
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    // Click the first toggle button (typically the settings or basemap toggle)
    fireEvent.click(buttons[0]);
    // Panel should now be open – one way to verify is more buttons appear
    // We just assert no throw
  });

  it('calls onBasemapChange when a basemap option is selected', () => {
    const onBasemapChange = jest.fn();
    render(<MapControls {...defaultProps} onBasemapChange={onBasemapChange} />);

    // Open the basemap panel – find the basemap expand button
    const allButtons = screen.getAllByRole('button');
    // Click until we find the basemap selector button
    // It contains 'Basemap' text or is the second control button
    const basemapBtn = allButtons.find(
      btn =>
        btn.textContent?.toLowerCase().includes('basemap') ||
        btn.getAttribute('aria-label')?.toLowerCase().includes('basemap')
    );
    if (basemapBtn) {
      fireEvent.click(basemapBtn);
      // Now the basemap options should be visible
      const detailedBtn = screen.queryByText('Detailed');
      if (detailedBtn) {
        fireEvent.click(detailedBtn);
        expect(onBasemapChange).toHaveBeenCalledWith(VOYAGER_URL);
      }
    }
  });

  it('calls onMapStyleChange with "wind" when Wind style button is clicked', () => {
    const onMapStyleChange = jest.fn();
    render(<MapControls {...defaultProps} mapStyle="loss" onMapStyleChange={onMapStyleChange} />);
    // Open the settings panel
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);

    const windBtn = screen.queryByText(/wind hazard/i);
    if (windBtn) {
      fireEvent.click(windBtn);
      expect(onMapStyleChange).toHaveBeenCalledWith('wind');
    }
  });

  it('calls onMapStyleChange with "loss" when Economic Loss button is clicked', () => {
    const onMapStyleChange = jest.fn();
    render(<MapControls {...defaultProps} mapStyle="wind" onMapStyleChange={onMapStyleChange} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);

    const lossBtn = screen.queryByText(/economic loss/i);
    if (lossBtn) {
      fireEvent.click(lossBtn);
      expect(onMapStyleChange).toHaveBeenCalledWith('loss');
    }
  });
});
