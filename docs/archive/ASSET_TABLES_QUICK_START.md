# Quick Start Guide: Asset Inspection Tables

## 🎯 For End Users

### Accessing the Tables
1. Load the Pacific Disaster Platform
2. Ensure building/road damage data is loaded (automatic for Vanuatu TC Lola)
3. Look for the bottom panel tabs
4. Click the **🏢 Buildings** or **🚧 Roads** tab

### Using the Buildings Table

#### Basic Navigation
- **Click any row** → Automatically zooms map to that building
- **Click "Zoom" button** → Same as clicking the row
- **Sort columns** → Click column headers (Loss, Type, Region, etc.)
  - First click: Sort descending
  - Second click: Sort ascending  
  - Third click: Remove sort

#### Search & Filter
- **Search bar**: Type to find buildings by ID, region, or type
- **Region dropdown**: Filter by specific district/province
- **Clear button**: Reset all filters at once

#### Understanding the Display
| Column | Description |
|--------|-------------|
| **Loss (USD)** | Economic damage estimate (sortable) |
| **Damage Level** | Visual indicator with color:<br>🟡 Minimal/Minor (< $10K)<br>🟠 Moderate ($10K-$50K)<br>🟠 Substantial ($50K-$100K)<br>🔴 Severe ($100K-$500K)<br>🔴 Catastrophic (> $500K) |
| **Type** | Building classification (Residential, Commercial, etc.) |
| **Occupancy** | Usage type |
| **Region** | District or province name |
| **Actions** | Zoom button |

#### Pagination
- Bottom of table shows current page and total rows
- **Rows per page**: Choose 25, 50, or 100
- **Prev/Next**: Navigate between pages
- Shows: "1-50 of 1,234" (example)

### Using the Roads Table

#### Similar to Buildings, Plus:
- **Damage Level Visualization**: Line thickness = severity
  - Thin yellow line: Light damage (< $5K)
  - Medium orange line: Moderate ($5K-$25K)
  - Thick orange line: Heavy ($25K-$75K)
  - Very thick red line: Severe (> $75K)

#### Road-Specific Columns
| Column | Description |
|--------|-------------|
| **Road Type** | Classification (residential, path, highway, etc.) |
| **Surface** | Pavement type (paved, unpaved, gravel, etc.) |
| **Region** | District or province name |

### Pro Tips 💡

1. **Quick Damage Assessment**
   - Sort by Loss (descending) to see most expensive damage first
   - Focus response on catastrophic/severe buildings
   
2. **Regional Focus**
   - Filter by region to assess specific districts
   - Compare damage patterns across regions
   
3. **Asset Type Priority**
   - Filter by Building Type to find schools, hospitals
   - Use Roads table for infrastructure planning
   
4. **Mobile Usage**
   - Tables are fully responsive
   - Swipe to scroll horizontally on mobile
   - Pagination reduces data load

5. **Export Data** (Manual)
   - Select table rows (click + drag)
   - Copy (Ctrl+C / Cmd+C)
   - Paste into Excel or Google Sheets

## 🛠️ For Developers

### Adding to Your Application

#### 1. Install Dependencies
Already included in package.json:
- lucide-react (icons)
- TypeScript
- React 18+

#### 2. Import Components
```typescript
import BuildingsTable from '@/components/BuildingsTable';
import RoadsTable from '@/components/RoadsTable';
```

#### 3. Prepare Data
```typescript
// GeoJSON FeatureCollection format
const damagedBuildings: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        Wind_Loss: 25000,
        Exposure: 150000,
        Damage_Ratio: 0.17,
        BTypeCat: "Residential",
        Occupancy: "Single Family",
        Admin2_Region: "Luganville"
      }
    },
    // ... more features
  ]
};
```

#### 4. Create Zoom Callback
```typescript
import maplibregl from 'maplibre-gl';

const handleZoomToAsset = useCallback(
  (coordinates: [number, number], zoom: number = 16) => {
    if (!mapInstance) return;
    
    mapInstance.flyTo({
      center: coordinates,
      zoom: zoom,
      duration: 1200,
      essential: true,
    });
  },
  [mapInstance]
);
```

#### 5. Render Table
```typescript
<BuildingsTable
  data={damagedBuildings}
  onZoom={handleZoomToAsset}
  maxHeight="600px"  // Optional, defaults to 600px
/>
```

### Customization Options

#### Modify Damage Thresholds
Edit `src/hooks/useAssetTableData.ts`:
```typescript
// Building damage levels
if (loss >= 500000) damageLevel = 'catastrophic';
else if (loss >= 100000) damageLevel = 'severe';
// ... adjust thresholds as needed
```

