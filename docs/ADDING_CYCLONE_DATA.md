# Adding Future Cyclone Data: Quick Start Guide

## Overview

With the new Event architecture, adding additional cyclones (TC Harold, TC Pam, etc.) is straightforward and won't create hundreds of confusing entries in the events table.

## Step-by-Step Guide

### 1. Prepare Your Data Files

For each new cyclone, you'll need:
- Regional impacts GeoJSON (similar to `regional-impacts.geojson`)
- Cyclone forecast track CSV (optional, for animation)
- National summary CSV (optional)
- Impact by sector CSV (optional)

**Example file structure:**
```
public/
  tc-lola/
    regional-impacts.geojson
    cyclone-forecast.csv
    national-summary.csv
  tc-harold/
    regional-impacts.geojson
    cyclone-forecast.csv
    national-summary.csv
  tc-pam/
    regional-impacts.geojson
    cyclone-forecast.csv
    national-summary.csv
```

### 2. Add Data Loading Functions

In `src/utils/realDataLoader.ts`, add loader functions for the new cyclone:

```typescript
/**
 * Load TC Harold regional impacts
 */
export async function loadTCHaroldRegionalImpacts() {
  const { data } = await loadGeoJSON('/tc-harold/regional-impacts.geojson');
  return data;
}

/**
 * Load TC Harold forecast track
 */
export async function loadTCHaroldForecastTrack() {
  const { data: csvText } = await loadTextData('/tc-harold/cyclone-forecast.csv');
  if (!csvText) return null;
  
  const rows = parseCSV(csvText, { convertNaN: true });
  return rows.map((row: any) => ({
    time: new Date(row['Time[fmt=yyyy-MM-dd\'T\'HH:mm:ss\'Z\']']),
    latitude: parseFloat(row.Latitude),
    longitude: parseFloat(row.Longitude),
    // ... other fields
  }));
}
```

### 3. Update loadAllRealData() Function

Add your new cyclone to the data loading process:

```typescript
export async function loadAllRealData(): Promise<RealDataLoadResult> {
  // ... existing code ...
  
  const [
    cycloneTrack,
    cycloneForecast,
    regionalImpacts,
    // Add Harold data
    haroldRegionalImpacts,
    haroldForecast,
    // ... other data
  ] = await Promise.all([
    loadCycloneTrackData(),
    loadCycloneForecastTrack(),
    loadRegionalImpacts(),
    // Load Harold
    loadTCHaroldRegionalImpacts(),
    loadTCHaroldForecastTrack(),
    // ... other loaders
  ]);
  
  // Create TC Lola event (existing)
  const tcLolaEventId = 'tc-lola-2024';
  const lolaRegionalImpacts = regionalImpacts
    ? convertRegionalImpactsToRegionalImpacts(regionalImpacts, tcLolaEventId)
    : [];
  
  const tcLolaEvent: Event = {
    id: tcLolaEventId,
    name: 'Tropical Cyclone Lola',
    date: '2024-01-30',
    // ... rest of TC Lola event
  };
  
  // Create TC Harold event (NEW!)
  const tcHaroldEventId = 'tc-harold-2023';
  const haroldRegionalImpacts = haroldRegionalImpacts
    ? convertRegionalImpactsToRegionalImpacts(haroldRegionalImpacts, tcHaroldEventId)
    : [];
  
  const totalHaroldPopulation = haroldRegionalImpacts.reduce((sum, ri) => sum + ri.affectedPopulation, 0);
  const totalHaroldDamage = haroldRegionalImpacts.reduce((sum, ri) => sum + ri.economicDamage, 0);
  
  const tcHaroldEvent: Event = {
    id: tcHaroldEventId,
    name: 'Tropical Cyclone Harold',
    date: '2023-04-06',
    hazardId: 'tropical-cyclone',
    countryCode: 'VU',
    totalAffectedPopulation: totalHaroldPopulation,
    totalEconomicDamage: totalHaroldDamage,
    affectedRegions: haroldRegionalImpacts.length,
    severity: calculateOverallSeverity(haroldRegionalImpacts),
    location: {
      lat: -15.4, // Harold's landfall point
      lng: 167.2,
    },
    regionalImpacts: haroldRegionalImpacts,
  };
  
  // Events array now has BOTH cyclones
  const events = [tcLolaEvent, tcHaroldEvent];
  
  return {
    // ... existing return values
    events,
    cycloneForecast: cycloneForecast, // Could be combined or selected
    // ... rest
  };
}
```

