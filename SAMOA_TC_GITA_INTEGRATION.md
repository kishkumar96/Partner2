# Samoa TC Gita Data Integration

## Overview

Integrated Tropical Cyclone Gita data for Western Samoa (WS) into the Pacific Climate Risk Dashboard. TC Gita impacted Samoa in February 2018, causing significant damage to infrastructure and communities across Savaii and Upolu islands.

## Data Sources

### WMS Hazard Layers
The following WMS layers are available from the THREDDS server at `gemthreddshpc.spc.int`:

1. **TC Gita Merged Hazard**
   - Endpoint: `/POP/Partner2/case_study2/hazard/ws_hazard/TC/Gita/_merged.nc`
   - Layer: `Depth`
   - Bbox: [-173.0, -14.5, -171.0, -13.0]
   - Description: Merged hazard data combining wind and flood impacts

2. **TC Gita Local Wind (Savaii & Upolu)**
   - Endpoint: `/POP/Partner2/case_study2/hazard/ws_hazard/TC/Gita/SA_savaii_upolu_local_wind.nc`
   - Layer: `Depth`
   - Bbox: [-173.0, -14.5, -171.0, -13.0]
   - Style: Blue-Red diverging (div-BuRd)
   - Color Range: 0-50
   - Description: Local wind speed impacts on main islands

### Local Data Files
Created in `/public/samoa/` directory:

1. **Official_Forecast_Track_GITA_SA.csv**
   - Official forecast track from regional meteorological centers
   - Contains 64 forecast points from 2018-02-07 to 2018-02-15
   - Includes pressure, wind speed, category, and uncertainty data
   - Peak intensity: Category 4 cyclone with 125 km/h sustained winds

2. **cyclone-track-gita.geojson**
   - GeoJSON LineString of the actual cyclone path
   - 113 coordinate points tracking the storm from near Samoa westward
   - Used for map visualization and animation

## Implementation Details

### 1. WMS Layer Configuration
Updated `/src/data/realThreddsLayers.ts` with Samoa-specific layers:

```typescript
{
  id: "ws-tc-gita-merged-hazard",
  name: "TC Gita Merged Hazard",
  countryCode: "WS",
  ncFile: "_merged.nc",
  layerName: "Depth",
  hazardType: "cyclone",
  bbox: [-173.0, -14.5, -171.0, -13.0],
}
```

### 2. Data Loader Updates
Modified data loading functions to support country-specific tracks:

- **`loadCycloneTrackData(countryCode)`**: Loads TC Gita track for WS
- **`loadCycloneForecastTrack(countryCode)`**: Loads official forecast data
- **`loadAllRealData(countryCode)`**: Main loader with country support

### 3. Timestamp Configuration
Updated `/src/utils/geotiffLoader.ts`:
```typescript
const outputTimestamps: Record<CountryCode, string[]> = {
  VU: ['2025-01-31T09_41_32'], // TC Lola
  WS: ['2018-02-12T00_00_00'], // TC Gita - February 2018
  TO: [],
  CK: [],
};
```

### 4. Page Integration
Updated `/src/app/page.tsx` to pass country code when loading data:
```typescript
const realData = await loadAllRealData(selectedCountry || undefined);
```

## Cyclone Gita Event Details

### Timeline
- **Formation**: February 7, 2018
- **Peak Intensity**: February 12, 2018 (Category 4)
- **Samoa Impact**: February 10-11, 2018
- **Dissipation**: February 15, 2018

### Meteorological Data
- **Peak Pressure**: 929 hPa
- **Max Sustained Winds**: 125 km/h (Category 4)
- **Max Wind Gusts**: 150 km/h
- **Eye Diameter**: Compact system
- **Track**: Generally westward across the South Pacific

### Impact Areas
- **Primary**: Savaii and Upolu islands (Western Samoa)
- **Secondary**: American Samoa, Tonga
- **Damage**: Infrastructure, buildings, agriculture, coastal areas

## WMS Access Examples

### GetCapabilities Request
```
https://gemthreddshpc.spc.int/thredds/wms/POP/Partner2/case_study2/hazard/ws_hazard/TC/Gita/_merged.nc?service=WMS&version=1.3.0&request=GetCapabilities
```

