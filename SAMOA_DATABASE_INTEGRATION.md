# Samoa TC Gita Database Integration Summary

## Overview
Successfully migrated Samoa TC Gita data from static files to PostgreSQL database, enabling unified data management alongside Vanuatu data.

## What Was Done

### 1. Database Schema Updates ✅
- **Added columns to** `cyclone_track` table:
  - `cyclone_id` (VARCHAR) - Unique identifier for each cyclone
  - `cyclone_name` (VARCHAR) - Human-readable cyclone name
  - `forecast` (BOOLEAN) - Distinguishes historical vs forecast points
- **Note**: Using `latitude`/`longitude` columns (not PostGIS geometry) since PostGIS not installed

### 2. Data Import ✅
- **Created**: `/scripts/import-samoa-gita.js` - Node.js import script
- **Imported**: 64 track points from TC Gita (Feb 7-15, 2018)
  - 31 historical observation points
  - 33 forecast/predicted points  
  - Min pressure: 929 hPa (Category 4 cyclone!)
  - Max wind speed: 125 knots

### 3. API Route Updates ✅
- **Updated**: `/src/app/api/cyclone/route.ts`
  - Changed from PostGIS geometry query to lat/lon columns
  - Returns GeoJSON with proper Point coordinates
  - Supports filtering by `cyclone_id` parameter
  - Separates historical vs forecast data

### 4. Frontend Integration ✅
- **Updated**: `/src/utils/realDataLoader.ts`
  - Added backend API detection
  - Tries database API first, falls back to static files
  - Maps country codes to cyclone IDs:
    - `WS` (Samoa) → `TC_GITA_2018`
    - `VU` (Vanuatu) → `TC_HAROLD_2020` (placeholder)
  - Automatic failover ensures reliability

### 5. Testing & Verification ✅
- Database connection: **Working** (port 5435)
- API endpoint: **Working**  
  - Test: `curl http://localhost:3002/api/cyclone?cyclone_id=TC_GITA_2018`
- Health check: **Healthy**
  - Test: `curl http://localhost:3002/api/health`

## Database Details

### Connection Info
```
Host: localhost
Port: 5435
Database: climate_risk
User: kishank
```

### Tables in Use
- `cyclone_track` - Cyclone trajectory data (64 points for Gita)
- `damaged_buildings` - Building impacts (71,897 records)
- `damaged_roads` - Road damage assessment
- `impact_by_sector` - Sectoral impact statistics
- `national_summary` - National-level aggregates
- `regional_impacts` - Regional damage data
- `regional_summary` - Regional statistics

### Cyclone Track Schema
```sql
Column      | Type                        | Description
------------|-----------------------------|---------------------------------
id          | integer (PK)                | Auto-increment primary key
timestamp   | timestamp without time zone | Date/time of observation
latitude    | double precision            | Latitude coordinate
longitude   | double precision            | Longitude coordinate  
wind_speed  | numeric                     | Wind speed (knots)
pressure    | numeric                     | Pressure (hPa)
category    | varchar(50)                 | Cyclone category
cyclone_id  | varchar(100)                | Cyclone identifier
cyclone_name| varchar(255)                | Cyclone name
forecast    | boolean                     | Is forecast vs observed
created_at  | timestamp                   | Record creation time
```

## API Endpoints

### Get Cyclone Track
```bash
# All cyclones
GET /api/cyclone

# Specific cyclone (Samoa TC Gita)
GET /api/cyclone?cyclone_id=TC_GITA_2018

# Historical only (no forecast)
GET /api/cyclone?cyclone_id=TC_GITA_2018&include_forecast=false

# Limit results
GET /api/cyclone?cyclone_id=TC_GITA_2018&limit=100
```

### Response Format
```json
{
  "type": "FeatureCollection",
  "features": [...],
  "historical": {
    "type": "FeatureCollection",
    "features": [...],
    "count": 31
  },
  "forecast": {
    "type": "FeatureCollection",
    "features": [...],
    "count": 33
  },
  "count": 64
}
```

## How It Works

### Data Flow
```
1. Frontend calls loadCycloneTrackData('WS')
   ↓
2. Check if API available (/api/health)
   ↓
3. If API available:
   → Fetch /api/cyclone?cyclone_id=TC_GITA_2018
   → Return database data (FAST!)
   ↓
4. If API fails:
   → Load /samoa/cyclone-track-gita.geojson
   → Return static file data (FALLBACK)
```

