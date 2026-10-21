import { getHazardTypesToShow } from '../RealDataLayers';

describe('getHazardTypesToShow', () => {
  it('shows fluvial-depth layers with the other flood layers when nothing is filtered', () => {
    expect(getHazardTypesToShow([], false, true)).toEqual(
      expect.arrayContaining(['inundation', 'flood', 'fluvial-depth'])
    );
  });

  it('shows fluvial-depth layers when the Flood hazard is selected', () => {
    expect(getHazardTypesToShow(['flood'], true, true)).toContain('fluvial-depth');
  });

  it('hides fluvial-depth layers with the other flood layers when inundation is off', () => {
    const types = getHazardTypesToShow(['flood'], true, false);
    expect(types).not.toContain('fluvial-depth');
    expect(types).not.toContain('flood');
  });

  it('does not add flood layers for a cyclone-only selection', () => {
    expect(getHazardTypesToShow(['tropical-cyclone'], true, true)).toEqual(['cyclone', 'wind']);
  });
});
