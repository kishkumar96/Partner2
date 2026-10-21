import { fireEvent, render, screen } from '@testing-library/react';
import NewAdvisoryBanner from '../NewAdvisoryBanner';
import type { EventRecord } from '@/data/eventRecords';

const advisory = {
  id: 'c',
  countryCode: 'CK',
  name: 'TC Wati',
  cycloneName: '2026101806_Wati',
  trackIssuedTime: '2026-10-18T06:00:00Z',
  isForecast: true,
} as EventRecord;

describe('NewAdvisoryBanner', () => {
  it('names the storm and the issue time, in UTC', () => {
    render(<NewAdvisoryBanner advisory={advisory} onShow={jest.fn()} onDismiss={jest.fn()} />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('New advisory for TC Wati');
    expect(banner).toHaveTextContent('2026-10-18 06:00 UTC');
  });

  it('switches only when asked, and can be dismissed', () => {
    const onShow = jest.fn();
    const onDismiss = jest.fn();
    render(<NewAdvisoryBanner advisory={advisory} onShow={onShow} onDismiss={onDismiss} />);
    expect(onShow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Show it' }));
    expect(onShow).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss new advisory notice' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
