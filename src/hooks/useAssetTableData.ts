/**
 * Custom hook for managing asset table data
 * Handles filtering, sorting, pagination, and search
 */

import { useMemo, useState, useCallback, useEffect } from 'react';
import type {
  BuildingAsset,
  RoadAsset,
  SortConfig,
  AssetFilter,
  PaginationState,
} from '@/types/assetTables';

type Asset = BuildingAsset | RoadAsset;

export function useAssetTableData<T extends Asset>(rawData: T[] | null, initialPageSize = 50) {
  // State management
  const [sortConfig, setSortConfig] = useState<SortConfig<T> | null>({
    key: 'loss' as keyof T,
    direction: 'desc',
  });
  const [filter, setFilter] = useState<AssetFilter>({
    searchTerm: '',
  });
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    pageSize: initialPageSize,
    totalItems: 0,
    totalPages: 0,
  });

  // Filter data based on search and filters
  const filteredData = useMemo(() => {
    if (!rawData) return [];

    let result = [...rawData];

    // Search filter
    if (filter.searchTerm) {
      const searchLower = filter.searchTerm.toLowerCase();
      result = result.filter(asset => {
        const searchableFields = [
          asset.id,
          asset.region,
          'buildingType' in asset ? asset.buildingType : '',
          'roadType' in asset ? asset.roadType : '',
        ]
          .join(' ')
          .toLowerCase();

        return searchableFields.includes(searchLower);
      });
    }

    // Damage level filter
    if (filter.damageLevel && filter.damageLevel.length > 0) {
      result = result.filter(asset => filter.damageLevel!.includes(asset.damageLevel));
    }

    // Region filter
    if (filter.region && filter.region.length > 0) {
      result = result.filter(asset => filter.region!.includes(asset.region));
    }

    // Loss range filter
    if (filter.lossMin !== undefined) {
      result = result.filter(asset => asset.loss >= filter.lossMin!);
    }
    if (filter.lossMax !== undefined) {
      result = result.filter(asset => asset.loss <= filter.lossMax!);
    }

    return result;
  }, [rawData, filter]);

  // Sort filtered data
  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;

    const sorted = [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      return 0;
    });

    return sorted;
  }, [filteredData, sortConfig]);

  // Update pagination when filtered data changes
  useEffect(() => {
    const totalItems = sortedData.length;
    const totalPages = Math.ceil(totalItems / pagination.pageSize);

    setPagination(prev => ({
      ...prev,
      totalItems,
      totalPages,
      currentPage: Math.min(prev.currentPage, totalPages || 1),
    }));
  }, [sortedData.length, pagination.pageSize]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const startIndex = (pagination.currentPage - 1) * pagination.pageSize;
    const endIndex = startIndex + pagination.pageSize;
    return sortedData.slice(startIndex, endIndex);
  }, [sortedData, pagination.currentPage, pagination.pageSize]);

  // Handler functions
  const handleSort = useCallback((key: keyof T) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        // Toggle direction or remove sort
        if (prev.direction === 'desc') {
          return { key, direction: 'asc' };
        }
        return null;
      }
      return { key, direction: 'desc' };
    });
  }, []);

  const handleFilterChange = useCallback((newFilter: Partial<AssetFilter>) => {
    setFilter(prev => ({ ...prev, ...newFilter }));
    setPagination(prev => ({ ...prev, currentPage: 1 })); // Reset to first page
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, currentPage: page }));
  }, []);

  const handlePageSizeChange = useCallback((pageSize: number) => {
    setPagination(prev => ({
      ...prev,
      pageSize,
      currentPage: 1,
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilter({ searchTerm: '' });
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  }, []);

  // Get unique values for filter dropdowns
  const uniqueRegions = useMemo(() => {
    if (!rawData) return [];
    return Array.from(new Set(rawData.map(a => a.region))).sort();
  }, [rawData]);

  const uniqueDamageLevels = useMemo(() => {
    if (!rawData) return [];
    return Array.from(new Set(rawData.map(a => a.damageLevel)));
  }, [rawData]);

  return {
    // Data
    data: paginatedData,
    allData: sortedData,
    totalCount: sortedData.length,

    // State
    sortConfig,
    filter,
    pagination,

    // Metadata
    uniqueRegions,
    uniqueDamageLevels,

    // Actions
    handleSort,
    handleFilterChange,
    handlePageChange,
    handlePageSizeChange,
    resetFilters,
  };
}

/**
 * Transform GeoJSON building data into table format
 */
export function transformBuildingData(geojson: GeoJSON.FeatureCollection | null): BuildingAsset[] {
  if (!geojson || !geojson.features) return [];

  return geojson.features
    .map((feature, index) => {
      const props = feature.properties || {};
      const geometry = feature.geometry;

      // Extract coordinates
      let coordinates: [number, number] = [0, 0];
      if (geometry && geometry.type === 'Point') {
        coordinates = geometry.coordinates as [number, number];
      }

      const loss = Number(props.Wind_Loss || props.Loss || 0);
      const exposure = Number(props.Exposure || 0);
      const damageRatio = Number(props.Damage_Ratio || 0);

      // Determine damage level
      let damageLevel: BuildingAsset['damageLevel'] = 'minimal';
      if (loss >= 500000) damageLevel = 'catastrophic';
      else if (loss >= 100000) damageLevel = 'severe';
      else if (loss >= 50000) damageLevel = 'substantial';
      else if (loss >= 10000) damageLevel = 'moderate';
      else if (loss >= 5000) damageLevel = 'minor';

      return {
        id: props.id || props.ID || `building-${index}`,
        loss,
        exposure,
        damageRatio,
        damageLevel,
        buildingType: props.BTypeCat || props.Building_Type || 'Unknown',
        occupancy: props.Occupancy || props.UseType || 'Unknown',
        region: props.Admin2_Region || props.Admin1_Region || 'Unknown',
        coordinates,
        properties: props,
      };
    })
    .filter(asset => asset.loss > 0); // Only show damaged buildings
}

/**
 * Transform GeoJSON road data into table format
 */
export function transformRoadData(geojson: GeoJSON.FeatureCollection | null): RoadAsset[] {
  if (!geojson || !geojson.features) return [];

  const roads = geojson.features
    .map((feature, index) => {
      const props = feature.properties || {};
      const geometry = feature.geometry;

      // Extract center point of road segment
      let coordinates: [number, number] = [0, 0];
      if (geometry && geometry.type === 'LineString') {
        const coords = geometry.coordinates as number[][];
        const midIndex = Math.floor(coords.length / 2);
        coordinates = coords[midIndex] as [number, number];
      }

      // Support both database (Total_Loss) and file (Wind_Loss) formats
      const loss = Number(props.Total_Loss || props.Wind_Loss || props.Loss || 0);
      const exposure = Number(props.Exposure || props.Value || 0);
      const damageRatio = Number(props.Damage_Ratio || 0);

      // Determine damage level - adjusted for actual data range ($1K-$5K)
      let damageLevel: RoadAsset['damageLevel'] = 'light';
      if (loss >= 3000) damageLevel = 'severe';
      else if (loss >= 2000) damageLevel = 'heavy';
      else if (loss >= 1000) damageLevel = 'moderate';

      // Support both database (road_type, road_name) and file (Road_Type) formats
      const roadType = props.road_type || props.Road_Type || props.UseType || 'Unknown';
      const roadName = props.road_name || props.Road_Name || '';
      const region = props.Admin2_Region || props.Admin1_Region || props.region || 'Unknown';

      return {
        id: props.id || props.ID || `road-${index}`,
        name: roadName,
        loss,
        exposure,
        damageRatio,
        damageLevel,
        roadType,
        surface: props.Surface || 'Unknown',
        region,
        coordinates,
        properties: props,
      };
    })
    .filter(asset => asset.loss > 0); // Only show damaged roads

  return roads;
}
