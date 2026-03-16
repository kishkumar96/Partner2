# Partner API Integration Analysis

## 📊 Overview

The Partner API at `https://opmthredds.gem.spc.int/partner_api/v1/` is a **production Django REST API** that serves disaster risk data for Pacific Island countries. This API is already integrated into the Climate Risk Dashboard as a supplementary data source.

## 🎯 Relevance to Application: **HIGHLY RELEVANT** ✅

### Current Integration

The application uses this API through the [`partnerApiService.ts`](src/services/partnerApiService.ts) module, which:
- Resolves country IDs from the `/country/` endpoint
- Fetches cyclone tracks from `/cyclone_track?country={id}`
- Retrieves event metadata from `/event?country={id}`
- Loads risk summaries from `/risk_information?country={id}`

**Active for**: Samoa (WS) and Tonga (TO)  
**Fallback tier**: API data is preferred but local files are used if API fails

## 📋 Endpoint Mapping

### Available Endpoints (from Django URLconf)

```
1.  partner_api/                                     → API root (not used)
2.  partner_api/admin/                               → Django admin interface
3.  partner_api/api-token-auth/                      → Token authentication
4.  partner_api/v1/country/                          → List/filter countries
5.  partner_api/v1/country/<int:pk>                  → Country details
6.  partner_api/v1/country/<int:pk>/                 → Country details (trailing slash)
7.  partner_api/v1/cyclone_track/                    → List cyclone tracks
8.  partner_api/v1/cyclone_track/<int:pk>            → Specific cyclone track
9.  partner_api/v1/cyclone_track/<int:pk>/           → Specific cyclone track (trailing slash)
10. partner_api/v1/risk_information/                 → Risk data (summaries, asset impacts)
11. partner_api/v1/risk_information/<int:pk>         → Specific risk record
12. partner_api/v1/risk_information/<int:pk>/        → Specific risk record (trailing slash)
13. partner_api/v1/risk_forecast/                    → Future risk projections **NEW**
14. partner_api/v1/risk_forecast/<int:pk>            → Specific forecast **NEW**
15. partner_api/v1/hazard_information/<int:pk>       → Hazard details **PARTIALLY USED**
16. partner_api/v1/hazard_information/<int:pk>/      → Hazard details (trailing slash)
17. partner_api/v1/citizen_science/                  → Community-reported data **NEW**
18. partner_api/v1/event/                            → Disaster events
19. partner_api/v1/event/<int:pk>                    → Specific event
20. partner_api/v1/event/<int:pk>/                   → Specific event (trailing slash)
21. ^media/(?P<path>.*)$                             → Static media files
```

### Currently Used by Dashboard

