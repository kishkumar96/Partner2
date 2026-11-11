/** @jest-environment node */
import { hasPartnerRiskData } from '../realDataLoader';

type Bundle = Parameters<typeof hasPartnerRiskData>[0];

const empty = (): Bundle =>
  ({
    regionalImpacts: null,
    regionalImpactsBySector: null,
    exposureByCluster: null,
    regionalSummary: [],
    regionalSummaryBySector: [],
    impactByAsset: [],
    impactBySector: [],
    nationalSummary: [],
  }) as unknown as Bundle;

describe('hasPartnerRiskData', () => {
  it('is false when the API supplied no risk table', () => {
    expect(hasPartnerRiskData(empty())).toBe(false);
  });

  it('is true for any one table, whichever form it comes in', () => {
    const row = [{ Region: 'Rarotonga' }];
    expect(hasPartnerRiskData({ ...empty(), regionalSummary: row } as unknown as Bundle)).toBe(
      true
    );
    expect(
      hasPartnerRiskData({ ...empty(), regionalSummaryBySector: row } as unknown as Bundle)
    ).toBe(true);
    expect(hasPartnerRiskData({ ...empty(), impactBySector: row } as unknown as Bundle)).toBe(true);
    expect(hasPartnerRiskData({ ...empty(), nationalSummary: row } as unknown as Bundle)).toBe(
      true
    );
    expect(
      hasPartnerRiskData({
        ...empty(),
        regionalImpactsBySector: { type: 'FeatureCollection', features: [] },
      } as unknown as Bundle)
    ).toBe(true);
  });
});
