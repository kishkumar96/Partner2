# Event Architecture - Single Event Model

## Problem Statement

Previously, TC Lola (one cyclone event) was represented as **66 separate events** in the events table—one for each region/district affected. This created confusion and would make it difficult to add more cyclone data in the future.

## Solution: Event vs Regional Impact Separation

### New Architecture

```typescript
// Single Event (the actual disaster)
{
  id: "tc-lola-2024",
  name: "Tropical Cyclone Lola",
  date: "2024-01-30",
  hazardId: "tropical-cyclone",
  countryCode: "VU",
  totalAffectedPopulation: 245000,  // Aggregated from all regions
  totalEconomicDamage: 15000000,    // Aggregated from all regions
  affectedRegions: 66,               // Count of impacted regions
  severity: "critical",
  regionalImpacts: [                 // Nested regional data
    {
      id: "tc-lola-2024-shefa",
      eventId: "tc-lola-2024",
      regionId: "shefa",
      regionName: "Shefa Province",
      affectedPopulation: 50000,
      economicDamage: 4000000,
      severity: "critical",
      // ...
    },
    // ... 65 more regional impacts
  ]
}
```

### Key Changes

1. **Events Table**: Now shows **1 entry for TC Lola** instead of 66
2. **Regional Details**: Stored in `event.regionalImpacts[]` array
3. **Aggregated Stats**: Event-level totals calculated from regional data

## Data Flow

### Before
```
regionalImpacts.geojson (66 features)
  ↓
convertRegionalImpactsToEvents()
  ↓
66 Events (one per region) ❌
```

### After
```
regionalImpacts.geojson (66 features)
  ↓
convertRegionalImpactsToRegionalImpacts() ← Creates RegionalImpact[]
  ↓
1 Event with 66 nested regionalImpacts ✅
```

## Adding Future Cyclones

When adding TC Harold or other cyclones:

```typescript
// Load Harold's regional data
const haroldRegionalImpacts = await loadRegionalImpacts('tc-harold-2023.geojson');
const haroldRegionalData = convertRegionalImpactsToRegionalImpacts(
  haroldRegionalImpacts, 
  'tc-harold-2023'
);

// Create Harold event
const tcHaroldEvent: Event = {
  id: 'tc-harold-2023',
  name: 'Tropical Cyclone Harold',
  date: '2023-04-06',
  hazardId: 'tropical-cyclone',
  countryCode: 'VU',
  totalAffectedPopulation: haroldRegionalData.reduce((sum, ri) => sum + ri.affectedPopulation, 0),
  totalEconomicDamage: haroldRegionalData.reduce((sum, ri) => sum + ri.economicDamage, 0),
  affectedRegions: haroldRegionalData.length,
  severity: calculateOverallSeverity(haroldRegionalData),
  location: { lat: -15.4, lng: 167.2 }, // Landfall point
  regionalImpacts: haroldRegionalData,
};

// Events array now has 2 cyclones
const events = [tcLolaEvent, tcHaroldEvent]; // ← 2 events, not 100+
```

## Backward Compatibility

### Deprecated Fields

The Event interface maintains deprecated fields for gradual migration:

```typescript
{
  // New required fields
  totalAffectedPopulation: number;
  totalEconomicDamage: number;
  affectedRegions: number;
  
  // Deprecated (still available but should not be used)
  /** @deprecated Use regionalImpacts instead */
  sectorId?: string;
  /** @deprecated Use regionalImpacts instead */
  districtId?: string;
  /** @deprecated Use regionalImpacts instead */
  provinceId?: string;
  /** @deprecated Use aggregated values instead */
  affectedPopulation?: number; // Use totalAffectedPopulation
  /** @deprecated Use aggregated values instead */
  economicDamage?: number;     // Use totalEconomicDamage
}
```

### Helper Function for Existing Code

For code that expects regional-level "events" for filtering/visualization:

```typescript
/**
 * Expand events to regional-level entries for backward compatibility
 * with existing filter/visualization code
 */
export function expandEventsToRegionalEntries(events: Event[]): Event[] {
  const expandedEvents: Event[] = [];
  
  events.forEach(event => {
    if (event.regionalImpacts && event.regionalImpacts.length > 0) {
      // Create event-like entry for each regional impact
      event.regionalImpacts.forEach(ri => {
        expandedEvents.push({
          ...event,
          id: ri.id,
          name: `${event.name} - ${ri.regionName}`,
          districtId: ri.regionId,
          provinceId: getProvinceIdFromDistrictId(ri.regionId),
          sectorId: 'Infrastructure', // Default sector
          affectedPopulation: ri.affectedPopulation,
          economicDamage: ri.economicDamage,
          totalAffectedPopulation: ri.affectedPopulation,
          totalEconomicDamage: ri.economicDamage,
          affectedRegions: 1,
          location: ri.location,
          severity: ri.severity,
        });
      });
    } else {
      // No regional data, use event as-is
      expandedEvents.push(event);
    }
  });
  
  return expandedEvents;
}
```

## Migration Strategy

### Phase 1: Done ✅
- [x] Add RegionalImpact type
- [x] Update Event type with new required fields
- [x] Create single TC Lola event in data loader
- [x] Store regional impacts in nested structure

### Phase 2: In Progress
- [ ] Update UI components to show 1 TC Lola event
- [ ] Add regional breakdown visualization
- [ ] Update filters to handle new structure

### Phase 3: Future
- [ ] Add TC Harold and other historical cyclones
- [ ] Remove deprecated fields from Event type
- [ ] Remove backward compatibility helpers

## Benefits

1. **Clarity**: Events table shows actual disaster occurrences, not regional breakdowns
2. **Scalability**: Easy to add 10+ cyclones without overwhelming the UI
3. **Accuracy**: Proper event-level vs region-level distinction
4. **Future-proof**: Ready for multi-cyclone comparison and analysis
5. **Better UX**: Users select "TC Lola" once, then explore regional impacts

## Visual Impact

### Events Selector Before
```
Events (66)
☑ TC Lola Impact - Shefa
☑ TC Lola Impact - Santo
☑ TC Lola Impact - Malekula
☑ TC Lola Impact - Efate
... 62 more entries ❌ Confusing!
```

### Events Selector After
```
Events (1)
☑ Tropical Cyclone Lola (Oct 2023)
   66 regions affected ✅ Clear!
```

When adding more cyclones:
```
Events (3)
☑ Tropical Cyclone Lola (Oct 2023)
☑ Tropical Cyclone Harold (Apr 2023)
☑ Tropical Cyclone Pam (Mar 2015)
```

Much better! 🎉
