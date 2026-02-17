-- Create materialized views for common queries and vector tiles
-- These views optimize performance by pre-computing common aggregations

-- View: Buildings by damage level with simplified geometry
CREATE MATERIALIZED VIEW buildings_by_damage AS
SELECT 
    damage_level,
    COUNT(*) as building_count,
    SUM(total_loss) as total_loss,
    region,
    ST_Centroid(ST_Collect(geom)) as centroid
FROM damaged_buildings
GROUP BY damage_level, region;

CREATE INDEX idx_buildings_damage_geom ON buildings_by_damage USING GIST (centroid);

-- View: Regional summary with geometry
CREATE MATERIALIZED VIEW regional_summary_geo AS
SELECT 
    ri.region_id,
    ri.region_name,
    ri.geom,
    ri.total_buildings,
    ri.damaged_buildings,
    ri.total_loss,
    ri.damage_ratio,
    COUNT(DISTINCT ris.sector) as sector_count,
    SUM(ris.total_loss) as sectoral_loss_total
FROM regional_impacts ri
LEFT JOIN regional_impacts_by_sector ris ON ri.region_id = ris.region_id
GROUP BY ri.region_id, ri.region_name, ri.geom, ri.total_buildings, 
         ri.damaged_buildings, ri.total_loss, ri.damage_ratio;

CREATE INDEX idx_regional_summary_geom ON regional_summary_geo USING GIST (geom);

-- View: Simplified buildings for faster rendering at low zoom levels
CREATE MATERIALIZED VIEW buildings_simplified AS
SELECT 
    id,
    building_id,
    ST_SnapToGrid(geom, 0.001) as geom,  -- Simplify to ~100m grid
    damage_level,
    total_loss,
    region
FROM damaged_buildings
WHERE damage_level IN ('Severe', 'Major', 'Moderate');  -- Only show significant damage

CREATE INDEX idx_buildings_simplified_geom ON buildings_simplified USING GIST (geom);

-- View: Clustered exposure points for overview map
CREATE MATERIALIZED VIEW exposure_overview AS
SELECT 
    cluster_id,
    geom,
    exposure_value,
    building_count,
    region
FROM exposure_clusters
WHERE exposure_value > 1000000;  -- Only show high-value clusters

CREATE INDEX idx_exposure_overview_geom ON exposure_overview USING GIST (geom);

-- View: Active cyclone track with forecast
CREATE MATERIALIZED VIEW cyclone_latest AS
SELECT 
    cyclone_id,
    cyclone_name,
    geom,
    timestamp,
    wind_speed,
    category,
    forecast
FROM cyclone_track
ORDER BY timestamp DESC;

CREATE INDEX idx_cyclone_latest_geom ON cyclone_latest USING GIST (geom);

-- View: Roads by damage level
CREATE MATERIALIZED VIEW roads_by_damage AS
SELECT 
    damage_level,
    COUNT(*) as road_count,
    SUM(length_km) as total_km,
    SUM(repair_cost) as total_cost,
    region,
    ST_Union(geom) as geom
FROM damaged_roads
GROUP BY damage_level, region;

CREATE INDEX idx_roads_damage_geom ON roads_by_damage USING GIST (geom);

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_all_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY buildings_by_damage;
    REFRESH MATERIALIZED VIEW CONCURRENTLY regional_summary_geo;
    REFRESH MATERIALIZED VIEW CONCURRENTLY buildings_simplified;
    REFRESH MATERIALIZED VIEW CONCURRENTLY exposure_overview;
    REFRESH MATERIALIZED VIEW CONCURRENTLY cyclone_latest;
    REFRESH MATERIALIZED VIEW CONCURRENTLY roads_by_damage;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON MATERIALIZED VIEW buildings_by_damage IS 'Aggregated building damage by level and region';
COMMENT ON MATERIALIZED VIEW regional_summary_geo IS 'Regional impacts with geometry for mapping';
COMMENT ON MATERIALIZED VIEW buildings_simplified IS 'Simplified building points for low-zoom rendering';
