-- Simple database schema without PostGIS
-- Uses regular lat/lng columns instead of geometry types

-- Damaged Buildings Table
CREATE TABLE IF NOT EXISTS damaged_buildings (
    id SERIAL PRIMARY KEY,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    wind_loss NUMERIC,
    exposure NUMERIC,
    damage_ratio NUMERIC,
    building_type VARCHAR(100),
    occupancy VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_buildings_latlon ON damaged_buildings(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_buildings_wind_loss ON damaged_buildings(wind_loss);

-- Damaged Roads Table (simplified - store as line segments)
CREATE TABLE IF NOT EXISTS damaged_roads (
    id SERIAL PRIMARY KEY,
    road_name VARCHAR(255),
    damage NUMERIC,
    road_type VARCHAR(100),
    start_lat DOUBLE PRECISION,
    start_lon DOUBLE PRECISION,
    end_lat DOUBLE PRECISION,
    end_lon DOUBLE PRECISION,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_roads_latlon ON damaged_roads(start_lat, start_lon, end_lat, end_lon);

-- Regional Impacts Table
CREATE TABLE IF NOT EXISTS regional_impacts (
    id SERIAL PRIMARY KEY,
    region_name VARCHAR(255) NOT NULL,
    total_loss NUMERIC,
    max_wind_gusts NUMERIC,
    area_name VARCHAR(255),
    province VARCHAR(100),
    center_lat DOUBLE PRECISION,
    center_lon DOUBLE PRECISION,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_regions_name ON regional_impacts(region_name);

-- National Summary Table
CREATE TABLE IF NOT EXISTS national_summary (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(255) NOT NULL,
    metric_value NUMERIC,
    metric_unit VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Regional Summary Table
CREATE TABLE IF NOT EXISTS regional_summary (
    id SERIAL PRIMARY KEY,
    region_name VARCHAR(255) NOT NULL,
    metric_name VARCHAR(255),
    metric_value NUMERIC,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_regional_summary_region ON regional_summary(region_name);

-- Impact by Sector Table
CREATE TABLE IF NOT EXISTS impact_by_sector (
    id SERIAL PRIMARY KEY,
    sector_name VARCHAR(255) NOT NULL,
    total_damage NUMERIC,
    affected_assets INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cyclone Track Table
CREATE TABLE IF NOT EXISTS cyclone_track (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    wind_speed NUMERIC,
    pressure NUMERIC,
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cyclone_timestamp ON cyclone_track(timestamp);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO kishank;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO kishank;