| Endpoint | Purpose | Code Location |
|----------|---------|---------------|
| `/v1/country/` | Resolve country ID from code | [`partnerApiService.ts:127`](src/services/partnerApiService.ts#L127) |
| `/v1/cyclone_track?country={id}` | Load cyclone GeoJSON | [`realDataLoader.ts:1013`](src/utils/realDataLoader.ts#L1013) |
| `/v1/event?country={id}` | Get event name & date | [`realDataLoader.ts:1014`](src/utils/realDataLoader.ts#L1014) |
| `/v1/risk_information?country={id}` | Regional summaries, asset impacts | [`realDataLoader.ts:1015`](src/utils/realDataLoader.ts#L1015) |

### Not Yet Used (Opportunities)

| Endpoint | Potential Use | Priority |
|----------|---------------|----------|
| `/v1/risk_forecast/` | Display future risk projections in dashboard | ⭐⭐⭐ High |
| `/v1/hazard_information/` | Enhanced hazard layers (wind, inundation) | ⭐⭐⭐ High |
| `/v1/citizen_science/` | Community-reported damage observations | ⭐⭐ Medium |
| `/api-token-auth/` | Secure authenticated access to protected data | ⭐ Low |

## 🔧 Technical Implementation

### Data Flow Architecture

```mermaid
graph TD
    A[Dashboard Component] --> B{Country Code}
    B --> C[Local Files<br/>VU, CK]
    B --> D[Partner API Service<br/>WS, TO]
    D --> E[/v1/country/]
    E --> F[Resolve Country ID]
    F --> G[/v1/cyclone_track?country=ID]
    F --> H[/v1/event?country=ID]
    F --> I[/v1/risk_information?country=ID]
    G --> J[Cyclone Track GeoJSON]
    H --> K[Event Metadata]
    I --> L[Risk Summaries & Assets]
    J --> M[Merge with Local Data]
    K --> M
    L --> M
    M --> N[Display on Dashboard]
    C --> N
```

### Code Example: How API is Called

```typescript
// From src/utils/realDataLoader.ts

async function loadPartnerApiCountryData(
  countryCode: CountryCode,
  signal?: AbortSignal
) {
  // Step 1: Get country mapping (resolves country ID from code)
  const mapping = await mapCountryPartnerApis(countryCode);
  
  if (!mapping.scopedUrls) {
    return { countryId: null, cycloneTrack: null, eventMeta: null, ... };
  }

  // Step 2: Fetch data from multiple endpoints in parallel
  const [cycloneResponse, eventResponse, riskResponse] = await Promise.all([
    fetch(mapping.scopedUrls.cyclone_track, { signal }),  // /v1/cyclone_track?country=X
    fetch(mapping.scopedUrls.event, { signal }),          // /v1/event?country=X
    fetch(mapping.scopedUrls.risk_information, { signal }) // /v1/risk_information?country=X
  ]);

  // Step 3: Parse and return
  return {
    cycloneTrack: cycloneResponse.ok ? await cycloneResponse.json() : null,
    eventMeta: eventResponse.ok ? await eventResponse.json() : null,
    riskRegionalSummary: riskResponse.ok ? (await riskResponse.json()).results : []
  };
}
```

## 🚀 Expansion Opportunities

### 1. Enable Partner API for All Countries

**Current State**: Only Samoa (WS) and Tonga (TO) use the Partner API  
**Opportunity**: Extend to Vanuatu (VU) and Cook Islands (CK) if data is available

**Implementation**:
```typescript
// In realDataLoader.ts, update loadPartnerApiCountryData signature
async function loadPartnerApiCountryData(
  countryCode: CountryCode,  // Change from 'WS' | 'TO' to all CountryCode
  signal?: AbortSignal
): Promise<...> {
  // Current code already handles all countries!
  // Just need to verify data exists in Partner API
}
```

**Action Required**:
1. Query `/v1/country/` to check if VU and CK records exist
2. Test `/v1/cyclone_track?country={vu_id}` for data availability
3. Update documentation if data is available

### 2. Integrate Risk Forecasts

**Endpoint**: `/v1/risk_forecast/`  
**Use Case**: Show predicted future impacts based on current cyclone path

**Proposed UI**:
- Add "Forecast" tab to dashboard
- Display projected damage 24h, 48h, 72h ahead
- Show confidence intervals and uncertainty

**Implementation**:
```typescript
export async function loadRiskForecast(
  countryCode: CountryCode,
  cycloneId?: string
): Promise<RiskForecast[]> {
  const endpoints = buildPartnerApiEndpoints();
  const url = cycloneId 
    ? `${endpoints.resource.risk_forecast}?cyclone=${cycloneId}`
    : endpoints.resource.risk_forecast;
  
  const response = await fetch(url);
  return response.json();
}
```

### 3. Add Citizen Science Layer

**Endpoint**: `/v1/citizen_science/`  
**Use Case**: Display community-reported damage observations on map

**Benefits**:
- Real-time ground-truth validation
- Engage local communities
- Supplement official assessments

**Map Layer**:
```typescript
// Add to RealDataLayers.tsx
const citizenScienceData = await fetch(
  `${endpoints.resource.citizen_science}?country=${countryId}`
).then(r => r.json());

map.addLayer({
  id: 'citizen-reports',
  type: 'symbol',
  source: {
    type: 'geojson',
    data: citizenScienceData
  },
  layout: {
    'icon-image': 'citizen-report-marker'
  }
});
```

### 4. Enhanced Hazard Visualization

**Endpoint**: `/v1/hazard_information/{id}/`  
**Current Gap**: Application uses local GeoTIFF files for hazard layers

**Opportunity**: Replace static files with dynamic API data for:
- Wind speed grids
- Inundation depth
- Storm surge extent
- Rainfall accumulation

**Benefits**:
- Always up-to-date data
- Reduced bundle size (no local files)
- Easier multi-country support

## 🐛 Known Issues & Limitations

### Issue 1: 404 on Base API Path
**Symptom**: Accessing `https://opmthredds.gem.spc.int/partner_api/api` returns 404  
**Root Cause**: Django URL router expects specific resource paths like `/v1/country/`  
**Impact**: None (base path not used by application)  
**Resolution**: Not needed - use resource endpoints directly

### Issue 2: Country-Specific Access
**Symptom**: Some countries work, others don't  
**Root Cause**: Data only available for countries with populated database records  
**Current Support**: Confirmed for Samoa (WS) and Tonga (TO)  
**Unknown**: Vanuatu (VU), Cook Islands (CK) availability  
**Action**: Query `/v1/country/` endpoint to verify

### Issue 3: No Authentication Required
**Current**: All endpoints publicly accessible without tokens  
**Security Risk**: Low (public disaster data)  
**Consider**: Add token auth if sensitive/premium data added in future  
**Endpoint Available**: `/api-token-auth/` ready for use

### Issue 4: Data Freshness Unknown
**Gap**: No metadata about when data was last updated  
**Impact**: Dashboard may show outdated information  
**Recommendation**: Add `last_updated` field to API responses  
**Workaround**: Display "Data as of [event date]" instead

## ✅ Action Items

### Immediate (High Priority)
- [ ] **Verify API availability** for all 4 countries (VU, WS, TO, CK)
  ```bash
  curl https://opmthredds.gem.spc.int/partner_api/v1/country/
  # Check for all country records
  ```

- [ ] **Test risk forecast endpoint** and assess data structure
  ```bash
  curl https://opmthredds.gem.spc.int/partner_api/v1/risk_forecast/
  ```

- [ ] **Document API response schemas** for each endpoint
  - Create TypeScript interfaces
  - Add to `src/types/partnerApi.ts`

- [ ] **Add error handling** for API failures
  ```typescript
  try {
    const data = await fetchPartnerData();
  } catch (error) {
    logError('Partner API unavailable', error);
    // Graceful fallback to local files
  }
  ```

### Short Term (1-2 Weeks)
- [ ] **Integrate risk forecasts** into dashboard UI
- [ ] **Add citizen science layer** to map
- [ ] **Create API health check dashboard** (show which endpoints are working)
- [ ] **Write automated tests** for Partner API service

### Long Term (1+ Month)
- [ ] **Replace local files with API** for all countries
- [ ] **Set up API monitoring** (uptime, response times)
- [ ] **Implement token authentication** if required
- [ ] **Create data synchronization strategy** (API + local cache)

## 📚 Related Documentation

- [Backend Setup Guide](BACKEND_SETUP.md) - Database and API architecture
- [Real Data Integration](REAL_DATA_INTEGRATION.md) - Data loading patterns
- [API Coverage](API_COVERAGE.md) - Internal API endpoints
- [Partner API Service Code](src/services/partnerApiService.ts) - Implementation

## 🔗 Useful Commands

### Test API Endpoints
```bash
# List all countries
curl https://opmthredds.gem.spc.int/partner_api/v1/country/

# Get cyclone tracks for Samoa (country_id from above)
curl 'https://opmthredds.gem.spc.int/partner_api/v1/cyclone_track/?country=2'

# Get events for Tonga
curl 'https://opmthredds.gem.spc.int/partner_api/v1/event/?country=3'

# Get risk information
curl 'https://opmthredds.gem.spc.int/partner_api/v1/risk_information/?country=2'

# Check risk forecast endpoint
curl https://opmthredds.gem.spc.int/partner_api/v1/risk_forecast/

# Check hazard information
curl https://opmthredds.gem.spc.int/partner_api/v1/hazard_information/1/
```

### Debug API in Application
```typescript
// Add to any component
import { buildPartnerApiEndpoints } from '@/services/partnerApiService';

const endpoints = buildPartnerApiEndpoints();
console.log('Partner API Endpoints:', endpoints);

// Test specific resource
const response = await fetch(endpoints.resource.cyclone_track);
const data = await response.json();
console.log('Cyclone tracks:', data);
```

## 🎯 Conclusion

The Partner API is **already a core integration** in your Climate Risk Dashboard. It provides essential data for Pacific Island disaster risk assessment and complements your local file-based data sources.

**Relevance Score**: ⭐⭐⭐⭐⭐ (5/5) - Critical Infrastructure

**Recommendation**: Continue using this API and expand integration to include forecast, hazard, and citizen science endpoints for enhanced functionality.

---

*Last Updated*: Analysis based on codebase as of current branch state  
*API Base URL*: `https://opmthredds.gem.spc.int/partner_api/v1/`  
*Integration File*: [`src/services/partnerApiService.ts`](src/services/partnerApiService.ts)
