-- Initialize PostGIS and required extensions
-- This script runs automatically when the PostgreSQL container starts

-- Enable PostGIS (includes geometry and geography types)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable PostGIS Topology
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Enable PostGIS Raster
CREATE EXTENSION IF NOT EXISTS postgis_raster;

-- Enable fuzzy string matching (useful for location searches)
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- Enable address standardizer
CREATE EXTENSION IF NOT EXISTS address_standardizer;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Verify PostGIS is installed correctly
SELECT PostGIS_Full_Version();
