# Impact Table Critique

**Component**: `BottomTabs.tsx` → "Impact" tab  
**Date**: February 13, 2026  
**Status**: 🔴 **CRITICAL DESIGN ISSUES**

---

## Executive Summary

The Impact table is the **weakest component** in the dashboard. It displays a single-row "National" aggregate that provides minimal value and contains misleading column labels. The table structure is fundamentally inappropriate for displaying summary statistics.

**Severity**: 🔴 **High** - Misleading UI, poor UX, limited utility  
**Recommendation**: **Complete redesign needed**

---

## Current Implementation

### Table Structure:

```tsx
┌──────────┬──────────┬───────────┬──────────────┬─────────────────┐
│ National │ Districts│ High Risk │ Affected Pop.│ Economic Damage │
├──────────┼──────────┼───────────┼──────────────┼─────────────────┤
│ National │    66    │     0     │   304,538    │   $28,446,724  │
└──────────┴──────────┴───────────┴──────────────┴─────────────────┘
```

**Data Source**:
```typescript
const nationalImpactData = useMemo(
  () => aggregateEventsByLevel(filteredEvents, "national", districts, provinces, false),
  [filteredEvents, districts, provinces]
);
// Returns: [{ id: "national", name: "National", totalEvents: 66, 
//             highRiskAreas: 0, totalAffectedPopulation: 304538, 
//             totalEconomicDamage: 28446724 }]
```

---

## 🔴 Critical Issues

### Issue #1: Misleading Column Header - "Districts"

**Problem**: 
```tsx
<th>Districts</th>
// But displays:
<td>{data.totalEvents}</td>  // Actually shows EVENT count, not district count
```

**What Users See**: "Districts: 66"  
**What Users Think**: "66 districts affected"  
**Reality**: "66 events (expanded regional×sector entries)"

**Why This Is Wrong**:
- There are only ~6 provinces and ~17 districts in Vanuatu
- The number 66 represents regional impact entries, not districts
- Users will misinterpret this as geographic coverage

**Impact**: **Severe** - Fundamental misunderstanding of data scale

---

### Issue #2: Single-Row Table Anti-Pattern

**Problem**: Using a table structure to display a single data row

**Current**:
```
┌─────────────────────────────────────────────────────┐
│        Table with 1 row showing national totals     │
└─────────────────────────────────────────────────────┘
```

**Why This Is Bad**:
- Tables are for comparing multiple entities
- Headers take up 50% of vertical space for 1 data row
- Horizontal scrolling on mobile for single values
- Visual hierarchy is inverted (headers bigger than data)

**Better Alternatives**:
1. **Metric Cards** (like SummaryPanel uses)
2. **Key-Value Pairs**
3. **Infographic Dashboard**
4. **Multi-Row Breakdown** (by hazard, sector, or region)

---

### Issue #3: Hardcoded to "National" Level

**Problem**: Ignores the aggregation level from filters

```typescript
const getAggregationLabel = () => "National"; // ❌ Hardcoded

// filters.aggregationLevel could be "district" or "province" but is ignored
```

**Why This Is Wrong**:
- User can select "District" or "Province" aggregation in FilterPanel
- Impact table doesn't respond to this selection
- Other components (SummaryPanel) respect aggregation level
- Inconsistent behavior across dashboard

**Expected Behavior**:
- **National**: Show 1 row (current behavior)
- **Province**: Show 6 rows (one per province with aggregated stats)
- **District**: Show 17 rows (one per district with stats)

**Impact**: Missed opportunity for district/province comparisons

---

### Issue #4: Confusing "High Risk" Metric

**Problem**: No context for what "High Risk" means

```typescript
highRiskAreas: events with severity === "high" || "critical"
```

**Current Display**: "High Risk: 0"

**Issues**:
- "High Risk Areas" sounds like geographic locations
- Actually counts events, not areas
- Value is 0 because TC Lola severity calculation sets most to "medium"
- No explanation of what makes something "high risk"
- No visual indicator (color, icon, badge)

**Better Alternatives**:
1. **Rename**: "Critical Events" or "High Severity Events"
2. **Add Context**: "0 of 66 events (0%)"
3. **Show Distribution**: "Low: 20, Medium: 46, High: 0, Critical: 0"
4. **Visual Indicator**: 🟢 🟡 🟠 🔴 severity badges