### Benefits of Database Approach
- ✅ **Unified storage**: All countries in one database
- ✅ **Fast queries**: Indexed by cyclone_id, timestamp
- ✅ **Flexible filtering**: By date range, wind speed, category
- ✅ **Scalable**: Easy to add more cyclones/countries
- ✅ **Cached responses**: Redis caching reduces load
- ✅ **Graceful degradation**: Falls back to files if DB unavailable

## Files Created/Modified

### Created
```
/scripts/import-samoa-gita.js      - Import script for TC Gita data
/scripts/import-samoa-gita.py      - Python version (requires psycopg2)
/scripts/import-samoa-gita.sql     - SQL import script
/scripts/update-cyclone-schema.sql - Schema migration script
/SAMOA_DATABASE_INTEGRATION.md    - This document
```

### Modified
```
/src/app/api/cyclone/route.ts      - Updated to use lat/lon instead of geometry
/src/utils/realDataLoader.ts       - Added API-first data loading
/src/services/dataService.ts       - Enhanced cyclone loading functions
```

## Running the Import

To re-import or update Samoa data:

```bash
# Import TC Gita data
cd /home/kishank/Partner2
node scripts/import-samoa-gita.js
```

Expected output:
```
✓ Connected to database
🧹 Clearing existing Samoa TC Gita data...
  ✓ Cleared existing data
📊 Importing Samoa TC Gita forecast track...
  Found 64 track points
  ✓ Imported 64 track points
✔️  Verifying import...
  Total points: 64
  Historical points: 31
  Forecast points: 33
  Min pressure: 929 hPa
  Max wind speed: 125 knots
✅ Samoa TC Gita data import complete!
```

## Environment Variables

Make sure these are set in `.env.local`:

```bash
# Database Connection
DATABASE_URL=postgresql://kishank:Dcrp2024%40@localhost:5435/climate_risk

# Feature Flags (enable database usage)
NEXT_PUBLIC_USE_DATABASE=true
NEXT_PUBLIC_USE_VECTOR_TILES=true

# API Configuration
TILESERVER_URL=http://localhost:7800
NEXT_PUBLIC_TILESERVER_URL=http://localhost:7800
```

## Next Steps (Optional)

### Add More Cyclones
To add more cyclones to the database:
1. Place cyclone CSV/GeoJSON in `/public/[country]/`
2. Update `import-samoa-gita.js` with new cyclone details
3. Run import script
4. Add cyclone ID mapping in `realDataLoader.ts`

### Enable PostGIS (Future Enhancement)
If you want to use proper geometry types:
```bash
# Install PostGIS on the PostgreSQL container
docker exec -it dcrp_postgres apt-get update
docker exec -it dcrp_postgres apt-get install postgresql-16-postgis-3

# Enable extension
psql -h localhost -p 5435 -U kishank -d climate_risk \
  -c "CREATE EXTENSION postgis;"
```

### Add Vector Tiles (pg_tileserv)
For super-fast map rendering:
1. Install/configure pg_tileserv at port 7800
2. Access tiles: `http://localhost:7800/public.cyclone_track/{z}/{x}/{y}.pbf`
3. Add to MapLibre as vector tile source

## Troubleshooting

### Database Connection Failed
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Test connection
psql postgresql://kishank:Dcrp2024%40@localhost:5435/climate_risk -c "SELECT version();"
```

### API Not
 Responding
```bash
# Check Next.js dev server
curl http://localhost:3002/api/health

# Check logs
npm run dev
```

### Data Not Loading
```bash
# Verify data exists in database
psql postgresql://kishank:Dcrp2024%40@localhost:5435/climate_risk \
  -c "SELECT cyclone_id, COUNT(*) FROM cyclone_track GROUP BY cyclone_id;"
```

## References

- **Database Schema**: `/scripts/db/02-create-tables.sql`
- **API Routes**: `/src/app/api/cyclone/route.ts`
- **Data Loaders**: `/src/utils/realDataLoader.ts`
- **Import Scripts**: `/scripts/import-*.js`
- **Original Data**: `/public/samoa/Official_Forecast_Track_GITA_SA.csv`

---

**Status**: ✅ **Fully Operational**  
**Last Updated**: February 15, 2026  
**Integration**: Complete - Database + API + Frontend
