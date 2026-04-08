# Vanuatu Hazards & THREDDS Integration

This document describes the Vanuatu-specific hazard data and THREDDS server integration implemented in the Climate Risk Dashboard.

## 🌋 Vanuatu-Specific Hazards

The application now includes accurate hazard types for Vanuatu:

### Primary Hazards

1. **Tropical Cyclone** 🌀
   - Color: Red (#DC2626)
   - Most significant hazard for Vanuatu
   - Season: November to April

2. **Flood** 🌊
   - Color: Blue (#2563EB)
   - Associated with cyclones and heavy rainfall

3. **Volcanic Activity** 🌋
   - Color: Orange (#EA580C)
   - Multiple active volcanoes (Yasur, Ambrym, etc.)

4. **Earthquake** 📍
   - Color: Purple (#7C3AED)
   - Located on Pacific Ring of Fire

5. **Tsunami** 〰️
   - Color: Cyan (#0891B2)
   - Coastal hazard risk

6. **Landslide** ⛰️
   - Color: Brown (#92400E)
   - Triggered by rainfall and earthquakes

7. **Drought** ☀️
   - Color: Amber (#D97706)
   - Less frequent but impactful

### Affected Sectors

- 🌾 Agriculture
- 🏗️ Infrastructure
- 🏘️ Housing
- 🏥 Health
- 🎓 Education
- ✈️ Tourism
- 🐟 Fisheries
- ⚡ Energy

### Geographic Coverage

The data includes Vanuatu's 6 provinces:
- **Shefa** (includes capital Port Vila on Efate)
- **Sanma** (includes Santo)
- **Penama** (Pentecost, Ambae, Maewo)
- **Malampa** (Malekula, Ambrym, Paama)
- **Tafea** (includes Tanna)
- **Torba** (Torres and Banks Islands)

## 🌐 THREDDS Data Integration

### Overview

The THREDDS (Thematic Real-time Environmental Distributed Data Services) integration allows fetching real hazard data from the Pacific Ocean Portal.

**Server URL**: https://gemthreddshpc.spc.int/thredds

### File Structure

```
src/
├── data/
│   ├── vanuatuHazards.ts      # Hazard definitions for Vanuatu
│   └── mockData.ts             # Updated with Vanuatu hazards
├── utils/
│   ├── threddsLoader.ts        # Core THREDDS data fetching utilities
│   └── threddsDemo.ts          # Usage examples
└── components/
    └── THREDDSBrowser.tsx      # UI component for browsing THREDDS data
```

### Available Functions

#### 1. Fetch Catalog

```typescript
import { fetchVanuatuTCLolaCatalog } from '@/utils/threddsLoader';

const catalog = await fetchVanuatuTCLolaCatalog();
console.log(catalog.datasets); // Array of available datasets
```

#### 2. Load Cyclone Track Data

```typescript
import { fetchCycloneTrack } from '@/utils/threddsLoader';

const trackData = await fetchCycloneTrack(
  "VU", 
  "20231020T000000Z_Official_Forecast_Track_2324_01F_Lola.csv"
);
// Returns GeoJSON FeatureCollection
```

#### 3. Build File URLs

```typescript
import { buildFileUrl } from '@/utils/threddsLoader';

const url = buildFileUrl("VU", "TC/Lola", "VU_merged.nc");
// Direct download URL for the file
```

#### 4. Create WMS Layer URLs

```typescript
import { buildWMSUrl } from '@/utils/threddsLoader';

const wmsUrl = buildWMSUrl(
  "VU",              // Country code
  "TC/Lola",         // Hazard path
  "VU_merged.nc",    // File name
  "wind_speed",      // Layer/variable name
  [166.5, -20.5, 170.5, -13.0], // Bounding box [minLon, minLat, maxLon, maxLat]
  800,               // Width
  600                // Height
);
// Returns WMS GetMap URL for map display
```

### Data Types Available

1. **NetCDF (.nc)** - Gridded hazard data
   - VU_merged.nc
   - local_wind.nc
   - Pluvial-Fluvial_TC_LolaSouthSanto_hmax_UTM.nc

2. **GeoTIFF (.tif)** - Raster images
   - _merged.tif
   - local_wind.tif
   - Pluvial-Fluvial_TC_LolaSouthSanto_hmax_UTM.tif

3. **CSV** - Cyclone forecast tracks
   - 20231020T000000Z_Official_Forecast_Track_2324_01F_Lola.csv
   - 20231021T180000Z_Official_Forecast_Track_2324_01F_Lola.csv
   - etc.

### THREDDS Browser Component

A ready-to-use UI component for browsing and downloading THREDDS data:

```typescript
import THREDDSBrowser from '@/components/THREDDSBrowser';

export default function DataPage() {
  return (
    <div className="p-6">
      <THREDDSBrowser />
    </div>
  );
}
```

Features:
- Lists all datasets from TC Lola catalog
- Shows file types, sizes, and last modified dates
- Download buttons for each file
- Auto-loads cyclone track data (CSV files)
- Real-time loading states and error handling

## 🔄 Updated Mock Data

The monthly damage data has been updated to reflect Vanuatu-specific hazards:

```typescript
// Before
{ month: "Jan", flood: 12.5, drought: 8.3, cyclone: 15.2, ... }

// After (Vanuatu-specific)
{ month: "Jan", "tropical-cyclone": 45.2, flood: 12.5, volcanic: 8.3, earthquake: 15.2, ... }
```

Key changes:
- `cyclone` → `tropical-cyclone` (more specific)
- Added `volcanic`, `earthquake`, `tsunami` data
- Higher values for tropical cyclones (primary hazard)
- Removed `heatwave` (less relevant for Vanuatu)

## 📊 Integration Examples

### Example 1: Load Real Cyclone Data in a Component

```typescript
"use client";

import { useEffect, useState } from 'react';
import { fetchCycloneTrack } from '@/utils/threddsLoader';
import { CycloneTrack } from '@/types/thredds';

export default function CycloneMap() {
  const [track, setTrack] = useState<CycloneTrack | null>(null);
  
  useEffect(() => {
    async function loadTrack() {
      const data = await fetchCycloneTrack(
        "VU",
        "20231020T000000Z_Official_Forecast_Track_2324_01F_Lola.csv"
      );
      setTrack(data);
    }
    loadTrack();
  }, []);
  
  if (!track) return <div>Loading...</div>;
  
  return (
    <div>
      <h2>TC Lola Track</h2>
      <p>Points: {track.features[0]?.geometry?.coordinates?.length}</p>
      {/* Render on map */}
    </div>
  );
}
```

### Example 2: Display WMS Layer on MapLibre

```typescript
import maplibregl from 'maplibre-gl';
import { buildWMSUrl } from '@/utils/threddsLoader';

// In your map initialization
const wmsUrl = buildWMSUrl(
  "VU",
  "TC/Lola",
  "local_wind.nc",
  "wind_speed",
  [166.5, -20.5, 170.5, -13.0]
);

map.addLayer({
  id: 'wind-layer',
  type: 'raster',
  source: {
    type: 'raster',
    tiles: [wmsUrl],
    tileSize: 256
  },
  paint: {
    'raster-opacity': 0.7
  }
});
```

### Example 3: List All Available Datasets

```typescript
import { fetchVanuatuTCLolaCatalog } from '@/utils/threddsLoader';

async function listDatasets() {
  const catalog = await fetchVanuatuTCLolaCatalog();
  
  const netcdfFiles = catalog.datasets.filter(d => d.type === 'nc');
  const geotiffFiles = catalog.datasets.filter(d => d.type === 'tif');
  const csvFiles = catalog.datasets.filter(d => d.type === 'csv');
  
  return { netcdfFiles, geotiffFiles, csvFiles };
}
```

## 🚀 Next Steps

### Recommended Enhancements

1. **Integrate WMS layers into MapView component**
   - Display real-time wind speed data
   - Show flood extent maps
   - Overlay volcanic ash dispersion

2. **Parse CSV track data properly**
   - Current implementation is basic
   - Need to handle actual CSV structure from THREDDS
   - Add timestamps and intensity values

3. **Add NetCDF parsing**
   - Use libraries like `netcdfjs` or `geotiff.js`
   - Extract actual values from gridded data
   - Create interactive overlays

4. **Create data caching**
   - Cache THREDDS responses
   - Implement service worker for offline access
   - Add local storage for frequently accessed data

5. **Add data validation**
   - Verify downloaded data integrity
   - Handle corrupted or missing files
   - Show data quality indicators

6. **Expand to other hazards**
   - Volcanic eruption data
   - Earthquake intensity maps
   - Tsunami inundation zones

## 📝 Configuration

### THREDDS Server Configuration

Update `src/types/thredds.ts` to modify server settings:

```typescript
export const THREDDS_CONFIG: THREDDSDataSource = {
  baseUrl: "https://gemthreddshpc.spc.int/thredds",
  hazardPath: "/POP/Partner2/case_study2/hazard",
  riskPath: "/POP/Partner2/case_study2/pdie_ini",
};
```

### Available Countries

The loader supports multiple Pacific nations:
- **VU**: Vanuatu
- **WS**: Samoa
- **TO**: Tonga
- **CK**: Cook Islands

## 🐛 Troubleshooting

### CORS Issues

If you encounter CORS errors when fetching THREDDS data:

```typescript
// Add proxy in next.config.ts
module.exports = {
  async rewrites() {
    return [
      {
        source: '/api/thredds/:path*',
        destination: 'https://gemthreddshpc.spc.int/thredds/:path*',
      },
    ];
  },
};
```

### File Not Found

Verify the file path structure:
```
/thredds/fileServer/POP/Partner2/case_study2/hazard/vu_hazard/TC/Lola/filename.nc
```

### WMS Layer Not Displaying

- Check if the NetCDF file has the correct variable name
- Verify the bounding box coordinates
- Ensure CRS is EPSG:4326

## 📚 Resources

- [THREDDS Documentation](https://www.unidata.ucar.edu/software/tds/)
- [Pacific Ocean Portal](https://www.pacificoceanportal.org/)
- [Vanuatu Meteorology and Geo-Hazards Department](http://www.vmgd.gov.vu/)
- [WMS Specification](https://www.ogc.org/standards/wms)

## ✅ Summary

✓ Vanuatu-specific hazards implemented (7 types)  
✓ 8 affected sectors defined  
✓ Geographic coverage (6 provinces, 18+ districts)  
✓ THREDDS data loader utility created  
✓ UI component for browsing THREDDS data  
✓ Mock data updated with Vanuatu hazards  
✓ Example code and documentation provided  
✓ Ready for real-time data integration  
