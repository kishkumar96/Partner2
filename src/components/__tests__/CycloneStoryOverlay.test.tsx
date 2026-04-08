import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CycloneStoryOverlay from '@/components/CycloneStoryOverlay';
import type { StoryBeat } from '@/utils/cycloneStory';

const buildBeat = (id: string, index: number, title: string): StoryBeat => ({
  id,
  index,
  time: new Date('2023-10-24T15:00:00Z'),
  title,
  description: `${title} description`,
  severity: 3,
  type: 'peak-intensity',
});

describe('CycloneStoryOverlay playback', () => {
  const forecastTrack = [
    { longitude: 169.4, latitude: -12.7 },
    { longitude: 169.8, latitude: -13.1 },
  ] as any;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('clears timers when paused', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onSelect = jest.fn();
    const storyBeats = [buildBeat('b1', 0, 'Beat 1'), buildBeat('b2', 1, 'Beat 2')];

    render(
      <CycloneStoryOverlay
        map={null}
        forecastTrack={forecastTrack}
        storyBeats={storyBeats}
        currentIndex={0}
        onSelect={onSelect}
        onExit={() => undefined}
      />
    );

    await user.click(screen.getByRole('button', { name: /play/i }));
    await user.click(screen.getByRole('button', { name: /pause/i }));

    act(() => {
      jest.advanceTimersByTime(2400);
    });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('cleans up and reschedules on dependency changes', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const firstSelect = jest.fn();
    const secondSelect = jest.fn();
    const storyBeats = [buildBeat('b1', 0, 'Beat 1'), buildBeat('b2', 1, 'Beat 2')];

    const { rerender } = render(
      <CycloneStoryOverlay
        map={null}
        forecastTrack={forecastTrack}
        storyBeats={storyBeats}
        currentIndex={0}
        onSelect={firstSelect}
        onExit={() => undefined}
      />
    );

    await user.click(screen.getByRole('button', { name: /play/i }));

    act(() => {
      jest.advanceTimersByTime(1200);
    });

    expect(firstSelect).toHaveBeenCalled();
    expect(firstSelect).toHaveBeenCalledWith(1);

    rerender(
      <CycloneStoryOverlay
        map={null}
        forecastTrack={forecastTrack}
        storyBeats={[...storyBeats]}
        currentIndex={0}
        onSelect={secondSelect}
        onExit={() => undefined}
      />
    );

    act(() => {
      jest.advanceTimersByTime(1200);
    });

    expect(firstSelect).toHaveBeenCalled();
    expect(secondSelect).toHaveBeenCalled();
    expect(secondSelect).toHaveBeenCalledWith(1);
  });

  it('clears timers on unmount', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onSelect = jest.fn();
    const storyBeats = [buildBeat('b1', 0, 'Beat 1'), buildBeat('b2', 1, 'Beat 2')];

    const { unmount } = render(
      <CycloneStoryOverlay
        map={null}
        forecastTrack={forecastTrack}
        storyBeats={storyBeats}
        currentIndex={0}
        onSelect={onSelect}
        onExit={() => undefined}
      />
    );

    await user.click(screen.getByRole('button', { name: /play/i }));
    unmount();

    act(() => {
      jest.advanceTimersByTime(2400);
    });

    expect(onSelect).not.toHaveBeenCalled();
  });
});
