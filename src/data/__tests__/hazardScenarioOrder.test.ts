import { compareHazardScenarioPeriods } from '../realThreddsLayers';

const rp = (years: number) => ({ returnPeriodYears: years, eventLabel: null });
const ev = (label: string) => ({ returnPeriodYears: null, eventLabel: label });
const labels = (items: Array<{ returnPeriodYears: number | null; eventLabel: string | null }>) =>
  [...items]
    .sort(compareHazardScenarioPeriods)
    .map(i => i.eventLabel ?? `${i.returnPeriodYears}yr`);

describe('compareHazardScenarioPeriods', () => {
  it('orders return periods numerically, before any event', () => {
    expect(labels([ev('5'), rp(100), rp(10), rp(25)])).toEqual(['10yr', '25yr', '100yr', '5']);
  });

  it('orders dated historical events chronologically, not by day of month', () => {
    expect(
      labels([ev('02-Jan-1995'), ev('01-Mar-1987'), ev('16-Feb-2005'), ev('26-Feb-1989')])
    ).toEqual(['01-Mar-1987', '26-Feb-1989', '02-Jan-1995', '16-Feb-2005']);
  });

  it('orders numeric synthetic event ids naturally', () => {
    expect(labels([ev('100'), ev('10'), ev('2'), ev('1')])).toEqual(['1', '2', '10', '100']);
  });
});
