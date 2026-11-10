-- Import Samoa TC Gita data into PostgreSQL
-- This script reads the CSV data and imports it into cyclone_track table

-- First, clear any existing Gita data
DELETE FROM cyclone_track WHERE cyclone_id = 'TC_GITA_2018' OR cyclone_name = 'Gita';

-- Create a temporary table to hold CSV data
CREATE TEMP TABLE temp_gita_track (
    timestamp_str TEXT,
    latitude TEXT,
    longitude TEXT,
    symbol TEXT,
    category TEXT,
    pressure TEXT,
    mean_wind TEXT
);

-- Copy data from CSV (you'll need to run this with \copy command)
-- \copy temp_gita_track(timestamp_str,latitude,longitude,symbol,category,pressure,mean_wind) FROM '/home/kishank/Partner2/public/samoa/Official_Forecast_Track_GITA_SA.csv' WITH (FORMAT csv, HEADER true, DELIMITER ',');

-- Insert parsed data into cyclone_track
INSERT INTO cyclone_track (
    cyclone_id,
    cyclone_name,
    geom,
    timestamp,
    wind_speed,
    pressure,
    category,
    forecast
)
SELECT 
    'TC_GITA_2018' as cyclone_id,
    'Gita' as cyclone_name,
    ST_SetSRID(
        ST_MakePoint(
            CASE 
                WHEN longitude::numeric > 180 THEN longitude::numeric - 360
                ELSE longitude::numeric 
            END,
            latitude::numeric
        ), 
        4326
    ) as geom,
    timestamp_str::timestamp as timestamp,
    CASE 
        WHEN mean_wind = 'NaN' OR mean_wind = '' THEN NULL 
        ELSE mean_wind::numeric 
    END as wind_speed,
    CASE 
        WHEN pressure = 'NaN' OR pressure = '' THEN NULL 
        ELSE pressure::numeric 
    END as pressure,
    COALESCE(category, '-3') as category,
    (timestamp_str::timestamp > '2018-02-10 12:00:00'::timestamp) as forecast
FROM temp_gita_track
WHERE latitude IS NOT NULL 
  AND longitude IS NOT NULL
ORDER BY timestamp_str::timestamp;

-- Show import summary
SELECT 
    COUNT(*) as total_points,
    COUNT(*) FILTER (WHERE forecast = false) as historical_points,
    COUNT(*) FILTER (WHERE forecast = true) as forecast_points,
    MIN(timestamp) as first_point,
    MAX(timestamp) as last_point,
    MIN(pressure) as min_pressure,
    MAX(wind_speed) as max_wind_speed
FROM cyclone_track
WHERE cyclone_id = 'TC_GITA_2018';

-- Cleanup
DROP TABLE temp_gita_track;
