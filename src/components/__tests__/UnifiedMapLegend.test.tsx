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

  it('renders nothing when hasSelection is true', () => {
    const { container } = render(<UnifiedMapLegend mode="loss" visible hasSelection />);
    expect(container).toBeEmptyDOMElement();
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