#### Add New Columns
Edit table component (e.g., `BuildingsTable.tsx`):
```typescript
// In thead:
<th>New Column</th>

// In tbody map:
<td>{building.newProperty}</td>
```

#### Change Page Size Defaults
Edit component:
```typescript
const { ... } = useAssetTableData<BuildingAsset>(
  buildings, 
  100  // Change from 50 to 100
);
```

#### Customize Colors
Edit `src/theme/colors.ts`:
```typescript
export const BUILDING_DAMAGE_COLORS = {
  minimal: '#YOUR_COLOR',
  // ... adjust as needed
};
```

### Architecture Overview

```
┌─────────────────────────────────────────┐
│         page.tsx (Orchestration)        │
│  - Manages map instance                 │
│  - Loads GeoJSON data                   │
│  - Provides zoom callback               │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│       BottomTabs (Tab Container)        │
│  - Hosts multiple data views            │
│  - Passes props to table components     │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│  BuildingsTable / RoadsTable (UI)       │
│  - Renders table with controls          │
│  - Handles user interactions            │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│  useAssetTableData (Business Logic)     │
│  - Transforms GeoJSON → typed arrays    │
│  - Manages filtering, sorting, paging   │
│  - Provides computed metadata           │
└─────────────────────────────────────────┘
```

### Testing

#### Manual Test Cases
✅ **Data Loading**
- [ ] Tables show "No data" message when data is null
- [ ] Tables populate when GeoJSON loads
- [ ] Correct row counts displayed

✅ **Search & Filter**
- [ ] Search filters by ID, region, type
- [ ] Region dropdown filters correctly
- [ ] Clear button resets filters
- [ ] Filtered count updates in UI

✅ **Sorting**
- [ ] Click column header to sort
- [ ] Toggle between asc/desc/none
- [ ] Sort indicator shows correct direction

✅ **Pagination**
- [ ] Page size selector works (25/50/100)
- [ ] Prev/Next buttons navigate correctly
- [ ] Page info displays correctly
- [ ] Buttons disable at boundaries

✅ **Zoom Functionality**
- [ ] Click row zooms to asset
- [ ] Zoom button zooms to asset
- [ ] Map animates smoothly
- [ ] Correct zoom level applied

✅ **Responsive Design**
- [ ] Tables work on mobile
- [ ] Horizontal scroll on small screens
- [ ] Touch interactions work
- [ ] Text remains readable

### Troubleshooting

#### Table Shows "No Data"
**Cause**: GeoJSON not loaded or empty
**Fix**: Check that `damagedBuildings`/`damagedRoads` prop is populated

#### Zoom Not Working
**Cause**: `onZoomToAsset` callback not provided or map not ready
**Fix**: Ensure `mapInstance` is initialized and callback is passed

#### Performance Issues with Large Datasets
**Cause**: Too many rows rendered at once
**Fix**: Reduce page size to 25 or 50 rows

#### Styling Inconsistencies
**Cause**: Tailwind classes not applied
**Fix**: Check that Tailwind config includes component paths

#### TypeScript Errors
**Cause**: Missing type definitions or incorrect props
**Fix**: Ensure all types are imported from `@/types/assetTables`

### API Reference

#### useAssetTableData<T>
```typescript
function useAssetTableData<T extends Asset>(
  rawData: T[] | null,
  initialPageSize?: number
): {
  data: T[];                    // Current page data
  allData: T[];                 // All filtered/sorted data
  totalCount: number;           // Total filtered item count
  sortConfig: SortConfig<T> | null;
  filter: AssetFilter;
  pagination: PaginationState;
  uniqueRegions: string[];
  uniqueDamageLevels: string[];
  handleSort: (key: keyof T) => void;
  handleFilterChange: (filter: Partial<AssetFilter>) => void;
  handlePageChange: (page: number) => void;
  handlePageSizeChange: (size: number) => void;
  resetFilters: () => void;
}
```

#### transformBuildingData
```typescript
function transformBuildingData(
  geojson: GeoJSON.FeatureCollection | null
): BuildingAsset[]
```

#### transformRoadData
```typescript
function transformRoadData(
  geojson: GeoJSON.FeatureCollection | null
): RoadAsset[]
```

---

## 🆘 Support

For issues or questions:
1. Check [ASSET_TABLES_IMPLEMENTATION.md](./ASSET_TABLES_IMPLEMENTATION.md) for detailed docs
2. Review TypeScript types in `src/types/assetTables.ts`
3. Examine hook implementation in `src/hooks/useAssetTableData.ts`
4. Look at example usage in `src/components/BottomTabs.tsx`

## 🎉 Happy Assessing!

These tables are designed to make disaster damage assessment faster, more accurate, and more efficient. Use them to save lives and rebuild communities.
