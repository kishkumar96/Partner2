# Exposure & Economic Tables Critique

## Executive Summary

The Exposure and Economic Damage tables in `BottomTabs.tsx` have **critical data structure issues** that reduce their usefulness and create confusion. Both tables show aggregated/synthetic data rather than granular, actionable information.

---

## 🔴 Exposure Table - Critical Issues

### Current State
```typescript
// convertToExposureData() creates generic entries from regional summary
{
  id: `exposure-${index}`,
  hazardId: 'tropical-cyclone',
  sectorId: 'all', // ❌ HARDCODED - No sector specificity
  population: Number(row.Population_Exposed_To_Any_Hazard) || 0,
  assets: Number(row.Total_Exposed_Value_To_Any_Hazard) || 0,
  infrastructure: Number(row.Exposed_Infrastructure) || 0,
  region: row.Region || 'Unknown', // ❌ NOT USED in table display
}
```

### Problems

#### 1. **No Sector Granularity** ❌
- All records have `sectorId: 'all'`
- Can't filter by sector (Residential, Infrastructure, etc.)
- Defeats the purpose of sector-based analysis

**Impact**: Sector filter appears broken for exposure data

#### 2. **Missing Regional Context** ❌
```tsx
// Table shows only:
<td>Hazard</td>
<td>Sector</td>  // Always shows "all"
<td>Population</td>
<td>Assets at Risk</td>
<td>Infrastructure Units</td>

// Missing:
// - Which region/district?
// - Geographic location?
// - Date of exposure?
```

**Impact**: Can't identify WHERE exposure is occurring

#### 3. **Wrong Data Source** ⚠️
- Uses `regionalSummary` CSV → creates one row per region
- But regional info (`row.Region`) is captured but NOT displayed in table
- User sees generic national aggregates without context

**Expected**: Should show ~66 rows (one per region) or sector×region combinations

**Actual**: Shows ~66 rows but without region names visible

#### 4. **Confusing Column Names** ⚠️
- "Assets at Risk" shows `Total_Exposed_Value_To_Any_Hazard` (USD value)
- "Infrastructure Units" shows `Exposed_Infrastructure` (count or value?)
- No units displayed → ambiguous

#### 5. **No Multi-Hazard Support** ⚠️
- All hardcoded to `tropical-cyclone`
- Can't distinguish wind vs flood vs coastal exposure
- Future-proofing problem

---

## 🔴 Economic Damage Table - Critical Issues

### Current State
```typescript
// convertToEconomicDamageData() creates TWO types of entries:

// Type 1: Sector-based (from impactBySector CSV)
{
  id: 'damage-sector-0',
  hazardId: 'tropical-cyclone',
  sectorId: 'Residential', // ✅ Correct sector
  directLoss: windLoss,
  indirectLoss: fluvialLoss + coastalLoss,
  totalLoss: totalLoss,
  year: 2024,
}

// Type 2: Asset-based (from impactByAssetType CSV)
{
  id: 'damage-asset-0',
  hazardId: 'tropical-cyclone',
  sectorId: 'Infrastructure', // ❌ WRONG - All assets tagged as Infrastructure
  directLoss: windLoss,
  indirectLoss: fluvialLoss + coastalLoss,
  totalLoss: totalLoss,
  year: 2024,
  assetType: 'Road', // Has this field but sector is wrong
}
```

### Problems

#### 1. **Data Duplication & Mixing** ❌
- Combines sector-level AND asset-level data in same table
- Causes double-counting of losses
- Example:
  ```
  Row 1: "Infrastructure" sector → $5M total
  Row 2: "Road" asset (tagged as Infrastructure) → $2M 
  Row 3: "School" asset (tagged as Infrastructure) → $1M
  // Are rows 2+3 part of row 1, or additional?
  ```

**Impact**: Impossible to get accurate totals without domain knowledge

#### 2. **Wrong Sector Assignment for Assets** ❌
```typescript
sectorId: 'Infrastructure', // All asset types get this
assetType: row.Asset || 'Unknown',
```

