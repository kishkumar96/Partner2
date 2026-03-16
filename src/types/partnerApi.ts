/**
 * TypeScript interfaces for Partner API response structures
 * Base URL: https://opmthredds.gem.spc.int/partner_api/v1/
 */

import type { CountryCode } from './thredds';

/**
 * Country Record from /v1/country/
 */
export interface PartnerCountry {
  id: number;
  name: string;
  code: string;
  iso_code?: string;
  region?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Cyclone Track Point from /v1/cyclone_track/
 */
export interface PartnerCycloneTrackPoint {
  id: number;
  cyclone_id: string;
  cyclone_name: string;
  country: number;
  latitude: number;
  longitude: number;
  timestamp: string;
  wind_speed: number; // knots
  pressure: number; // hPa
  category: number;
  forecast: boolean;
  created_at?: string;
}

/**
 * Cyclone Track GeoJSON Response
 */
export interface PartnerCycloneTrackResponse {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Point';
      coordinates: [number, number]; // [lng, lat]
    };
    properties: {
      cyclone_id: string;
      cyclone_name: string;
      timestamp: string;
      wind_speed: number;
      pressure: number;
      category: number;
      forecast: boolean;
    };
  }>;
}

/**
 * Event Record from /v1/event/
 */
export interface PartnerEvent {
  id: number;
  country: number;
  event_type: string;
  event_name: string;
  event_date: string;
  description?: string;
  severity?: 'Low' | 'Medium' | 'High' | 'Extreme';
  affected_population?: number;
  estimated_damage?: number;
  status?: 'Ongoing' | 'Completed' | 'Forecast';
  created_at?: string;
  updated_at?: string;
}

/**
 * Risk Information Record from /v1/risk_information/
 */
export interface PartnerRiskInformation {
  id: number;
  country: number;
  event?: number;
  region_name?: string;
  asset_type?: string;
  sector?: string;
  exposed_count?: number;
  damaged_count?: number;
  total_loss?: number;
  direct_loss?: number;
  indirect_loss?: number;
  affected_population?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Risk Forecast Record from /v1/risk_forecast/ (NEW)
 */
export interface PartnerRiskForecast {
  id: number;
  country: number;
  cyclone_id?: string;
  forecast_time: string; // ISO timestamp
  forecast_horizon: number; // hours ahead (e.g., 24, 48, 72)
  region_name?: string;
  asset_type?: string;
  predicted_damage_count?: number;
  predicted_loss?: number;
  confidence_level?: number; // 0-1 scale
  uncertainty_range?: {
    min: number;
    max: number;
  };
  created_at?: string;
}

/**
 * Hazard Information Record from /v1/hazard_information/{id}/
 */
export interface PartnerHazardInformation {
  id: number;
  country: number;
  event?: number;
  hazard_type: 'wind' | 'inundation' | 'storm_surge' | 'rainfall' | 'landslide';
  intensity: number;
  unit: string;
  geometry?: GeoJSON.Geometry;
  affected_area?: number; // sq km
  bbox?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  created_at?: string;
  updated_at?: string;
}

/**
 * Citizen Science Observation from /v1/citizen_science/ (NEW)
 */
export interface PartnerCitizenScience {
  id: number;
  country: number;
  event?: number;
  observer_name?: string;
  observation_date: string;
  latitude: number;
  longitude: number;
  observation_type: 'damage' | 'flooding' | 'wind' | 'infrastructure' | 'other';
  severity?: 'Minor' | 'Moderate' | 'Severe' | 'Extreme';
  description?: string;
  photo_url?: string;
  verified: boolean;
  created_at?: string;
}

/**
 * Paginated API Response Wrapper
 */
export interface PartnerApiPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * API Error Response
 */
export interface PartnerApiError {
  detail?: string;
  error?: string;
  message?: string;
  status?: number;
}

/**
 * API Health Status
 */
export interface PartnerApiHealthStatus {
  endpoint: string;
  available: boolean;
  responseTime?: number; // milliseconds
  error?: string;
  lastChecked: string;
}

/**
 * Country API Availability Map
 */
export interface CountryApiAvailability {
  countryCode: CountryCode;
  countryId: number | null;
  available: boolean;
  endpoints: {
    cyclone_track: PartnerApiHealthStatus;
    event: PartnerApiHealthStatus;
    risk_information: PartnerApiHealthStatus;
    risk_forecast: PartnerApiHealthStatus;
    hazard_information: PartnerApiHealthStatus;
    citizen_science: PartnerApiHealthStatus;
  };
}

/**
 * Complete API Health Check Result
 */
export interface PartnerApiHealthCheck {
  baseUrl: string;
  healthy: boolean;
  checkedAt: string;
  countries: Record<CountryCode, CountryApiAvailability>;
}
