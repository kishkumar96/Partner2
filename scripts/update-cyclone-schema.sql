-- Add missing columns to cyclone_track table for multiple cyclones support

-- Add cyclone identifier columns
ALTER TABLE cyclone_track 
ADD COLUMN IF NOT EXISTS cyclone_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS cyclone_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS forecast BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS geom GEOMETRY(Point, 4326);

-- Update geom from existing lat/lon data
UPDATE cyclone_track 
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE geom IS NULL;

-- For existing data, set a default cyclone_id
UPDATE cyclone_track 
SET cyclone_id = 'TC_HAROLD_2020',
    cyclone_name = 'Harold',
    forecast = FALSE
WHERE cyclone_id IS NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cyclone_id ON cyclone_track(cyclone_id);
CREATE INDEX IF NOT EXISTS idx_cyclone_geom ON cyclone_track USING GIST(geom);

SELECT 'Schema updated successfully' as status;
