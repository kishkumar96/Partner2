import { withRiskSource } from '../dataSourceLabel';

const LABEL =
  'Track: Local Files | Event: Partner API | Risk: Local Files | Hazards: Static Config';

describe('withRiskSource', () => {
  it('corrects only the risk part of the line', () => {
    expect(withRiskSource(LABEL, 'partner_api')).toBe(
      'Track: Local Files | Event: Partner API | Risk: Partner API | Hazards: Static Config'
    );
  });

  it('can put it back, and leaves a line that is already right alone', () => {
    const fixed = withRiskSource(LABEL, 'partner_api');
    expect(withRiskSource(fixed, 'partner_api')).toBe(fixed);
    expect(withRiskSource(fixed, 'local_files')).toBe(LABEL);
  });

  it('works when risk is the last part of the line', () => {
    expect(withRiskSource('Event: Partner API | Risk: Local Files', 'partner_api')).toBe(
      'Event: Partner API | Risk: Partner API'
    );
  });

  it('leaves an empty label, or one with no risk part, alone', () => {
    expect(withRiskSource('', 'partner_api')).toBe('');
    expect(withRiskSource('Track: Partner API', 'partner_api')).toBe('Track: Partner API');
  });
});
