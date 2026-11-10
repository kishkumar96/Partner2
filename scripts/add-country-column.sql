-- Add country columns to support multi-country data
-- Run with: psql -d climate_risk -f scripts/add-country-column.sql

-- Add country column to damaged_buildings
ALTER TABLE damaged_buildings 
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) DEFAULT 'VU';

-- Add country column to damaged_roads
ALTER TABLE damaged_roads 
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) DEFAULT 'VU';

-- Add country column to cyclone_track (if not already exists)
ALTER TABLE cyclone_track 
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

-- Update existing Vanuatu records
UPDATE damaged_buildings SET country_code = 'VU' WHERE country_code IS NULL;
UPDATE damaged_roads SET country_code = 'VU' WHERE country_code IS NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_buildings_country ON damaged_buildings(country_code);
CREATE INDEX IF NOT EXISTS idx_roads_country ON damaged_roads(country_code);
CREATE INDEX IF NOT EXISTS idx_cyclone_country ON cyclone_track(country_code) WHERE country_code IS NOT NULL;

-- Create combined indexes for spatial + country queries
CREATE INDEX IF NOT EXISTS idx_buildings_country_latlon ON damaged_buildings(country_code, latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_roads_country_latlon ON damaged_roads(country_code, start_lat, start_lon);

COMMIT;

-- Show updated table structures
\d damaged_buildings;
\d damaged_roads;

SELECT 'Migration completed successfully!' AS status;