**Should be**:
- Hospital → Public/Health sector
- School → Education sector  
- Residential building → Residential sector
- Road → Infrastructure sector

**Impact**: Sector filtering shows incorrect data for assets

#### 3. **Hardcoded Year** ⚠️
```typescript
year: 2024, // TC Lola event
```

- TC Lola was actually October 2023
- When adding historical cyclones (2015-2023), all will show 2024
- No way to filter by actual event date

#### 4. **Simplistic Indirect Loss Calculation** ⚠️
```typescript
indirectLoss: Number(row.Total_Fluvial_Loss) + Number(row.Total_Coastal_Loss)
```

- Assumes indirect = fluvial + coastal
- But what about:
  - Business interruption?
  - Supply chain disruption?
  - Displacement costs?
  - Agricultural losses?

**Impact**: Underestimates true indirect economic impact

#### 5. **No Regional Breakdown** ❌
- Economic table shows national aggregates only
- Can't see which regions had highest losses
- Missing spatial dimension for recovery planning

---

## 📊 Recommended Fixes

### Fix 1: Restructure Exposure Data

**Create sector × region exposure matrix**:

```typescript
function convertToExposureData(regionalSummary: any, impactBySector: any): any[] {
  const exposureRecords: any[] = [];
  
  // If we have sector-specific data, use it
  if (impactBySector && Array.isArray(impactBySector)) {
    impactBySector.forEach((row, index) => {
      exposureRecords.push({
        id: `exposure-sector-${index}`,
        hazardId: 'tropical-cyclone',
        sectorId: row.Sector || 'Unknown',
        region: row.Region || 'National', // ADD REGION
        population: Number(row.Population_Exposed) || 0,
        assets: Number(row.Total_Exposed_Value) || 0,
        buildingCount: Number(row.Number_Exposed_Buildings) || 0,
        exposureLevel: calculateExposureLevel(row), // HIGH/MEDIUM/LOW
        hazardIntensity: Number(row.Max_Wind_Gusts) || 0, // ADD INTENSITY
      });
    });
  }
  
  return exposureRecords;
}
```

**Update table to show**:
```tsx
<thead>
  <tr>
    <th>Region</th>
    <th>Sector</th>
    <th>Hazard Type</th>
    <th>Intensity</th>
    <th>Population Exposed</th>
    <th>Buildings Exposed</th>
    <th>Value at Risk</th>
    <th>Exposure Level</th> {/* HIGH/MEDIUM/LOW badge */}
  </tr>
</thead>
```

**Benefits**:
- ✅ Sector filtering works correctly
- ✅ Regional context visible
- ✅ Can identify hotspots
- ✅ Supports prioritization

---

### Fix 2: Separate Economic Tables

**Create TWO distinct tabs**:

#### Tab 1: "Economic Loss by Sector"
```typescript
function convertSectorEconomicData(impactBySector: any): EconomicDamageData[] {
  return impactBySector.map((row, index) => ({
    id: `sector-loss-${index}`,
    region: row.Region || 'National',
    sectorId: row.Sector,
    hazardId: 'tropical-cyclone',
    directLoss: Number(row.Total_Wind_Loss) || 0,
    indirectLoss: Number(row.Total_Fluvial_Loss + row.Total_Coastal_Loss) || 0,
    totalLoss: Number(row.Total_Loss) || 0,
    buildingsAffected: Number(row.Number_Damaged_Buildings) || 0,
    year: 2023, // Use actual event year
    eventId: 'tc-lola-2024', // Link to specific event
  }));
}
```

