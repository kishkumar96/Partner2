import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ReleaseScrubber from '../ReleaseScrubber';
import type { ReleaseStep } from '@/utils/advisoryReleases';

const steps = (selectedId: string): ReleaseStep[] =>
  [
    { runId: 'a', label: '18 Nov 00Z', issuedAt: '2026-11-18T00:00:00Z', isLatest: false },
    { runId: 'b', label: '18 Nov 10Z', issuedAt: '2026-11-18T10:00:00Z', isLatest: false },
    { runId: 'c', label: '18 Nov 12Z', issuedAt: '2026-11-18T12:00:00Z', isLatest: true },
  ].map(step => ({ ...step, selected: step.runId === selectedId }));

describe('ReleaseScrubber', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the advisory on screen and where it sits in the storm', () => {
    render(<ReleaseScrubber steps={steps('b')} onSelect={jest.fn()} />);
    expect(screen.getByText('18 Nov 10Z')).toBeInTheDocument();
    expect(screen.getByText(/2\/3/)).toBeInTheDocument();
  });

  it('switches at once with the arrow buttons', () => {
    const onNext = jest.fn();
    const { unmount } = render(<ReleaseScrubber steps={steps('b')} onSelect={onNext} />);
    fireEvent.click(screen.getByLabelText('Next advisory'));
    expect(onNext).toHaveBeenCalledWith('c');
    unmount();

    const onPrevious = jest.fn();
    render(<ReleaseScrubber steps={steps('b')} onSelect={onPrevious} />);
    fireEvent.click(screen.getByLabelText('Previous advisory'));
    expect(onPrevious).toHaveBeenCalledWith('a');
  });

  it('waits for the slider to rest and then switches once, to where it stopped', () => {
    const onSelect = jest.fn();
    render(<ReleaseScrubber steps={steps('c')} onSelect={onSelect} />);
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '1' } });
    fireEvent.change(slider, { target: { value: '0' } });
    // The label follows the drag straight away
    expect(screen.getByText('18 Nov 00Z')).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('disables the arrows at the ends, and offers a jump to the latest only when elsewhere', () => {
    const { rerender } = render(<ReleaseScrubber steps={steps('a')} onSelect={jest.fn()} />);
    expect(screen.getByLabelText('Previous advisory')).toBeDisabled();
    expect(screen.getByLabelText('Jump to the latest advisory')).toBeInTheDocument();
    rerender(<ReleaseScrubber steps={steps('c')} onSelect={jest.fn()} />);
    expect(screen.getByLabelText('Next advisory')).toBeDisabled();
    expect(screen.queryByLabelText('Jump to the latest advisory')).toBeNull();
  });
});
