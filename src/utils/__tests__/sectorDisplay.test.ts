import { sectorLabel, sortSectorsUnclassifiedLast } from '@/utils/sectorDisplay';

describe('sectorDisplay', () => {
  it('names the model’s Unknown sector, and a missing one, as Unclassified', () => {
    expect(sectorLabel('Unknown')).toBe('Unclassified');
    expect(sectorLabel('')).toBe('Unclassified');
    expect(sectorLabel('Residential')).toBe('Residential');
  });

  it('keeps unclassified loss, after the real sectors, so the parts add up to the total', () => {
    // TC Meena: unclassified is the second-largest share, but still listed last
    const rows = [
      { Sector: 'Commercial', Total_Loss: 3 },
      { Sector: 'Unknown', Total_Loss: 10.89 },
      { Sector: 'Residential', Total_Loss: 22.9 },
    ];
    const sorted = sortSectorsUnclassifiedLast(
      rows,
      r => r.Sector,
      r => r.Total_Loss
    );
    expect(sorted.map(r => r.Sector)).toEqual(['Residential', 'Commercial', 'Unknown']);
    expect(sorted.reduce((sum, r) => sum + r.Total_Loss, 0)).toBeCloseTo(36.79);
  });
});
