/**
 * Tests for UnifiedMapLegend
 *
 * Covers visibility toggles, mode switching (loss/wind),
 * layer-specific legend item rendering (buildings, roads),
 * and expand/collapse interaction.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UnifiedMapLegend from '../UnifiedMapLegend';

describe('UnifiedMapLegend', () => {
  it('renders nothing when visible is false', () => {
    const { container } = render(<UnifiedMapLegend mode="loss" visible={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('still renders when hasSelection is true', () => {
    render(<UnifiedMapLegend mode="loss" visible hasSelection />);
    expect(screen.getByRole('region', { name: /map legend/i })).toBeInTheDocument();
  });

  it('renders the legend region when visible and no selection', () => {
    render(<UnifiedMapLegend mode="loss" visible />);
    expect(screen.getByRole('region', { name: /map legend/i })).toBeInTheDocument();
  });

  it('expand/collapse toggle is present', () => {
    render(<UnifiedMapLegend mode="loss" visible />);
    const toggleBtn = screen.getByRole('button');
    expect(toggleBtn).toBeInTheDocument();
  });

  it('clicking the toggle button expands the legend', () => {
    render(<UnifiedMapLegend mode="loss" visible />);
    const toggleBtn = screen.getByRole('button');
    // By default the legend starts collapsed (isExpanded = useState(false))
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('clicking the toggle button a second time collapses the legend', () => {
    render(<UnifiedMapLegend mode="loss" visible />);
    const toggleBtn = screen.getByRole('button');
    fireEvent.click(toggleBtn); // expand
    fireEvent.click(toggleBtn); // collapse
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders in wind mode without crashing', () => {
    render(<UnifiedMapLegend mode="wind" visible />);
    expect(screen.getByRole('region', { name: /map legend/i })).toBeInTheDocument();
  });

  it('shows building damage rows when showBuildings is true and expanded', () => {
    render(<UnifiedMapLegend mode="loss" visible showBuildings />);
    const toggleBtn = screen.getByRole('button');
    fireEvent.click(toggleBtn); // expand legend
    // Building damage section heading text
    const buildingHeadings = screen.getAllByText(/damaged buildings/i);
    expect(buildingHeadings.length).toBeGreaterThan(0);
  });

  it('shows road damage rows when showRoads is true and expanded', () => {
    render(<UnifiedMapLegend mode="loss" visible showRoads />);
    const toggleBtn = screen.getByRole('button');
    fireEvent.click(toggleBtn);
    const roadHeadings = screen.getAllByText(/damaged roads/i);
    expect(roadHeadings.length).toBeGreaterThan(0);
  });
});

describe('UnifiedMapLegend, hazard scenarios', () => {
  const zarrLayer = {
    id: 'zarr-ck-tc_slr0.5_rp100',
    name: 'Cook Islands tc flood depth — SLR 0.5m, 100yr return period',
    countryCode: 'CK',
    ncFile: 'tc_slr0.5_rp100',
    layerName: 'tc_slr0.5_rp100',
    description: 'x',
    hazardType: 'flood',
    bbox: [0, 0, 1, 1],
    styleConfig: { colorScaleRange: '0,5' },
    zarrScenario: { storeUrl: '/s', source: 'tc', slr: 0.5, selector: '100' },
  } as const;
  const wmsLayer = {
    id: 'wms-1',
    name: 'TC Lola Flood Hazard',
    countryCode: 'VU',
    ncFile: 'lola',
    layerName: 'Depth',
    description: 'x',
    hazardType: 'flood',
    bbox: [0, 0, 1, 1],
    styleConfig: { colorScaleRange: '0,5' },
  } as const;
  const open = (layers: unknown[]) => {
    render(<UnifiedMapLegend mode="loss" visible activeWmsLayers={layers as never} />);
    fireEvent.click(screen.getByRole('button'));
  };

  it('draws a scenario from the Zarr store with its exact depth scale, not the generic THREDDS preview', () => {
    open([zarrLayer]);
    expect(screen.getByText('Flood Depth Scenario')).toBeInTheDocument();
    expect(screen.getByTestId('zarr-depth-legend')).toHaveTextContent(zarrLayer.name);
    expect(screen.getByText(/Click the map to read the depth at a point/)).toBeInTheDocument();
    expect(screen.queryByText('Historical Hazard Rasters')).not.toBeInTheDocument();
    expect(screen.queryByText(/Palette bars are visual previews/)).not.toBeInTheDocument();
  });

  it('keeps the THREDDS legend for the other hazard layers, beside the new one', () => {
    open([zarrLayer, wmsLayer]);
    expect(screen.getByText('Flood Depth Scenario')).toBeInTheDocument();
    expect(screen.getByText('Historical Hazard Rasters')).toBeInTheDocument();
    expect(screen.getAllByText('TC Lola Flood Hazard')).toHaveLength(1);
    expect(screen.getAllByTestId('zarr-depth-legend')).toHaveLength(1);
  });

  it('shows the THREDDS legend alone when there is no Zarr scenario', () => {
    open([wmsLayer]);
    expect(screen.queryByText('Flood Depth Scenario')).not.toBeInTheDocument();
    expect(screen.getByText('Historical Hazard Rasters')).toBeInTheDocument();
    expect(screen.queryByTestId('zarr-depth-legend')).not.toBeInTheDocument();
  });
});
