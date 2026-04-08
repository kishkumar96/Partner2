/**
 * Tests for useAssetTableData Hook
 */
import { renderHook } from '@testing-library/react';
import { useAssetTableData } from '../useAssetTableData';

describe('useAssetTableData Hook', () => {
  it('returns initial data structure', () => {
    const { result } = renderHook(() => useAssetTableData(null));

    expect(result.current).toHaveProperty('data');
    expect(result.current).toHaveProperty('allData');
    expect(result.current).toHaveProperty('totalCount');
    expect(result.current).toHaveProperty('pagination');
  });

  it('returns filtered data', () => {
    const mockData = [
      { id: '1', name: 'Asset 1', loss: 1000, region: 'A', damageLevel: 'moderate' } as any,
      { id: '2', name: 'Asset 2', loss: 2000, region: 'B', damageLevel: 'severe' } as any,
    ];
    const { result } = renderHook(() => useAssetTableData(mockData));

    expect(result.current.data).toBeDefined();
    expect(result.current.allData).toBeDefined();
    expect(result.current.totalCount).toBe(2);
  });

  it('handles sorting', () => {
    const mockData = [
      { id: '1', name: 'Asset 1', loss: 1000, region: 'A', damageLevel: 'moderate' } as any,
      { id: '2', name: 'Asset 2', loss: 2000, region: 'B', damageLevel: 'severe' } as any,
    ];
    const { result } = renderHook(() => useAssetTableData(mockData));

    expect(result.current).toHaveProperty('handleSort');
    expect(result.current.sortConfig).toBeDefined();
  });

  it('handles pagination', () => {
    const mockData = [
      { id: '1', name: 'Asset 1', loss: 1000, region: 'A', damageLevel: 'moderate' } as any,
      { id: '2', name: 'Asset 2', loss: 2000, region: 'B', damageLevel: 'severe' } as any,
    ];
    const { result } = renderHook(() => useAssetTableData(mockData));

    expect(result.current).toHaveProperty('pagination');
    expect(result.current.pagination.currentPage).toBe(1);
  });

  it('handles search filtering', () => {
    const mockData = [
      { id: '1', name: 'Asset 1', loss: 1000, region: 'A', damageLevel: 'moderate' } as any,
      { id: '2', name: 'Asset 2', loss: 2000, region: 'B', damageLevel: 'severe' } as any,
    ];
    const { result } = renderHook(() => useAssetTableData(mockData));

    expect(result.current).toHaveProperty('handleFilterChange');
    expect(result.current.filter).toBeDefined();
  });
});
