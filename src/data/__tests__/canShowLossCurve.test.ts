import {
  canShowLossCurve,
  shouldResetHazardScenario,
  type HazardScenarioSelection,
  type RealWMSLayer,
} from '../realThreddsLayers';

const selection = (over: Partial<HazardScenarioSelection> = {}): HazardScenarioSelection => ({
  product: 'combined',
  slrScenarioM: 0,
  returnPeriodYears: 100,
  eventLabel: null,
  ...over,
});

describe('canShowLossCurve', () => {
  const curve = { points: [] };

  it('does not crash, or draw, when there is no selection and no product (Scenarios -> Forecast)', () => {
    // Previously `selection?.product === selectedProduct` was `undefined === undefined`,
    // and the next clause read `.returnPeriodYears` of null
    expect(() => canShowLossCurve(curve, null, undefined)).not.toThrow();
    expect(canShowLossCurve(curve, null, undefined)).toBe(false);
    expect(canShowLossCurve(curve, undefined, undefined)).toBe(false);
  });

  it('draws for a return-period scenario of the product shown', () => {
    expect(canShowLossCurve(curve, selection(), 'combined')).toBe(true);
  });

  it('does not draw without a curve, for another product, or for an event-based scenario', () => {
    expect(canShowLossCurve(null, selection(), 'combined')).toBe(false);
    expect(canShowLossCurve(curve, selection(), 'coastal')).toBe(false);
    expect(
      canShowLossCurve(
        curve,
        selection({ returnPeriodYears: null, eventLabel: 'Meena' }),
        'combined'
      )
    ).toBe(false);
  });
});

describe('shouldResetHazardScenario', () => {
  const layer = (product: string) =>
    ({ id: product, hazardScenario: selection({ product }) }) as unknown as RealWMSLayer;

  it('keeps a restored scenario while its layers are still loading', () => {
    // 0 layers during load once made "not offered" true and wiped a scenario from the URL
    expect(
      shouldResetHazardScenario([], selection({ slrScenarioM: 0.5, returnPeriodYears: 100 }))
    ).toBe(false);
  });

  it('keeps a scenario whose product is offered, and resets one that no longer is', () => {
    expect(shouldResetHazardScenario([layer('combined')], selection())).toBe(false);
    expect(shouldResetHazardScenario([layer('swell')], selection())).toBe(true);
  });

  it('has nothing to reset without a selection', () => {
    expect(shouldResetHazardScenario([layer('combined')], null)).toBe(false);
  });
});