### GetMap Request (Wind Layer)
```
https://gemthreddshpc.spc.int/thredds/wms/POP/Partner2/case_study2/hazard/ws_hazard/TC/Gita/SA_savaii_upolu_local_wind.nc?
  SERVICE=WMS&
  VERSION=1.3.0&
  REQUEST=GetMap&
  LAYERS=Depth&
  CRS=EPSG:4326&
  BBOX=-14.5,-173.0,-13.0,-171.0&
  WIDTH=1024&
  HEIGHT=1024&
  FORMAT=image/png&
  TRANSPARENT=true&
  STYLES=default-scalar/div-BuRd&
  COLORSCALERANGE=0,50&
  NUMCOLORBANDS=5&
  ABOVEMAXCOLOR=extend&
  BELOWMINCOLOR=extend&
  BGCOLOR=extend&
  LOGSCALE=false
```

## Usage

### Viewing Samoa Data
1. Open the dashboard
2. Click the country selector
3. Choose "🇼🇸 Samoa (Independent State of Samoa)"
4. The map will automatically:
   - Load TC Gita hazard layers
   - Display the cyclone track
   - Show regional impacts
   - Enable cyclone animation with forecast points

### Layer Controls
- **Wind Visualization**: Toggle in layer panel (warm colors: yellow→orange→red)
- **Merged Hazard**: Combined wind and flood impacts
- **Opacity**: Automatically adjusted based on map style (wind vs. loss view)

## Future Enhancements

### Priority 1: PDIE Model Integration
To complete the Samoa implementation, run the PDIE model for TC Gita:

1. **Input Data**: Use TC Gita meteorological data and Samoa exposure database
2. **Generate Outputs**:
   - `national-summary.csv`
   - `regional-summary.csv`
   - `impact-by-sector.csv`
   - `impact-by-asset-type.csv`
   - `exposure-by-cluster.geojson`
   - `regional-impacts.geojson`
   - `regional-impacts-by-sector.geojson`
3. **Upload**: Store in `/public/samoa/` directory
4. **Update Loaders**: Modify data loaders to support country-specific paths

### Priority 2: Enhanced Visualizations
- Add TC Gita-specific color schemes
- Implement comparative analysis (Gita vs. other cyclones)
- Sector-specific impact layersfor Samoa

### Priority 3: Historical Context
- Add historical cyclone database for Samoa
- Multi-event comparison features
- Long-term risk trend analysis

## References

- **THREDDS Server**: `https://gemthreddshpc.spc.int/thredds/`
- **WMS Specification**: OGC WMS 1.3.0
- **Coordinate System**: EPSG:4326 (WGS84)
- **Data Collection**: Pacific Ocean Portal / SPC

## File Locations

```
/public/samoa/
  ├── Official_Forecast_Track_GITA_SA.csv
  └── cyclone-track-gita.geojson

/src/data/
  └── realThreddsLayers.ts (WMS configuration)

/src/utils/
  ├── realDataLoader.ts (country-specific loaders)
  ├── cycloneAnimationLoader.ts (forecast track support)
  └── geotiffLoader.ts (timestamp configuration)

/src/app/
  └── page.tsx (country code integration)
```

## Testing

To verify the integration:

1. **WMS Layers**: Select Samoa → Check map for wind/hazard layers
2. **Cyclone Track**: Verify TC Gita path displays correctly
3. **Animation**: Play cyclone forecast animation
4. **Data Loading**: Check browser console for successful data loads
5. **Switching Countries**: Toggle between VU and WS to verify proper data switching

## Notes

- All WMS requests use EPSG:4326 coordinate system
- BBOX order for WMS 1.3.0: `minLat,minLon,maxLat,maxLon`
- Local files stored for fast loading; WMS used for hazard visualization
- Country code 'WS' refers to Independent State of Samoa (Western Samoa)

---

**Last Updated**: February 15, 2026  
**TC Gita Event Date**: February 2018  
**Data Status**: WMS layers active, PDIE outputs pending