#### Tab 2: "Economic Loss by Asset Type"  
```typescript
function convertAssetEconomicData(impactByAsset: any): AssetDamageData[] {
  return impactByAsset.map((row, index) => ({
    id: `asset-loss-${index}`,
    assetType: row.Asset,
    assetCount: Number(row.Number_Damaged) || 0,
    appropriateSectorId: mapAssetToSector(row.Asset), // ✅ Correct mapping
    hazardId: 'tropical-cyclone',
    totalLoss: Number(row.Total_Loss) || 0,
    replacementCost: Number(row.Replacement_Cost) || 0,
    year: 2023,
  }));
}

// Helper function
function mapAssetToSector(assetType: string): string {
  const assetSectorMap: Record<string, string> = {
    'School': 'Education',
    'Hospital': 'Public',
    'Health Facility': 'Public',
    'Residential Building': 'Residential',
    'Road': 'Infrastructure',
    'Bridge': 'Infrastructure',
    'Port': 'Infrastructure',
    'Commercial': 'Productive',
    // ... more mappings
  };
  return assetSectorMap[assetType] || 'Other';
}
```

**Benefits**:
- ✅ No double-counting
- ✅ Clear distinction between sector vs asset analysis
- ✅ Correct sector assignment
- ✅ Can drill down from sector → assets

---

### Fix 3: Add Regional Filtering

Both tables should support:

```tsx
// Add region column and make it filterable
<th>Region</th>

// In table body
<td>
  <button 
    onClick={() => onRegionClick(record.region)}
    className="hover:text-blue-400"
  >
    {record.region}
  </button>
</td>
```

**Benefits**:
- ✅ Click region to filter map
- ✅ Supports spatial analysis
- ✅ Enables regional comparisons

---

### Fix 4: Add Missing Metadata

```typescript
interface EnhancedExposureData {
  // ... existing fields
  exposureDate: string; // When hazard occurred/forecasted
  dataSource: string; // "RiskScape Model", "Field Survey", etc.
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  lastUpdated: string;
}

interface EnhancedEconomicData {
  // ... existing fields
  eventDate: string; // Actual event date, not hardcoded year
  eventId: string; // Link to parent Event
  lossType: 'DIRECT' | 'INDIRECT' | 'TOTAL';
  currency: 'USD' | 'VUV';
  assessmentDate: string; // When damage was assessed
  verified: boolean; // Ground truth vs modeled
}
```

---

## 🎯 Priority Ranking

### 🔥 Critical (Fix Immediately)
1. **Exposure: Add region column** - Users can't identify WHERE exposure is
2. **Economic: Separate sector vs asset tables** - Double counting is misleading
3. **Economic: Fix sector assignment for assets** - Wrong data for filtering

### ⚠️ High Priority
4. **Exposure: Use sector-specific data** - Enable sector filtering
5. **Economic: Use actual event dates** - Not hardcoded 2024
6. **Both: Add regional filtering** - Essential for spatial analysis

### 📋 Medium Priority
7. **Both: Add export functionality** - Users need CSV/Excel export
8. **Exposure: Add intensity/severity indicators** - Visual risk levels
9. **Economic: Show recovery timeline** - Short vs long-term losses

### 💡 Nice to Have
10. **Interactive sorting** - Click column headers
11. **Inline sparklines** - Trend visualization for time series
12. **Comparison mode** - Compare regions side-by-side

---

## 📈 Example: Before vs After

### BEFORE: Exposure Table
```
Hazard              | Sector | Population | Assets at Risk | Infrastructure
--------------------|--------|------------|----------------|----------------
Tropical Cyclone    | all    | 50,000     | $5,000,000    | 150
Tropical Cyclone    | all    | 30,000     | $3,000,000    | 90
...
❌ No context on WHERE these exposures are
❌ Can't filter by sector
```

### AFTER: Exposure Table
```
Region     | Sector       | Hazard    | Intensity | People | Buildings | Value      | Risk
-----------|--------------|-----------|-----------|--------|-----------|------------|------
Shefa      | Residential  | TC Lola   | 280 km/h  | 50,000 | 12,000   | $5.0M     | 🔴 HIGH
Santo      | Infrastructure| TC Lola  | 210 km/h  | 30,000 | 800      | $3.0M     | 🟡 MED
Malekula   | Education    | TC Lola   | 180 km/h  | 5,000  | 45       | $0.5M     | 🟢 LOW
...
✅ Clear regional context
✅ Sector filtering works
✅ Risk prioritization visible
```

