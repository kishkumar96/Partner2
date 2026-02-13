/**
 * Example/Demo: Using THREDDS Data Loader
 * 
 * This file demonstrates how to fetch and use real data from the THREDDS server
 * for Vanuatu hazards. You can integrate these functions into your components.
 */

import { 
  fetchVanuatuTCLolaCatalog,
  fetchCycloneTrack,
  buildFileUrl,
  buildWMSUrl,
  AVAILABLE_HAZARDS 
} from "@/utils/threddsLoader";
import { CountryCode } from "@/types/thredds";

/**
 * Example 1: Fetch TC Lola catalog
 */
export async function loadTCLolaCatalog() {
  console.log("Fetching TC Lola catalog from THREDDS...");
  
  const catalog = await fetchVanuatuTCLolaCatalog();
  
  console.log(`Found ${catalog.datasets.length} datasets:`);
  catalog.datasets.forEach(dataset => {
    console.log(`- ${dataset.name} (${dataset.type}) - ${dataset.size}`);
  });
  
  return catalog;
}

/**
 * Example 2: Load cyclone track from CSV
 */
export async function loadCycloneTrackData() {
  console.log("Loading TC Lola track data...");
  
  const trackFilename = "20231020T000000Z_Official_Forecast_Track_2324_01F_Lola.csv";
  const trackData = await fetchCycloneTrack("VU", trackFilename);
  
  if (trackData) {
    console.log("Track loaded:", trackData);
    console.log(`Track has ${trackData.features.length} features`);
  } else {
    console.log("Failed to load track data");
  }
  
  return trackData;
}

/**
 * Example 3: Get direct file URLs
 */
export function getDemoFileUrls() {
  const countryCode: CountryCode = "VU";
  const hazardType = "TC/Lola";
  
  // NetCDF file URL
  const ncFileUrl = buildFileUrl(countryCode, hazardType, "VU_merged.nc");
  console.log("NetCDF file URL:", ncFileUrl);
  
  // GeoTIFF file URL
  const tifFileUrl = buildFileUrl(countryCode, hazardType, "_merged.tif");
  console.log("GeoTIFF file URL:", tifFileUrl);
  
  // Wind data URL
  const windFileUrl = buildFileUrl(countryCode, hazardType, "local_wind.nc");
  console.log("Wind data URL:", windFileUrl);
  
  return { ncFileUrl, tifFileUrl, windFileUrl };
}

/**
 * Example 4: Generate WMS layer URL for map display
 */
export function getWMSLayerUrl() {
  const countryCode: CountryCode = "VU";
  const hazardType = "TC/Lola";
  const filename = "VU_merged.nc";
  const layer = "wind_speed"; // Adjust based on actual variable name in NetCDF
  
  // Vanuatu bounding box (approximate)
  const bbox: [number, number, number, number] = [166.5, -20.5, 170.5, -13.0];
  
  const wmsUrl = buildWMSUrl(countryCode, hazardType, filename, layer, bbox, 800, 600);
  console.log("WMS Layer URL:", wmsUrl);
  
  return wmsUrl;
}

/**
 * Example 5: List all available hazards for Vanuatu
 */
export function listAvailableHazards() {
  const vanuatuHazards = AVAILABLE_HAZARDS["VU"];
  console.log("Available hazards for Vanuatu:", vanuatuHazards);
  
  return vanuatuHazards;
}

/**
 * Main demo function - run all examples
 */
export async function runTHREDDSDemo() {
  console.log("=== THREDDS Data Loader Demo ===\n");
  
  // List available hazards
  console.log("\n1. Available Hazards:");
  listAvailableHazards();
  
  // Get file URLs
  console.log("\n2. File URLs:");
  getDemoFileUrls();
  
  // Get WMS layer
  console.log("\n3. WMS Layer:");
  getWMSLayerUrl();
  
  // Load catalog
  console.log("\n4. Loading Catalog:");
  try {
    await loadTCLolaCatalog();
  } catch (error) {
    console.error("Error loading catalog:", error);
  }
  
  // Load track data
  console.log("\n5. Loading Track Data:");
  try {
    await loadCycloneTrackData();
  } catch (error) {
    console.error("Error loading track data:", error);
  }
  
  console.log("\n=== Demo Complete ===");
}

// Usage in a React component:
/*
import { useEffect, useState } from 'react';
import { fetchVanuatuTCLolaCatalog, fetchCycloneTrack } from '@/utils/threddsLoader';

export function MyComponent() {
  const [catalog, setCatalog] = useState(null);
  const [trackData, setTrackData] = useState(null);
  
  useEffect(() => {
    async function loadData() {
      // Load catalog
      const cat = await fetchVanuatuTCLolaCatalog();
      setCatalog(cat);
      
      // Load cyclone track
      const track = await fetchCycloneTrack("VU", "20231020T000000Z_Official_Forecast_Track_2324_01F_Lola.csv");
      setTrackData(track);
    }
    
    loadData();
  }, []);
  
  return (
    <div>
      <h2>THREDDS Data</h2>
      {catalog && <p>Found {catalog.datasets.length} datasets</p>}
      {trackData && <p>Cyclone track loaded</p>}
    </div>
  );
}
*/
