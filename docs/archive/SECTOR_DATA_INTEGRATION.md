# Regional Impacts by Sector Integration

## Overview
The application now uses `regional-impacts-by-sector.geojson` to display detailed sector-level damage breakdowns when users click on regions in the map.

## What Changed

### 1. Data Loading
- Added `loadRegionalImpactsBySector()` function in `/src/utils/realDataLoader.ts`
- Loads `/public/regional-impacts-by-sector.geojson` alongside the main regional impacts data

### 2. Map Visualization
Updated `/src/components/RegionalImpactsLayer.tsx` to:
- Load both `regional-impacts.geojson` and `regional-impacts-by-sector.geojson`
- Create a lookup map of sector data indexed by region name
- Enhanced popups to show sector-specific loss breakdowns

### 3. Data Structure
The sector-specific GeoJSON contains detailed metrics per region:

**Sectors included:**
- Education
- Infrastructure
- Productive
- Public
- Residential
- Other

**Metrics per sector:**
- Loss (total)
- Wind_Loss
- Fluvial_Loss
- Coastal_Loss
- Exposed_Value
- Total_Value
- Number_Exposed_Buildings
- Number_Damaged_Buildings
- Total_Number_Buildings
- Building_Loss
- Exposed_Building_Value
- Total_Building_Value

## User Experience

When users click on a colored region on the map, they now see:
1. **Region name**
2. **Total Loss** (aggregate)
3. **Buildings Damaged**
4. **Population Affected**
5. **Max Wind Gusts**
6. **Sector Breakdown** (NEW):
   - Lists each sector with losses > $0
   - Shows dollar amounts for Education, Infrastructure, Productive, Public, Residential, and Other sectors

## Technical Notes

- The sector data is matched to regions by the `Region` property
- Only sectors with losses > $0 are displayed in the popup
- The sector data is cached in memory during the map session for fast lookups
- Gracefully handles missing sector data (won't break if file fails to load)

## Files Modified

1. `/src/utils/realDataLoader.ts` - Added `loadRegionalImpactsBySector()` function
2. `/src/components/RegionalImpactsLayer.tsx` - Enhanced with sector data loading and display

## Example Output

When clicking on "Central Malekula" region, the popup now shows:

```
Central Malekula
Total Loss: $2,776,964
Buildings Damaged: 2,116
Population Affected: 6,249
Max Wind Gusts: 171 km/h

Sector Breakdown:
• Education: $62,519
• Infrastructure: $18,940
• Productive: $214,212
• Public: $88,843
• Residential: $1,634,901
• Other: $757,559
```

This provides much more actionable insight into which sectors are most impacted in each region!
