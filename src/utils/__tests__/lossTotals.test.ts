import { withTotalLossFromParts } from '@/utils/lossTotals';

// The areas' shapes don't matter here, so the geometry is a stand-in point
const area = (props: Record<string, unknown>): GeoJSON.Feature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [0, 0] },
  properties: props,
});

describe('withTotalLossFromParts', () => {
  it('fills a zero Total_Loss from its parts, as Meena gives Rarotonga', () => {
    const out = withTotalLossFromParts({
      type: 'FeatureCollection',
      features: [
        area({
          Region: 'Rarotonga',
          Total_Loss: 0,
          Building_Loss: 39572542,
          Road_Loss: 200000,
          Crop_Loss: 27458,
        }),
      ],
    });
    expect(out.features[0].properties?.Total_Loss).toBe(39800000);
  });

  it('leaves a recorded total, and an area with no loss at all, as they are', () => {
    const input = {
      type: 'FeatureCollection' as const,
      features: [
        area({ Total_Loss: 5, Building_Loss: 3 }),
        area({ Total_Loss: 0, Building_Loss: 0 }),
      ],
    };
    expect(withTotalLossFromParts(input)).toBe(input);
  });
});