---

### Issue #5: No Temporal Dimension

**Problem**: No date or time information visible

**Missing**:
- When did events occur?
- Event date range (start/end)
- Most recent event
- Trend over time

**Current**: User sees totals but no context of WHEN

**Impact**: Can't understand if this is current, historical, or forecast data

---

### Issue #6: No Breakdown by Category

**Problem**: Single aggregate number hides important distributions

**What's Missing**:
- **By Hazard**: TC Lola vs other hazards (if multiple exist)
- **By Sector**: Residential, Infrastructure, Education breakdown
- **By Severity**: Critical vs High vs Medium vs Low
- **By Region**: Which provinces/districts most affected

**Current Behavior**:
- Applies filters (e.g., "Residential only")
- Shows filtered totals
- But user can't see the breakdown

**Example Scenario**:
```
User filters to "Residential" sector:
┌──────────┬──────────┬───────────┬──────────────┬─────────────────┐
│ National │    66    │     0     │   150,000    │   $10,000,000  │
└──────────┴──────────┴───────────┴──────────────┴─────────────────┘

Question: How is this distributed across regions?
Answer: Can't tell from this table!
```

---

### Issue #7: Redundant with SummaryPanel

**Problem**: Duplicates information already in SummaryPanel

**SummaryPanel Shows** (in better format):
- ✅ Total Events (with icon + card)
- ✅ High Risk Areas (with percentage)
- ✅ Total Population Affected (with trend)
- ✅ Total Economic Damage (with currency)

**Impact Table Shows**:
- ❌ Same information in worse format (1-row table)

**Result**: Wasted screen space, no new insights

---

### Issue #8: No Interactivity

**Problem**: Static display with no user engagement

**Missing Features**:
- ❌ Click row to see details
- ❌ Sort by column
- ❌ Expand to see breakdown
- ❌ Export data
- ❌ Link to related map regions
- ❌ Hover tooltips for context

**Current**: Just displays numbers with no actions

---

### Issue #9: Poor Mobile Experience

**Problem**: Horizontal scrolling required for single row of data

**On Mobile**:
```
┌──────────┬──────────┬───────────┬──────...
│ National │    66    │     0     │   304...
```

**Better Approach**: Vertical stacked cards or summary metrics

---

### Issue #10: Missing Context & Metadata

**Problem**: No explanation of what the numbers represent

**Missing**:
- Data source (RiskScape model? Field survey?)
- Data date (when was this calculated?)
- Confidence level (modeled vs verified)
- Units clarification (people affected out of how many?)
- Comparison baseline (vs previous events? vs national population?)

---

## 📊 Proposed Redesigns

### Option 1: Multi-Row Breakdown Table (Best for Comparisons)

**Replace single national row with meaningful breakdown**:

#### By Province (when aggregation = "province"):
```
┌────────────┬────────┬─────────────┬──────────────┬─────────────────┬──────────┐
│ Province   │ Events │ Affected    │ Economic     │ Critical │ Severity │
│            │        │ Population  │ Loss         │ Assets   │ Level    │
├────────────┼────────┼─────────────┼──────────────┼──────────┼──────────┤
│ Shefa      │   18   │  120,450   │ $12,350,000 │    245   │ 🔴 HIGH  │
│ Santo      │   15   │   85,230   │  $8,920,000 │    180   │ 🟡 MED   │
│ Malekula   │   12   │   45,678   │  $4,123,000 │     95   │ 🟡 MED   │
│ Tafea      │   10   │   32,450   │  $2,050,000 │     67   │ 🟢 LOW   │
│ Penama     │    8   │   15,230   │    $850,000 │     42   │ 🟢 LOW   │
│ Torba      │    3   │    5,500   │    $153,724 │     15   │ 🟢 LOW   │
├────────────┼────────┼─────────────┼──────────────┼──────────┼──────────┤
│ **TOTAL**  │ **66** │ **304,538** │**$28,446,724**│ **644** │          │
└────────────┴────────┴─────────────┴──────────────┴──────────┴──────────┘
```

