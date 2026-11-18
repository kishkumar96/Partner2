import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import MapPanel from '../MapPanel';
import type { EezStatus } from '@/utils/pacificEez';

function setup(
  over: Partial<{ visible: boolean; status: EezStatus; hasCountryEez: boolean }> = {}
) {
  const eez = {
    visible: true,
    status: 'ready' as EezStatus,
    hasCountryEez: true,
    onVisibleChange: jest.fn(),
    onRetry: jest.fn(),
    onView: jest.fn(),
    ...over,
  };
  render(<MapPanel eez={eez} />);
  return eez;
}

describe('MapPanel Geographic context', () => {
  it('has the switch and the source note, saying the outlines are simplified', () => {
    const eez = setup();
    const toggle = screen.getByRole('checkbox', { name: /Pacific EEZ boundaries/ });
    expect(toggle).toBeChecked();
    expect(screen.getByText(/Simplified outlines for context only/)).toBeInTheDocument();
    expect(screen.getByText(/Marine Regions \(VLIZ\), CC BY 4\.0/)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(eez.onVisibleChange).toHaveBeenCalledWith(false);
  });

  it('is absent when the dashboard does not offer EEZ outlines', () => {
    render(<MapPanel />);
    expect(screen.queryByText('Geographic context')).toBeNull();
  });

  it('asks for the three views, and only offers the country EEZ while outlines are on', () => {
    const eez = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Pacific overview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to country' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show country EEZ' }));
    expect(eez.onView.mock.calls.map(c => c[0])).toEqual(['overview', 'country', 'countryEez']);
  });

  it('disables "Show country EEZ" when outlines are off, but keeps the other two', () => {
    setup({ visible: false });
    expect(screen.getByRole('button', { name: 'Show country EEZ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pacific overview' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Back to country' })).toBeEnabled();
  });

  it('shows a failed load with a retry, and says the rest of the map is fine', () => {
    const eez = setup({ status: 'failed' });
    expect(screen.getByRole('alert')).toHaveTextContent(/didn’t load/);
    expect(screen.getByRole('alert')).toHaveTextContent(/rest of the map is unaffected/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(eez.onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows no failure for outlines that are switched off', () => {
    setup({ visible: false, status: 'failed' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says outlines are loading', () => {
    setup({ status: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent(/Loading outlines/);
  });
});
