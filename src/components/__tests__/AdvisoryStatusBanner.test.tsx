import { fireEvent, render, screen } from '@testing-library/react';
import AdvisoryStatusBanner from '../AdvisoryStatusBanner';
import type { AdvisoryStatus } from '@/utils/forecastInsight';

const age = { hours: 50, label: '2 days ago', stale: true };

describe('AdvisoryStatusBanner', () => {
  it('says plainly that a newer advisory exists and offers one button to it', () => {
    const status: AdvisoryStatus = {
      kind: 'older',
      issuedAt: '2026-10-17T12:00:00Z',
      age,
      newer: { issuedAt: '2026-10-19T12:00:00Z', count: 7 },
    };
    const onSwitch = jest.fn();
    render(<AdvisoryStatusBanner status={status} onSwitchToLatest={onSwitch} />);

    const banner = screen.getByTestId('advisory-banner');
    expect(banner).toHaveAttribute('data-state', 'older');
    expect(banner).toHaveTextContent('This is not the latest forecast');
    expect(banner).toHaveTextContent('issued 17 Oct 12:00 UTC (2 days ago)');
    expect(banner).toHaveTextContent(
      '7 newer ones have been issued; the latest is 19 Oct 12:00 UTC'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Switch to the latest advisory' }));
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it('uses the singular for one newer advisory, and has no button when it cannot switch', () => {
    const status: AdvisoryStatus = {
      kind: 'older',
      issuedAt: '2026-10-19T00:00:00Z',
      age,
      newer: { issuedAt: '2026-10-19T06:00:00Z', count: 1 },
    };
    render(<AdvisoryStatusBanner status={status} />);

    expect(screen.getByTestId('advisory-banner')).toHaveTextContent('A newer one has been issued');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('warns when the newest advisory is itself getting old', () => {
    const status: AdvisoryStatus = {
      kind: 'latest-aging',
      issuedAt: '2026-10-18T12:00:00Z',
      age,
      newer: null,
    };
    render(<AdvisoryStatusBanner status={status} />);

    const banner = screen.getByTestId('advisory-banner');
    expect(banner).toHaveAttribute('data-state', 'aging');
    expect(banner).toHaveTextContent('Check for a newer forecast before acting on it');
  });

  it('is a quiet line when this is the latest, recent advisory', () => {
    const status: AdvisoryStatus = {
      kind: 'latest',
      issuedAt: '2026-10-19T12:00:00Z',
      age: { hours: 1, label: '1 hour ago', stale: false },
      newer: null,
    };
    render(<AdvisoryStatusBanner status={status} />);

    const banner = screen.getByTestId('advisory-banner');
    expect(banner).toHaveAttribute('data-state', 'latest');
    expect(banner).toHaveTextContent('Latest advisory · issued 19 Oct 12:00 UTC (1 hour ago)');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
