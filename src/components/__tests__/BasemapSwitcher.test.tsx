/**
 * Tests for BasemapSwitcher
 *
 * Covers rendering of basemap options and callback firing.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BasemapSwitcher } from '../BasemapSwitcher';

const POSITRON = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const VOYAGER = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

describe('BasemapSwitcher', () => {
  it('renders three basemap buttons', () => {
    render(<BasemapSwitcher onBasemapChange={jest.fn()} currentBasemap={POSITRON} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });

  it('renders Light, Detailed, and Dark options', () => {
    render(<BasemapSwitcher onBasemapChange={jest.fn()} currentBasemap={POSITRON} />);
    // Labels may be hidden on mobile (hidden sm:inline) but still in DOM
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Detailed')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
  });

  it('calls onBasemapChange with the Voyager URL when Detailed is clicked', () => {
    const onBasemapChange = jest.fn();
    render(<BasemapSwitcher onBasemapChange={onBasemapChange} currentBasemap={POSITRON} />);
    fireEvent.click(screen.getByText('Detailed'));
    expect(onBasemapChange).toHaveBeenCalledWith(VOYAGER);
  });

  it('calls onBasemapChange with the Dark URL when Dark is clicked', () => {
    const onBasemapChange = jest.fn();
    render(<BasemapSwitcher onBasemapChange={onBasemapChange} currentBasemap={POSITRON} />);
    fireEvent.click(screen.getByText('Dark'));
    expect(onBasemapChange).toHaveBeenCalledWith(DARK);
  });

  it('highlights the currently active basemap button', () => {
    render(<BasemapSwitcher onBasemapChange={jest.fn()} currentBasemap={VOYAGER} />);
    const detailedBtn = screen.getByText('Detailed').closest('button');
    expect(detailedBtn?.className).toMatch(/neon-cyan|active|selected/);
  });
});
