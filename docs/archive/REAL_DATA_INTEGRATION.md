# Real Data Integration - Climate Risk Dashboard

## Overview
This document explains how real cyclone data and impact assessments from Vanuatu have been integrated into the Climate Risk Dashboard.

## Data Files

All data files are stored in the `/public` directory for easy access by the frontend:

### GeoJSON Files
- **cyclone-track.geojson** - Cyclone trajectory data showing the path of the tropical cyclone
- **regional-impacts.geojson** - Regional impact data with building damage, population exposure, and economic losses by administrative region
- **exposure-by-cluster.geojson** - Exposure analysis grouped by geographic clusters

### CSV Files
- **national-summary.csv** - National-level summary statistics including:
  - Wind exposure and gusts
  - Building damage counts and losses
  - Population exposure
  - Infrastructure and crop damage
  
- **regional-summary.csv** - Regional breakdowns of impacts

- **impact-by-asset-type.csv** - Economic losses categorized by asset type:
  - Water infrastructure
  - Schools
  - Airports
  - Ports
  - etc.

- **impact-by-sector.csv** - Economic losses categorized by sector:
  - Education
  - Infrastructure
  - Productive (agriculture, business)
  - Other

## Implementation

### 1. Data Loader Utility (`src/utils/realDataLoader.ts`)

The data loader provides functions to:
- Load all GeoJSON files from the public directory
- Load and parse CSV files
- Convert regional impact GeoJSON data to Event objects for the dashboard
- Provide a single `loadAllRealData()` function that loads everything

Key features:
```typescript
// Load all data at once
const data = await loadAllRealData();

// Access specific data
const { events, cycloneTrack, regionalImpacts, impactByAsset } = data;
```

### 2. Main Page Integration (`src/app/page.tsx`)

The main page now:
- Loads real data on component mount using `useEffect`
- Stores data in React state
- Shows loading indicator in the header
- Displays the count of loaded events

```typescript
useEffect(() => {
  async function loadData() {
    const realData = await loadAllRealData();
    setEvents(realData.events);
    setExposureData([realData.exposureByCluster]);
    setEconomicDamageData(realData.impactByAsset);
  }
  loadData();
}, []);
```

### 3. Map Visualization

#### Regional Impacts Layer (`src/components/RegionalImpactsLayer.tsx`)
A dedicated component that:
- Loads `regional-impacts.geojson`
- Displays regions as colored polygons based on total economic loss
- Uses a color gradient from light yellow (low damage) to dark red (high damage)
- Shows interactive popups with damage statistics when regions are clicked

Color scale:
- $0 → Light yellow (#ffffcc)
- $1M → Light orange (#ffeda0)
- $5M → Orange (#fed976)
- $10M → Darker orange (#feb24c)
- $20M → Orange-red (#fd8d3c)
- $50M → Red-orange (#fc4e2a)
- $100M → Red (#e31a1c)
- $200M+ → Dark red (#bd0026)

#### Cyclone Track Layer (in `RealDataLayers.tsx`)
- Displays the cyclone trajectory as a purple line
- Shows cyclone position points along the track
- Automatically loads from `/cyclone-track.geojson`

### 4. Data Structure

#### Event Object
Each regional impact is converted to an Event object:

```typescript
{
  id: "VU04009",                           // Region ID
  name: "Tropical Cyclone Impact - ...",   // Event name
  date: "2026-01-30",                       // Date
  lat: -16.42,                              // Latitude
  lng: 167.76,                              // Longitude
  hazardId: "tropical-cyclone",             // Hazard type
  severity: 5,                              // 1-5 based on wind speed
  affectedPopulation: 89139,                // People affected
  economicDamage: 231736853,                // Total loss in USD
  district: "South East Malekula",          // District name
  description: "Wind gusts: 160-244 km/h..." // Detailed description
}
```

## Usage

### Viewing Real Data

1. The application loads real data automatically on startup
2. The header shows "Loading real data..." during load, then displays "{X} events loaded"
3. The map displays:
   - **Purple line**: Cyclone track path
   - **Colored regions**: Regional impacts (click for details)
   - **Interactive popups**: Show damage statistics

### Filtering and Analysis

All standard dashboard features work with the real data:
- **Filter Panel**: Filter events by hazard, sector, date, etc.
- **Summary Panel**: View aggregated statistics and charts
- **Bottom Tabs**: Access detailed tables and analysis
- **Export**: Download data in various formats

## Data Updates

To update the data:

1. Place new data files in the `/public` directory
2. Ensure file names match:
   - `cyclone-track.geojson`
   - `regional-impacts.geojson`
   - `national-summary.csv`
   - etc.
3. Restart the development server or trigger a page reload

The application will automatically load and display the new data.

## API

### Real Data Loader Functions

```typescript
// Load cyclone track
const track = await loadCycloneTrackData();

// Load regional impacts
const impacts = await loadRegionalImpacts();

// Load national summary
const summary = await loadNationalSummary();

// Load all data at once
const allData = await loadAllRealData();
```

### Data Types

All CSV data is parsed into arrays of objects with string keys and string/number values:

```typescript
Array<Record<string, string | number>>
```

## Technical Notes

- **CSV Parsing**: Automatic type detection converts numeric strings to numbers
- **GeoJSON**: Standard GeoJSON format, compatible with MapLibre GL JS
- **Performance**: All data files are loaded in parallel using `Promise.all()`
- **Error Handling**: Graceful fallbacks if data files are missing or malformed
- **Caching**: Browser caches loaded data files (use hard refresh to clear)

## Future Enhancements

Possible improvements:
- Add date-based filtering for multiple cyclone events
- Implement time-series animation of cyclone movement
- Add vulnerability and exposure layers
- Integrate with live THREDDS data feeds
- Add data validation and quality checks
- Implement incremental data loading for large datasets
