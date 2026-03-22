import type { LucideIcon } from 'lucide-react';

export interface Hazard {
  id: string;
  name: string;
  color: string;
  icon: LucideIcon;
}

export interface Sector {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
}

export interface District {
  id: string;
  name: string;
  provinceId: string;
}

export interface Province {
  id: string;
  name: string;
}

/**
 * Regional Impact - represents the impact of a disaster event on a specific region
 * Multiple regional impacts belong to one disaster event
 */
export interface RegionalImpact {
  id: string;
  eventId: string; // Links to the parent Event
  regionId: string; // District or province ID
  regionName: string;
  regionType: 'district' | 'province';
  location: {
    lat: number;
    lng: number;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedPopulation: number;
  economicDamage: number;
  // Sector-specific impacts within this region
  sectorImpacts?: {
    sectorId: string;
    loss: number;
    exposedBuildings: number;
    damagedBuildings: number;
  }[];
}

/**
 * Event - represents a single disaster occurrence (e.g., TC Lola, TC Harold)
 * This is the primary event entity, NOT regional breakdowns
 */
export interface Event {
  id: string;
  name: string; // e.g., "Tropical Cyclone Lola"
  date: string;
  hazardId: string;
  countryCode?: string;
  /** For expanded/regional events: the id of the master event they belong to */
  parentEventId?: string;

  // Aggregated national-level statistics
  totalAffectedPopulation: number;
  totalEconomicDamage: number;
  affectedRegions: number; // Count of regions/districts impacted
  severity: 'low' | 'medium' | 'high' | 'critical';

  // Primary location (e.g., landfall point or country center)
  location: {
    lat: number;
    lng: number;
  };

  // Optional: Link to detailed regional impacts
  regionalImpacts?: RegionalImpact[];

  // DEPRECATED: These fields maintained for backward compatibility
  // Will be removed in future version
  /** @deprecated Use regionalImpacts instead */
  sectorId?: string;
  /** @deprecated Use regionalImpacts instead */
  districtId?: string;
  /** @deprecated Use regionalImpacts instead */
  provinceId?: string;
}

export interface HazardLayer {
  id: string;
  hazardId: string;
  name: string;
  coordinates: [number, number][];
  intensity: number;
}

export interface ExposureData {
  id: string;
  hazardId: string;
  sectorId: string;
  eventId?: string;
  eventDate?: string;
  region?: string; // Region name for geographic context
  population: number;
  assets: number;
  infrastructure: number;
  buildingCount?: number; // Number of buildings exposed
}

export interface EconomicDamageData {
  id: string;
  hazardId: string;
  sectorId: string;
  eventId?: string;
  eventDate?: string;
  directLoss: number;
  indirectLoss: number;
  totalLoss: number;
  year: number;
}

export interface SummaryStats {
  totalEvents: number;
  totalAffectedPopulation: number;
  totalEconomicDamage: number;
}

export type AggregationLevel = 'district' | 'province' | 'national';

export interface FilterState {
  selectedHazards: string[];
  selectedSectors: string[];
  selectedEvents: string[];
  dateRange: {
    start: string;
    end: string;
  };
  aggregationLevel: AggregationLevel;
}

/**
 * District GeoJSON feature properties for hazard visualization
 */
export interface DistrictGeoProperties {
  id: string;
  name: string;
  provinceId: string;
  population: number;
  buildingCount: number;
  infrastructureCount: number;
  economicDamageUSD: number;
  // Hazard exposure values (0-1 scale for intensity)
  windExposure: number;
  cycloneTrackExposure: number;
  inundationExposure: number;
  primaryHazard: string;
}

/**
 * GeoJSON Feature for a district polygon
 */
export interface DistrictGeoFeature {
  type: 'Feature';
  properties: DistrictGeoProperties;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

/**
 * GeoJSON FeatureCollection for all districts
 */
export interface DistrictsGeoJSON {
  type: 'FeatureCollection';
  features: DistrictGeoFeature[];
}

/**
 * Regional summary data structure from CSV files
 */
export interface RegionalSummary {
  Region: string;
  Total_Population?: number;
  Population_Exposed_To_Any_Hazard?: number;
  Total_Loss?: number;
  Total_Exposed_Value_To_Any_Hazard?: number;
  Exposed_Infrastructure?: number;
  Max_Wind_Gusts?: number;
  Number_Exposed_Buildings?: number;
  // Wind gust ranges
  'Wind_Gusts_kmph.range_<_83.Buildings'?: number;
  'Wind_Gusts_kmph.range_<_83.Population'?: number;
  'Wind_Gusts_kmph.range_<_83.Total_Loss'?: number;
  'Wind_Gusts_kmph.range_83_125.Buildings'?: number;
  'Wind_Gusts_kmph.range_83_125.Population'?: number;
  'Wind_Gusts_kmph.range_83_125.Total_Loss'?: number;
  'Wind_Gusts_kmph.range_125_164.Buildings'?: number;
  'Wind_Gusts_kmph.range_125_164.Population'?: number;
  'Wind_Gusts_kmph.range_125_164.Total_Loss'?: number;
  'Wind_Gusts_kmph.range_164_224.Buildings'?: number;
  'Wind_Gusts_kmph.range_164_224.Population'?: number;
  'Wind_Gusts_kmph.range_164_224.Total_Loss'?: number;
  'Wind_Gusts_kmph.range_224_280.Buildings'?: number;
  'Wind_Gusts_kmph.range_224_280.Population'?: number;
  'Wind_Gusts_kmph.range_224_280.Total_Loss'?: number;
  'Wind_Gusts_kmph.range_280_+.Buildings'?: number;
  'Wind_Gusts_kmph.range_280_+.Population'?: number;
  'Wind_Gusts_kmph.range_280_+.Total_Loss'?: number;
}

/**
 * Regional summary by sector data structure from CSV files
 */
export interface RegionalSummaryBySector {
  Region: string;
  Sector: string;
  Total_Loss: number;
  Number_Exposed_Buildings?: number;
  Total_Wind_Loss?: number;
  Total_Fluvial_Loss?: number;
  Total_Coastal_Loss?: number;
  Population_Exposed?: number;
}

/**
 * Aggregated event data grouped by region/district/national level
 */
export interface AggregatedEventData {
  id: string;
  name: string;
  totalEvents: number;
  totalAffectedPopulation: number;
  totalEconomicDamage: number;
}