**Benefits**:
- ✅ Shows geographic distribution
- ✅ Enables province comparisons
- ✅ Multiple data rows justify table structure
- ✅ Severity visual indicators
- ✅ Totals row for context

#### By Sector (when sector filter NOT active):
```
┌──────────────┬────────┬─────────────┬──────────────┬──────────────┐
│ Sector       │ Events │ Buildings   │ Economic Loss│ % of Total   │
├──────────────┼────────┼─────────────┼──────────────┼──────────────┤
│ Residential  │   22   │   8,450     │  $12,500,000 │    44%       │
│ Infrastructure│  18   │     680     │   $8,200,000 │    29%       │
│ Public       │   12   │     320     │   $4,800,000 │    17%       │
│ Education    │    8   │     156     │   $1,946,000 │     7%       │
│ Productive   │    4   │      89     │     $750,000 │     3%       │
│ Other        │    2   │      28     │     $250,724 │    <1%       │
├──────────────┼────────┼─────────────┼──────────────┼──────────────┤
│ **TOTAL**    │ **66** │ **9,723**   │**$28,446,724**│  **100%**   │
└──────────────┴────────┴─────────────┴──────────────┴──────────────┘
```

**Benefits**:
- ✅ Shows sector impact distribution
- ✅ Percentage context (relative importance)
- ✅ Actionable for recovery planning
- ✅ Complements economic tables

---

### Option 2: Dashboard Card Grid (Best for Overview)

**Replace table with metric cards** (similar to SummaryPanel):

```
┌─────────────────────────────────────────────────────────────────┐
│                     TC Lola Impact Overview                     │
│                     Event Date: Oct 23, 2023                    │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ 🌀 AFFECTED AREA │  │ 👥 PEOPLE IMPACT │  │ 💰 ECONOMIC LOSS │
│                  │  │                  │  │                  │
│   6 Provinces    │  │   304,538        │  │  $28.4 Million   │
│   17 Districts   │  │   Affected       │  │  USD             │
│   66 Regions     │  │   (42% of pop.)  │  │  (8% of GDP)     │
└──────────────────┘  └──────────────────┘  └──────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ 🏘️  BUILDINGS     │  │ ⚠️  SEVERITY     │  │ 🏗️  SECTORS      │
│                  │  │                  │  │                  │
│   9,723          │  │  🔴 Critical: 0  │  │  Most Affected:  │
│   Damaged        │  │  🟡 High: 0      │  │  Residential     │
│   (12% of stock) │  │  🟢 Medium: 66   │  │  Infrastructure  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Benefits**:
- ✅ Visual hierarchy (important metrics emphasized)
- ✅ Context provided (percentages, comparisons)
- ✅ Scannable at a glance
- ✅ Mobile-friendly (cards stack vertically)
- ✅ Color-coded severity
- ✅ Icon-enhanced for faster comprehension

---

### Option 3: Regional Impact Map-Linked Table (Best for Spatial Analysis)

**Interactive table with map integration**:

```
┌─────────────────────────────────────────────────────────────────┐
│ Regional Impact Summary                     🗺️  View on Map    │
│ Sorted by Economic Loss ▼                  📊 Show Charts     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────┬──────────┬─────────────┬──────────────┬─────────┐
│ District    │ Province │ Population  │ Economic Loss│ Severity│
│ (Click to   │          │ Affected    │ (USD)        │         │
│  Pan to)    │          │             │              │         │
├─────────────┼──────────┼─────────────┼──────────────┼─────────┤
│ 📍 Port Vila│ Shefa    │   95,000    │  $9,500,000 │ 🔴 HIGH │
│ 📍 Luganville│ Santo   │   62,000    │  $6,200,000 │ 🟡 MED  │
│ 📍 Norsup   │ Malekula │   28,000    │  $2,800,000 │ 🟡 MED  │
│ 📍 Isangel  │ Tafea    │   18,500    │  $1,850,000 │ 🟢 LOW  │
│ ... (13 more) ...                                              │
└─────────────┴──────────┴─────────────┴──────────────┴─────────┘

