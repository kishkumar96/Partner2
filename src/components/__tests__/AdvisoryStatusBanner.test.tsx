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

  it('is one slim line with the same button as a bar for under the page header', () => {
    const status: AdvisoryStatus = {
      kind: 'older',
      issuedAt: '2026-10-19T06:00:00Z',
      age: { hours: 40, label: '40 hours ago', stale: true },
      newer: { issuedAt: '2026-10-19T12:00:00Z', count: 1 },
    };
    const onSwitch = jest.fn();
    render(<AdvisoryStatusBanner variant="bar" status={status} onSwitchToLatest={onSwitch} />);

    const banner = screen.getByTestId('advisory-banner');
    expect(banner).toHaveAttribute('data-variant', 'bar');
    expect(banner).toHaveAttribute('data-state', 'older');
    expect(banner).toHaveTextContent('Not the latest forecast.');
    expect(banner).toHaveTextContent('Issued 19 Oct 06:00 UTC (40 hours ago)');
    expect(banner).toHaveTextContent('1 newer, latest 19 Oct 12:00 UTC');
    const button = screen.getByRole('button', { name: 'Switch to latest' });
    expect(button.className).toContain('min-h-[44px]');
    fireEvent.click(button);
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

  it('says in one header line when even the newest advisory is old', () => {
    const status: AdvisoryStatus = {
      kind: 'latest-aging',
      issuedAt: '2026-10-19T12:00:00Z',
      age: { hours: 336, label: '14 days ago', stale: true },
      newer: null,
    };
    render(<AdvisoryStatusBanner variant="bar" status={status} />);

    const banner = screen.getByTestId('advisory-banner');
    expect(banner).toHaveAttribute('data-variant', 'bar');
    expect(banner).toHaveAttribute('data-state', 'aging');
    expect(banner).toHaveTextContent('Latest advisory, but issued 19 Oct 12:00 UTC (14 days ago)');
    expect(banner).toHaveTextContent('Check for a newer forecast before acting on it');
  });

  it('fits beside the event picker as a pill, with a way to the latest', () => {
    const status: AdvisoryStatus = {
      kind: 'older',
      issuedAt: '2026-10-19T00:00:00Z',
      age: { hours: 300, label: '13 days ago', stale: true },
      newer: { issuedAt: '2026-10-19T12:00:00Z', count: 2 },
    };
    const onSwitch = jest.fn();
    render(<AdvisoryStatusBanner variant="pill" status={status} onSwitchToLatest={onSwitch} />);
    const pill = screen.getByTestId('advisory-banner');
    expect(pill).toHaveAttribute('data-variant', 'pill');
    expect(pill).toHaveTextContent('Not the latest · 2 newer');
    expect(pill).toHaveAttribute('title', expect.stringContaining('latest 19 Oct 12:00 UTC'));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to latest' }));
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });
});
