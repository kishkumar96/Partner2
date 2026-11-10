/**
 * Tests for MapStyleToggle
 *
 * Simple two-button toggle: "Economic Loss" and "Wind Hazard".
 * Verifies correct callback firing and active-state styling.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapStyleToggle } from '../MapStyleToggle';

describe('MapStyleToggle', () => {
  it('renders both style buttons', () => {
    render(<MapStyleToggle onStyleChange={jest.fn()} currentStyle="loss" />);
    expect(screen.getByText(/economic loss/i)).toBeInTheDocument();
    expect(screen.getByText(/wind hazard/i)).toBeInTheDocument();
  });

  it('calls onStyleChange with "wind" when Wind Hazard is clicked', () => {
    const onStyleChange = jest.fn();
    render(<MapStyleToggle onStyleChange={onStyleChange} currentStyle="loss" />);
    fireEvent.click(screen.getByText(/wind hazard/i));
    expect(onStyleChange).toHaveBeenCalledWith('wind');
  });

  it('calls onStyleChange with "loss" when Economic Loss is clicked', () => {
    const onStyleChange = jest.fn();
    render(<MapStyleToggle onStyleChange={onStyleChange} currentStyle="wind" />);
    fireEvent.click(screen.getByText(/economic loss/i));
    expect(onStyleChange).toHaveBeenCalledWith('loss');
  });

  it('highlights the active button (loss mode)', () => {
    render(<MapStyleToggle onStyleChange={jest.fn()} currentStyle="loss" />);
    const lossBtn = screen.getByText(/economic loss/i).closest('button');
    expect(lossBtn?.className).toMatch(/neon-coral|active/);
  });

  it('highlights the active button (wind mode)', () => {
    render(<MapStyleToggle onStyleChange={jest.fn()} currentStyle="wind" />);
    const windBtn = screen.getByText(/wind hazard/i).closest('button');
    expect(windBtn?.className).toMatch(/neon-cyan|active/);
  });
});
