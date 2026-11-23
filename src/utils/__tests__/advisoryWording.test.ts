import {
  newestAdvisoryState,
  newestBadgeLabel,
  noNewerParts,
  noNewerSentence,
} from '../advisoryWording';
import { STORM_ACTIVE_WITHIN_HOURS, groupForecastRuns } from '../forecastRuns';
import { STALE_AFTER_HOURS } from '../forecastBriefing';

describe('newestAdvisoryState', () => {
  it('is current up to the banner’s own 12 hours, overdue after, quiet after 72', () => {
    expect(STALE_AFTER_HOURS).toBe(12);
    expect(STORM_ACTIVE_WITHIN_HOURS).toBe(72);
    expect(newestAdvisoryState(0)).toBe('current');
    expect(newestAdvisoryState(12)).toBe('current');
    expect(newestAdvisoryState(12.01)).toBe('overdue');
    expect(newestAdvisoryState(72)).toBe('overdue');
    expect(newestAdvisoryState(72.01)).toBe('quiet');
    expect(newestAdvisoryState(24 * 30)).toBe('quiet');
  });

  it('treats an age it does not know as overdue: it cannot call it current', () => {
    expect(newestAdvisoryState(null)).toBe('overdue');
    expect(newestAdvisoryState(undefined)).toBe('overdue');
    expect(newestAdvisoryState(Number.NaN)).toBe('overdue');
  });
});

describe('the wording', () => {
  it('keeps "Latest" until the quiet is long, then says "Last received"', () => {
    expect(newestBadgeLabel(1)).toBe('Latest');
    expect(newestBadgeLabel(48)).toBe('Latest');
    expect(newestBadgeLabel(73)).toBe('Last received');
  });

  it('says what is known, then what it cannot know, then what to do: never "check for newer"', () => {
    const overdue = noNewerParts(30, '18 Nov 18:00 UTC', '1 day ago');
    expect(overdue.headline).toBe('No newer advisory received since 18 Nov 18:00 UTC (1 day ago)');
    expect(overdue.detail).toBe('Confirm with the issuing agency before acting.');
    const quiet = noNewerParts(120, '18 Nov 18:00 UTC', '5 days ago');
    expect(quiet.detail).toBe(
      'The storm may be over. Confirm with the issuing agency before acting.'
    );
    expect(noNewerSentence(120, '18 Nov 18:00 UTC', '5 days ago')).not.toMatch(/check for/i);
  });

  it('copes with an advisory time it does not have', () => {
    expect(noNewerSentence(null, null, undefined)).toBe(
      'No newer advisory received. Confirm with the issuing agency before acting.'
    );
  });
});

describe('the storm picker, the badge and the wording cannot disagree', () => {
  const NOW = Date.parse('2026-11-23T12:00:00Z');
  const group = (hoursAgo: number) =>
    groupForecastRuns(
      [
        {
          id: 'x',
          storm: 'Xavier',
          issuedAt: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
          isLatest: true,
        },
      ],
      NOW
    )[0];

  it.each([1, 11, 13, 30, 71, 73, 100, 500])(
    'at %s hours: "past" in the picker exactly when the badge says "Last received"',
    hours => {
      const past = !group(hours).active;
      expect(past).toBe(newestBadgeLabel(hours) === 'Last received');
      expect(past).toBe(newestAdvisoryState(hours) === 'quiet');
    }
  );
});
