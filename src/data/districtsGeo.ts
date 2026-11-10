import { DistrictsGeoJSON } from '@/types';

/**
 * Empty GeoJSON placeholder for district polygons.
 * Real data will be loaded from THREDDS case_study2 endpoints.
 */
export const districtsGeoJSON: DistrictsGeoJSON = {
  type: 'FeatureCollection',
  features: [],
};
