import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MapControls } from '../MapControls';

const POSITRON_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const VOYAGER_URL = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

describe('MapControls', () => {
  const defaultProps = {
    onBasemapChange: jest.fn(),
    currentBasemap: POSITRON_URL,
  };

  beforeEach(() => jest.clearAllMocks());

  it('renders map controls toggle', () => {
    render(<MapControls {...defaultProps} />);
    expect(screen.getByRole('button', { name: /map controls/i })).toBeInTheDocument();
  });

  it('announces pressed state and calls onMapStyleChange for display mode buttons', () => {
    const onMapStyleChange = jest.fn();
    render(<MapControls {...defaultProps} mapStyle="loss" onMapStyleChange={onMapStyleChange} />);

    const lossButton = screen.getByRole('button', { name: /economic loss coloring/i });
    const windButton = screen.getByRole('button', { name: /wind exposure coloring/i });

    expect(lossButton).toHaveAttribute('aria-pressed', 'true');
    expect(windButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(windButton);
    expect(onMapStyleChange).toHaveBeenCalledWith('wind');
  });

  it('does not auto-enable wind overlay when switching to wind display mode', () => {
    const onMapStyleChange = jest.fn();
    const onWindLayerToggle = jest.fn();

    render(
      <MapControls
        {...defaultProps}
        mapStyle="loss"
        onMapStyleChange={onMapStyleChange}
        showWindLayer={false}
        onWindLayerToggle={onWindLayerToggle}
      />
    );

    const windExposureButton = screen.getByRole('button', { name: /wind exposure coloring/i });

    fireEvent.click(windExposureButton);

    expect(onMapStyleChange).toHaveBeenCalledWith('wind');
    expect(onWindLayerToggle).not.toHaveBeenCalled();
  });

  it('supports keyboard navigation and focus return in basemap menu', async () => {
    const user = userEvent.setup();
    const onBasemapChange = jest.fn();

    render(<MapControls {...defaultProps} onBasemapChange={onBasemapChange} />);

    const basemapTrigger = screen.getByRole('button', { name: /basemap/i });
    await user.click(basemapTrigger);

    const basemapPanel = screen.getByRole('menu', { name: /basemap options/i });
    expect(basemapPanel).toBeInTheDocument();

    const lightOption = screen.getByRole('menuitemradio', { name: /light/i });
    const detailedOption = screen.getByRole('menuitemradio', { name: /detailed/i });

    await waitFor(() => {
      expect(lightOption).toHaveFocus();
    });
    expect(lightOption).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(detailedOption).toHaveFocus();
    });

    await user.keyboard('{Enter}');
    expect(onBasemapChange).toHaveBeenCalledWith(VOYAGER_URL);

    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: /basemap options/i })).not.toBeInTheDocument();
    });
    expect(basemapTrigger).toHaveFocus();
  });

  it('disables actionable controls while loading', () => {
    const onMapStyleChange = jest.fn();
    const on3DViewToggle = jest.fn();
    const onWindLayerToggle = jest.fn();
    const onLayerOpacityChange = jest.fn();

    render(
      <MapControls
        {...defaultProps}
        mapStyle="loss"
        onMapStyleChange={onMapStyleChange}
        on3DViewToggle={on3DViewToggle}
        onWindLayerToggle={onWindLayerToggle}
        showWindLayer={true}
        onLayerOpacityChange={onLayerOpacityChange}
        isMapDataLoading={true}
      />
    );

    expect(screen.getByRole('button', { name: /economic loss coloring/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /wind exposure coloring/i })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /3d buildings/i })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /wind layer/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /basemap/i })).toBeDisabled();
    expect(screen.getByRole('slider', { name: /layer opacity/i })).toBeDisabled();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('exposes opacity slider semantic values', () => {
    const onLayerOpacityChange = jest.fn();

    render(
      <MapControls
        {...defaultProps}
        onLayerOpacityChange={onLayerOpacityChange}
        layerOpacity={82}
      />
    );

    const slider = screen.getByRole('slider', { name: /layer opacity, 82 percent/i });
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '100');
    expect(slider).toHaveAttribute('aria-valuenow', '82');
  });
});