### BEFORE: Economic Table
```
Hazard           | Sector         | Direct  | Indirect | Total   | Year
-----------------|----------------|---------|----------|---------|------
Tropical Cyclone | Residential    | $2.0M   | $0.5M   | $2.5M   | 2024
Tropical Cyclone | Infrastructure | $1.5M   | $0.3M   | $1.8M   | 2024  ← Sector total
Tropical Cyclone | Infrastructure | $0.8M   | $0.1M   | $0.9M   | 2024  ← Road asset (part of above?)
Tropical Cyclone | Infrastructure | $0.4M   | $0.05M  | $0.45M  | 2024  ← Bridge asset (part of above?)
...
❌ Double counting unclear
❌ Wrong year
❌ Assets wrongly tagged as Infrastructure
```

### AFTER: Economic Loss by Sector
```
Region   | Sector       | Event    | Wind Loss | Flood Loss | Total   | Damaged | Date
---------|--------------|----------|-----------|------------|---------|---------|------------
Shefa    | Residential  | TC Lola  | $2.0M     | $0.5M     | $2.5M   | 3,200   | 2023-10-23
Santo    | Infrastructure| TC Lola | $1.5M     | $0.3M     | $1.8M   | 450     | 2023-10-23
...
✅ One row = one sector in one region
✅ Correct year
✅ Clear loss breakdown
```

### AFTER: Economic Loss by Asset Type (separate tab)
```
Asset Type  | Sector    | Count | Loss    | Replacement | Status
------------|-----------|-------|---------|-------------|------------------
Road        | Infrastructure | 45 | $0.8M  | $1.2M      | 60% functional
School      | Education      | 12 | $0.4M  | $0.6M      | Assessment pending
Hospital    | Public         | 3  | $0.3M  | $0.5M      | Operational
...
✅ Correct sector assignment
✅ Asset-specific metrics
✅ No overlap with sector table
```

---

## 🔍 Testing Checklist

After implementing fixes:

- [ ] Exposure table shows region names
- [ ] Exposure table responds to sector filter
- [ ] Economic table separated into Sector vs Asset tabs
- [ ] Asset types have correct sector assignments
- [ ] Can filter by region in both tables
- [ ] Totals don't double-count
- [ ] Event dates are accurate (not all 2024)
- [ ] Export to CSV works
- [ ] Sort by column works
- [ ] Mobile responsive

---

## 💼 Business Impact

### Current Issues Cost:
- **Decision delays**: Users can't identify priority regions → slow response
- **Misallocated resources**: Wrong sector data → funds to wrong areas
- **Lost trust**: Double-counted totals → stakeholders question accuracy
- **Manual workarounds**: Users export & fix in Excel → time waste

### After Fixes:
- ✅ **Faster decisions**: Click region → see exposure → allocate resources
- ✅ **Accurate targeting**: Correct sector data → right interventions
- ✅ **Stakeholder confidence**: Clean, verifiable numbers
- ✅ **Self-service analysis**: No Excel workarounds needed

---

## 📝 Implementation Order

1. **Day 1**: Fix exposure region column (quickest win)
2. **Day 1**: Fix asset sector assignment (data quality critical)
3. **Day 2**: Separate economic tabs (UX improvement)
4. **Day 3**: Add regional filtering (interaction)
5. **Day 4**: Use sector-specific exposure data (data structure)
6. **Day 5**: Add metadata & polish (completeness)

**Total effort**: ~1 week for a complete, production-ready solution

---

**Current Status**: 🔴 **CRITICAL ISSUES** - Tables show incomplete/misleading data  
**After Fixes**: 🟢 **PRODUCTION READY** - Actionable, accurate, user-friendly
