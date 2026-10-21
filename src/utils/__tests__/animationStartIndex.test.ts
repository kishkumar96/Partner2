import { animationStartIndex } from '../cycloneAnimationLoader';

// TC Wati's 12:00Z advisory, and the dashboard's Cook Islands centre
const wati = [
  [-162.9, -14.4],
  [-162.7, -15.1],
  [-162.2, -15.8],
  [-161.7, -16.5],
  [-160.9, -17.2],
  [-160.0, -18.0],
  [-158.6, -18.8],
  [-157.3, -19.6],
].map(([longitude, latitude]) => ({ longitude, latitude }));
const cookIslands: [number, number] = [-159.78, -21.2];

describe('animationStartIndex', () => {
  it('starts a forecast at its first advisory point', () => {
    expect(animationStartIndex(wati, cookIslands, true)).toBe(0);
  });

  it('starts a storm that has passed at the point nearest the country', () => {
    expect(animationStartIndex(wati, cookIslands, false)).toBe(6);
  });

  it('copes with an empty track', () => {
    expect(animationStartIndex([], cookIslands, false)).toBe(0);
    expect(animationStartIndex([], cookIslands, true)).toBe(0);
  });
});
