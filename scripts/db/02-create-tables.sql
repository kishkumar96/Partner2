-- Create database schema for climate risk data
-- This script creates all necessary tables with spatial indexing

-- Drop existing tables if they exist (for development)
DROP TABLE IF EXISTS damaged_buildings CASCADE;
DROP TABLE IF EXISTS damaged_roads CASCADE;
DROP TABLE IF EXISTS regional_impacts CASCADE;
DROP TABLE IF EXISTS regional_impacts_by_sector CASCADE;
DROP TABLE IF EXISTS exposure_clusters CASCADE;
DROP TABLE IF EXISTS cyclone_track CASCADE;
DROP TABLE IF EXISTS national_summary CASCADE;
DROP TABLE IF EXISTS regional_summary CASCADE;
DROP TABLE IF EXISTS impact_by_asset_type CASCADE;
DROP TABLE IF EXISTS impact_by_sector CASCADE;

-- Damaged Buildings Table
-- High-resolution building-level damage assessment
CREATE TABLE damaged_buildings (
    id SERIAL PRIMARY KEY,
    building_id VARCHAR(255),
    geom GEOMETRY(Point, 4326),
    damage_level VARCHAR(50),
    damage_state VARCHAR(50),
    replacement_cost NUMERIC,
    structural_loss NUMERIC,
    contents_loss NUMERIC,
    total_loss NUMERIC,
    occupancy_type VARCHAR(100),
    building_type VARCHAR(100),
    region VARCHAR(100),
    sector VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Damaged Roads Table
-- Road network damage assessment
CREATE TABLE damaged_roads (
    id SERIAL PRIMARY KEY,
    road_id VARCHAR(255),
    geom GEOMETRY(LineString, 4326),
    road_name VARCHAR(255),
    road_type VARCHAR(100),
    damage_level VARCHAR(50),
    length_km NUMERIC,
    repair_cost NUMERIC,
    region VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Regional Impacts Table
-- Administrative boundary-level impacts
CREATE TABLE regional_impacts (
    id SERIAL PRIMARY KEY,
    region_id VARCHAR(100),
    region_name VARCHAR(255),
    geom GEOMETRY(MultiPolygon, 4326),
    total_buildings INTEGER,
    damaged_buildings INTEGER,
    damage_ratio NUMERIC,
    total_loss NUMERIC,
    affected_population INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Regional Impacts by Sector Table
-- Sectoral breakdown by region
CREATE TABLE regional_impacts_by_sector (
    id SERIAL PRIMARY KEY,
    region_id VARCHAR(100),
    region_name VARCHAR(255),
    sector VARCHAR(100),
    geom GEOMETRY(MultiPolygon, 4326),
    total_assets INTEGER,
    damaged_assets INTEGER,
    total_loss NUMERIC,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Exposure Clusters Table
-- Geographic clustering of exposure
CREATE TABLE exposure_clusters (
    id SERIAL PRIMARY KEY,
    cluster_id VARCHAR(100),
    geom GEOMETRY(Point, 4326),
    exposure_value NUMERIC,
    building_count INTEGER,
    region VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Cyclone Track Table
-- Historical cyclone trajectory
CREATE TABLE cyclone_track (
    id SERIAL PRIMARY KEY,
    cyclone_id VARCHAR(100),
    cyclone_name VARCHAR(255),
    geom GEOMETRY(Point, 4326),
    timestamp TIMESTAMP,
    wind_speed NUMERIC,
    pressure NUMERIC,
    category VARCHAR(50),
    forecast BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- National Summary Table
-- Aggregated national statistics
CREATE TABLE national_summary (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(100),
    event_name VARCHAR(255),
    total_buildings INTEGER,
    damaged_buildings INTEGER,
    total_loss NUMERIC,
    affected_population INTEGER,
    summary_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Regional Summary Table
-- Regional-level summary statistics
CREATE TABLE regional_summary (
    id SERIAL PRIMARY KEY,
    region_id VARCHAR(100),
    region_name VARCHAR(255),
    total_buildings INTEGER,
    damaged_buildings INTEGER,
    total_loss NUMERIC,
    affected_population INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Impact by Asset Type Table
-- Breakdown by asset categories
CREATE TABLE impact_by_asset_type (
    id SERIAL PRIMARY KEY,
    asset_type VARCHAR(100),
    total_assets INTEGER,
    damaged_assets INTEGER,
    total_loss NUMERIC,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Impact by Sector Table
-- Economic sector-level impacts
CREATE TABLE impact_by_sector (
    id SERIAL PRIMARY KEY,
    sector VARCHAR(100),
    total_assets INTEGER,
    damaged_assets INTEGER,
    total_loss NUMERIC,
    gdp_impact NUMERIC,
    jobs_affected INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create spatial indexes for geometry columns
CREATE INDEX idx_buildings_geom ON damaged_buildings USING GIST (geom);
CREATE INDEX idx_roads_geom ON damaged_roads USING GIST (geom);
CREATE INDEX idx_regional_impacts_geom ON regional_impacts USING GIST (geom);
CREATE INDEX idx_regional_sector_geom ON regional_impacts_by_sector USING GIST (geom);
CREATE INDEX idx_exposure_geom ON exposure_clusters USING GIST (geom);
CREATE INDEX idx_cyclone_geom ON cyclone_track USING GIST (geom);

-- Create attribute indexes for common queries
CREATE INDEX idx_buildings_damage ON damaged_buildings(damage_level);
CREATE INDEX idx_buildings_region ON damaged_buildings(region);
CREATE INDEX idx_roads_region ON damaged_roads(region);
CREATE INDEX idx_regional_impacts_region ON regional_impacts(region_id);
CREATE INDEX idx_sector_impacts_sector ON regional_impacts_by_sector(sector);

-- Add comments for documentation
COMMENT ON TABLE damaged_buildings IS 'Building-level damage assessment data';
COMMENT ON TABLE damaged_roads IS 'Road network damage data';
COMMENT ON TABLE regional_impacts IS 'Regional administrative boundary impacts';
COMMENT ON TABLE cyclone_track IS 'Historical cyclone trajectory points';

-- Grant permissions (adjust as needed)
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
