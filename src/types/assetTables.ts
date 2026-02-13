/**
 * Type definitions for asset table components
 * Provides type safety for buildings and roads damage tables
 */

import type { GeoJSON } from 'geojson';

/**
 * Building asset data for table display
 */
export interface BuildingAsset {
  id: string;
  loss: number;
  exposure: number;
  damageRatio: number;
  damageLevel: 'minimal' | 'minor' | 'moderate' | 'substantial' | 'severe' | 'catastrophic';
  buildingType: string;
  occupancy: string;
  region: string;
  coordinates: [number, number];
  properties: Record<string, any>;
}

/**
 * Road asset data for table display
 */
export interface RoadAsset {
  id: string;
  loss: number;
  exposure: number;
  damageRatio: number;
  damageLevel: 'light' | 'moderate' | 'heavy' | 'severe';
  roadType: string;
  surface: string;
  region: string;
  coordinates: [number, number];
  properties: Record<string, any>;
}

/**
 * Generic sort configuration
 */
export interface SortConfig<T> {
  key: keyof T;
  direction: 'asc' | 'desc';
}

/**
 * Filter configuration for asset tables
 */
export interface AssetFilter {
  searchTerm: string;
  damageLevel?: string[];
  region?: string[];
  lossMin?: number;
  lossMax?: number;
}

/**
 * Pagination state
 */
export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Table action callbacks
 */
export interface TableActions<T> {
  onRowClick: (asset: T) => void;
  onZoom: (asset: T) => void;
  onDetails?: (asset: T) => void;
}