[Show All (17) ▼]  |  [Export CSV]  |  [Compare Selected]
```

**Features**:
- ✅ **Clickable rows** → Pan map to district
- ✅ **Sortable columns** → Reorder by any metric
- ✅ **Expandable** → Show/hide rows
- ✅ **Export functionality** → CSV download
- ✅ **Visual severity** → Color-coded badges
- ✅ **Map integration** → 📍 icon indicates clickable
- ✅ **Action buttons** → Compare, analyze, export

**Benefits**:
- Interactive & engaging
- Enables exploration
- Connects table ↔ map
- Actionable insights

---

### Option 4: Hybrid - Summary + Breakdown (Recommended)

**Combine best of all approaches**:

```
┌─────────────────────────────────────────────────────────────────┐
│                  📊 TC Lola Impact Summary                      │
│                    October 23, 2023 Event                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┬─────────────────┬─────────────────────────────┐
│ 👥 304,538      │ 💰 $28.4M       │ 🏘️ 9,723 Buildings         │
│ People Affected │ Economic Loss   │ Damaged (12% of stock)      │
│ (42% of pop.)   │ (8% of GDP)     │                             │
└─────────────────┴─────────────────┴─────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Impact by Province        [Toggle: Province ▼ | Sector | Hazard]│
├──────────────┬──────────┬─────────────┬──────────────┬─────────┤
│ Province     │ Districts│ Population  │ Economic Loss│ % Total │
├──────────────┼──────────┼─────────────┼──────────────┼─────────┤
│ Shefa   🔴   │    3     │  120,450    │ $12,350,000 │   43%   │
│ Santo   🟡   │    4     │   85,230    │  $8,920,000 │   31%   │
│ Malekula 🟡  │    3     │   45,678    │  $4,123,000 │   15%   │
│ Tafea   🟢   │    3     │   32,450    │  $2,050,000 │    7%   │
│ Penama  🟢   │    2     │   15,230    │    $850,000 │    3%   │
│ Torba   🟢   │    2     │    5,500    │    $153,724 │   <1%   │
└──────────────┴──────────┴─────────────┴──────────────┴─────────┘

