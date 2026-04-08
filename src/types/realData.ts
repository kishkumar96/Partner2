/**
 * Type definitions for real PDIE data structures
 *
 * These types provide compile-time safety for data loaded from CSV/GeoJSON files.
 * Gradually expand as more specific structure is needed.
 */

/**
 * Regional Summary Row (from regional-summary.csv)
 */
export interface RegionalSummaryRow {
  Region_ID?: string;
  Region: string;
  Total_Population: string | number;
  Total_Loss: string | number;
  Total_Buildings: string | number;
  Max_Wind_Gusts?: string | number;
  [key: string]: any; // Allow additional fields
}

/**
 * Regional Summary by Sector (from regional-summary-by-sector.csv)
 */
export interface RegionalSummaryBySectorRow {
  Region: string;
  Sector: string;
  Total_Loss: string | number;
  Building_Count: string | number;
  [key: string]: any;
}

/**
 * Impact by Asset Type (from impact-by-asset-type.csv)
 */
export interface ImpactByAssetTypeRow {
  Asset_Type: string;
  Total_Loss: string | number;
  Building_Count: string | number;
  Average_Loss: string | number;
  [key: string]: any;
}

/**
 * Impact by Sector (from impact-by-sector.csv)
 */
export interface ImpactBySectorRow {
  Sector: string;
  Total_Loss: string | number;
  Building_Count: string | number;
  Percentage: string | number;
  [key: string]: any;
}

/**
 * National Summary (from national-summary.csv)
 */
export interface NationalSummaryRow {
  Country: string;
  Total_Loss: string | number;
  Total_Buildings: string | number;
  Total_Population: string | number;
  Average_Loss_Per_Building: string | number;
  [key: string]: any;
}

/**
 * Building Properties (from damaged-buildings.geojson)
 */
export interface BuildingProperties {
  Wind_Loss: number;
  Exposure: number;
  Damage_Ratio: number;
  Building_Type?: string;
  BTypeCat?: string;
  Occupancy?: string;
  [key: string]: any;
}

/**
 * Road Properties (from damaged-roads.geojson)
 */
export interface RoadProperties {
  road_name?: string;
  Total_Loss: number;
  road_type?: string;
  // Legacy properties (may not be present in database)
  Wind_Loss?: number;
  Exposure?: number;
  Damage_Ratio?: number;
  Road_Type?: string;
  Surface?: string;
  [key: string]: any;
}

/**
 * Cyclone Forecast Point
 */
export interface CycloneForecastPoint {
  timestamp: string;
  lat: number;
  lng: number;
  windSpeed: number;
  category: string;
  [key: string]: any;
}

/**
 * Asset Exposure Statistics
 */
export interface AssetExposureStats {
  criticalInfrastructure: {
    healthFacilities: number;
    schools: number;
    evacuationCenters: number;
  };
  windExposure: {
    extreme: number;
    high: number;
    moderate: number;
    low: number;
  };
}

/**
 * Asset Exposure Data
 */
export interface AssetExposureData {
  assets: Array<{
    id: string;
    type: string;
    windGust: number;
    exposure: number;
    loss: number;
    [key: string]: any;
  }>;
  stats: AssetExposureStats;
}

/**
 * Complete Real Data Load Result
 */
export interface RealDataLoadResult {
  cycloneTrack: GeoJSON.FeatureCollection | null;
  events: any[]; // Will use Event type from main types
  exposureData: any[];
  economicDamageData: any[]; // Deprecated: kept for backward compatibility
  sectorEconomicData: any[]; // Sector-level economic damage
  assetEconomicData: any[]; // Asset-level economic damage
  assetExposureData: AssetExposureData | null;
  impactByAsset: ImpactByAssetTypeRow[];
  impactBySector: ImpactBySectorRow[];
  nationalSummary: NationalSummaryRow[];
  damagedBuildings: GeoJSON.FeatureCollection<GeoJSON.Point, BuildingProperties> | null;
  damagedRoads: GeoJSON.FeatureCollection<GeoJSON.LineString, RoadProperties> | null;
  regionalImpacts: GeoJSON.FeatureCollection | null;
  exposureByCluster: GeoJSON.FeatureCollection | null;
  regionalSummary: RegionalSummaryRow[];
  regionalSummaryBySector: RegionalSummaryBySectorRow[];
  cycloneForecast: CycloneForecastPoint[] | null;
  regionalImpactsData?: any[]; // RegionalImpact[] - structured impact data per region
  sectorSpecificEvents?: any[]; // Event[] - sector-specific events for filtering
  dataSourceInfo?: {
    countryCode: string;
    cycloneTrackSource: 'partner_api' | 'local_files';
    eventMetadataSource: 'partner_api' | 'local_files';
  };
}