### 4. (Optional) Add Helper Function for Severity Calculation

If you don't have one already:

```typescript
function calculateOverallSeverity(regionalImpacts: RegionalImpact[]): "low" | "medium" | "high" | "critical" {
  if (!regionalImpacts.length) return 'low';
  
  const criticalCount = regionalImpacts.filter(ri => ri.severity === 'critical').length;
  const highCount = regionalImpacts.filter(ri => ri.severity === 'high').length;
  const total = regionalImpacts.length;
  
  if (criticalCount > 0) return 'critical';
  if (highCount > total / 2) return 'high';
  if (highCount > 0) return 'medium';
  return 'low';
}
```

### 5. Result

After adding TC Harold, your events table will show:

```
Events (2)
☑ Tropical Cyclone Lola (Oct 2023)
   66 regions affected
☑ Tropical Cyclone Harold (Apr 2023)
   54 regions affected
```

Instead of:
```
Events (120)  ❌
☑ TC Lola Impact - Shefa
☑ TC Lola Impact - Santo
... 118 more confusing entries
```

## Advanced: Multi-Cyclone Analysis

### Filtering by Cyclone

Users can now select which cyclones to analyze:
- Select both → Compare impacts
- Select one → Focus on specific event

### Timeline View

With proper event dates, you can:
- Plot cyclones on a timeline
- Filter by date range (e.g., all cyclones in 2023)
- Show temporal patterns

### Cyclone Animation Switcher

Update the UI to let users switch between cyclone animations:

```typescript
const [selectedCyclone, setSelectedCyclone] = useState('tc-lola-2024');

const activeForecast = selectedCyclone === 'tc-lola-2024' 
  ? lolaForecast 
  : haroldForecast;

<CycloneAnimationLayer
  forecastTrack={activeForecast}
  // ... other props
/>
```

## Best Practices

1. **Consistent Naming**: Use `tc-{name}-{year}` pattern for event IDs
2. **Date Format**: Always use ISO format `YYYY-MM-DD`
3. **Landfall Points**: Use actual landfall coordinates for event location
4. **Data Validation**: Check regional impacts add up to national totals
5. **Severity Calculation**: Use consistent thresholds across all cyclones

## Example: Adding 5 Historical Cyclones

```typescript
const events = [
  createCycloneEvent('tc-lola-2024', 'Tropical Cyclone Lola', '2024-01-30', lolaData),
  createCycloneEvent('tc-harold-2023', 'Tropical Cyclone Harold', '2023-04-06', haroldData),
  createCycloneEvent('tc-gretel-2020', 'Tropical Cyclone Gretel', '2020-03-10', gretelData),
  createCycloneEvent('tc-pam-2015', 'Tropical Cyclone Pam', '2015-03-13', pamData),
  createCycloneEvent('tc-ian-2014', 'Tropical Cyclone Ian', '2014-01-11', ianData),
];

// Helper function
function createCycloneEvent(id: string, name: string, date: string, data: any): Event {
  const regionalImpacts = convertRegionalImpactsToRegionalImpacts(data.regional, id);
  
  return {
    id,
    name,
    date,
    hazardId: 'tropical-cyclone',
    countryCode: 'VU',
    totalAffectedPopulation: regionalImpacts.reduce((sum, ri) => sum + ri.affectedPopulation, 0),
    totalEconomicDamage: regionalImpacts.reduce((sum, ri) => sum + ri.economicDamage, 0),
    affectedRegions: regionalImpacts.length,
    severity: calculateOverallSeverity(regionalImpacts),
    location: data.landfallPoint,
    regionalImpacts,
  };
}
```

Now you have **5 events in the table** representing 5 actual cyclones, not 300+ regional entries! 🎉

## Migration Checklist

When adding a new cyclone:

- [ ] Prepare data files (GeoJSON, CSV)
- [ ] Add data loading functions
- [ ] Create event object with regional impacts
- [ ] Add to events array
- [ ] Test event selection
- [ ] Test regional filtering
- [ ] Verify aggregated statistics
- [ ] Update documentation

## Questions?

See [EVENT_ARCHITECTURE.md](./EVENT_ARCHITECTURE.md) for the full architecture explanation.