[📥 Export CSV]  [🗺️ Show on Map]  [📊 View Charts]
```

**Why This Is Best**:
1. **Summary cards** → Quick overview with context
2. **Breakdown table** → Detailed comparison
3. **Toggle control** → Switch between province/sector/hazard views
4. **Visual indicators** → Severity badges
5. **Action buttons** → Export, map, charts
6. **Percentage context** → Relative importance
7. **Responsive design** → Works on mobile (cards stack, table scrolls)

---

## 🎯 Recommendations

### Priority 1: CRITICAL (Fix Immediately)

1. **Fix misleading "Districts" column header**
   ```typescript
   // Change from:
   <th>Districts</th>
   // To:
   <th>Regional Impact Entries</th>
   // Or better: Just remove if keeping single-row format
   ```

2. **Either respect aggregation level OR remove table entirely**
   ```typescript
   // Option A: Respect filters.aggregationLevel
   const impactData = useMemo(
     () => aggregateEventsByLevel(
       filteredEvents, 
       filters.aggregationLevel, // Use the actual filter value
       districts, 
       provinces, 
       false
     ),
     [filteredEvents, filters.aggregationLevel, districts, provinces]
   );
   
   // Option B: Remove redundant table, keep only specialized tabs
   // (Exposure, Economic, Damage already show this data better)
   ```

3. **Add explanatory text when showing national aggregate**
   ```tsx
   {impactData.length === 1 && (
     <div className="text-sm text-slate-400 mb-2 px-4">
       National aggregate of {filteredEvents.length} regional impact 
       entries across {uniqueDistrictsCount} districts in 
       {uniqueProvincesCount} provinces. Select "Province" or "District" 
       aggregation in filters to see breakdown.
     </div>
   )}
   ```

---

### Priority 2: HIGH (Major Improvement)

4. **Implement Option 4 (Hybrid Design)**
   - Summary metric cards at top
   - Multi-row breakdown table below
   - Toggle between province/sector/hazard views
   - Add severity indicators

5. **Add interactivity**
   - Sortable columns
   - Clickable rows → pan map to region
   - Export CSV functionality

6. **Remove or hide single-row table**
   - If keeping national-only view, use cards instead
   - Reserve table structure for multi-row data

---

### Priority 3: MEDIUM (Polish)

7. **Add temporal information**
   - Event date range
   - Last updated timestamp
   - Forecast vs actual indicator

8. **Add metadata & context**
   - Data source badge
   - Confidence indicators
   - Percentage of national totals
   - Comparison to baseline

9. **Improve mobile UX**
   - Stack cards vertically on narrow screens
   - Horizontal scroll only for actual multi-row tables
   - Larger touch targets

---

## 📈 Before vs After Comparison

### BEFORE (Current):
```
❌ Single-row table (inappropriate structure)
❌ Misleading "Districts" column
❌ Ignores aggregation level filter
❌ No breakdown by category
❌ Redundant with SummaryPanel
❌ No interactivity
❌ Poor mobile experience
❌ Missing context
```

**Provides**: Minimal value beyond what SummaryPanel already shows

---

### AFTER (Recommended - Option 4):
```
✅ Summary metric cards (scannable overview)
✅ Multi-row breakdown table (province/sector/hazard)
✅ Respects aggregation level filter
✅ Category-based views (toggle control)
✅ Unique insights (distribution, percentages)
✅ Interactive (sort, export, map links)
✅ Mobile-friendly (responsive design)
✅ Contextual information (dates, sources, comparisons)
```

**Provides**: Actionable insights, enables comparisons, supports decision-making

---

## 🔍 Testing Scenarios

### Scenario 1: National View
**When**: `filters.aggregationLevel = "national"`  
**Expected**: Summary cards + single row OR just summary cards  
**Current**: ⚠️ Single-row table with misleading labels

### Scenario 2: Province View
**When**: `filters.aggregationLevel = "province"`  
**Expected**: 6 rows (one per province) with comparative metrics  
**Current**: ❌ Still shows single "National" row (ignores filter)

### Scenario 3: District View
**When**: `filters.aggregationLevel = "district"`  
**Expected**: 17 rows (one per district) with comparative metrics  
**Current**: ❌ Still shows single "National" row (ignores filter)

### Scenario 4: Sector Filter Active
**When**: `filters.selectedSectors = ["Residential"]`  
**Expected**: Breakdown shows only Residential sector across regions  
**Current**: ⚠️ Shows filtered total but no breakdown visible

### Scenario 5: Mobile View
**When**: Screen width < 768px  
**Expected**: Vertical card stack or compact table  
**Current**: ⚠️ Horizontal scroll for single row (poor UX)

---

## 💡 Key Insights

1. **Table Structure Misuse**: Using a table to display a single summary row is an anti-pattern. Tables are for comparing multiple entities.

2. **Missed Opportunity**: The underlying data (`filteredEvents`) contains rich district/province/sector breakdowns that aren't surfaced in the UI.

3. **Filter Integration Gap**: The aggregation level filter exists but is completely ignored by this component.

4. **Redundancy**: This tab duplicates SummaryPanel metrics in a less effective format.

5. **No Unique Value**: The current Impact table doesn't provide information that isn't already visible elsewhere in better format.

---

## ✅ Success Criteria (After Fix)

- [ ] Table shows multi-row data when aggregation is province/district
- [ ] Column headers accurately describe the data
- [ ] Aggregation level filter is respected
- [ ] Visual severity indicators present
- [ ] At least one interactive feature (sort/export/map link)
- [ ] Mobile experience doesn't require horizontal scroll
- [ ] Provides unique insights not available in other tabs
- [ ] User can understand data source and confidence level
- [ ] Percentages and context help interpret raw numbers

---

## 🎯 Final Verdict

**Current Status**: 🔴 **Poor** (3/10)

**Issues**:
- Misleading labels
- Inappropriate structure
- Ignores filters
- Limited utility
- Poor UX

**Recommendation**: **Complete redesign required**

**Suggested Approach**: Implement **Option 4 (Hybrid)** with:
1. Summary metric cards (like SummaryPanel)
2. Multi-row breakdown table (respects aggregation level)
3. Toggle to switch between province/sector/hazard views
4. Interactive features (sort, export, map links)
5. Visual severity indicators
6. Responsive mobile design

**Estimated Effort**: 1-2 days for full implementation  
**Impact**: High - Transforms weakest component into valuable decision-support tool
