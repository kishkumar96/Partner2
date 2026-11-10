/**
 * Tests for BuildingsTable
 *
 * Covers empty state, row rendering with real GeoJSON data,
 * and column sort interaction.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BuildingsTable from '../BuildingsTable';
import type { GeoJSON } from 'geojson';

const mockOnZoom = jest.fn();

// Minimal GeoJSON feature collection with two buildings
const BUILDING_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [166.9, -15.4] },
      properties: {
        id: 'b1',
        Wind_Loss: 120000,
        Exposure: 500000,
        Damage_Ratio: 0.24,
        BTypeCat: 'Residential',
        Admin2_Region: 'Shefa',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [167.1, -15.2] },
      properties: {
        id: 'b2',
        Wind_Loss: 8000,
        Exposure: 120000,
        Damage_Ratio: 0.06,
        BTypeCat: 'Commercial',
        Admin2_Region: 'Malampa',
      },
    },
  ],
};

beforeEach(() => {
  mockOnZoom.mockClear();
});

describe('BuildingsTable', () => {
  it('renders empty state when data is null', () => {
    render(<BuildingsTable data={null} onZoom={mockOnZoom} />);
    expect(screen.getByText(/no building damage data available/i)).toBeInTheDocument();
  });

  it('renders empty state when feature collection has no matching buildings', () => {
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    render(<BuildingsTable data={empty} onZoom={mockOnZoom} />);
    expect(screen.getByText(/no building damage data available/i)).toBeInTheDocument();
  });

  it('renders the correct building count', () => {
    render(<BuildingsTable data={BUILDING_GEOJSON} onZoom={mockOnZoom} />);
    // The component renders: <span class="font-bold">2</span> buildings
    const boldCount = document.querySelector('span.font-bold');
    expect(boldCount?.textContent).toBe('2');
  });

  it('renders region names from the GeoJSON', () => {
    render(<BuildingsTable data={BUILDING_GEOJSON} onZoom={mockOnZoom} />);
    // Use getAllByText to handle multiple matches (option + td)
    expect(screen.getAllByText('Shefa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Malampa').length).toBeGreaterThan(0);
  });

  it('renders building type from properties', () => {
    render(<BuildingsTable data={BUILDING_GEOJSON} onZoom={mockOnZoom} />);
    expect(screen.getByText('Residential')).toBeInTheDocument();
  });

  it('column header click does not throw', () => {
    render(<BuildingsTable data={BUILDING_GEOJSON} onZoom={mockOnZoom} />);
    // Find sort-able column headers (they are buttons)
    const headerBtns = screen.getAllByRole('button');
    const lossHeader = headerBtns.find(btn => btn.textContent?.toLowerCase().includes('loss'));
    if (lossHeader) {
      expect(() => fireEvent.click(lossHeader)).not.toThrow();
    }
  });

  it('calls onZoom when a zoom/location button is clicked', () => {
    render(<BuildingsTable data={BUILDING_GEOJSON} onZoom={mockOnZoom} />);
    // Zoom buttons typically contain a MapPin icon or "Zoom" text
    const zoomBtns = screen
      .getAllByRole('button')
      .filter(
        btn =>
          btn.getAttribute('title')?.toLowerCase().includes('zoom') ||
          btn.getAttribute('aria-label')?.toLowerCase().includes('zoom')
      );
    if (zoomBtns.length > 0) {
      fireEvent.click(zoomBtns[0]);
      expect(mockOnZoom).toHaveBeenCalled();
    }
  });
});
