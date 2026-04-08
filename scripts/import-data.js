#!/usr/bin/env node
/**
 * Data Import Script
 * Imports GeoJSON and CSV files into PostgreSQL/PostGIS database
 * 
 * Usage:
 *   node scripts/import-data.js
 * 
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Database connection
const DATABASE_URL = process.env.DATABASE_URL || 
  'postgresql://postgres:climate_secure_2026@localhost:5432/climate_risk';

// Data file paths
const DATA_DIR = path.join(__dirname, '..', 'public');

const FILES = {
  buildings: 'damaged-buildings.geojson',
  roads: 'damaged-roads.geojson',
  regionalImpacts: 'regional-impacts.geojson',
  regionalSector: 'regional-impacts-by-sector.geojson',
  exposureClusters: 'exposure-by-cluster.geojson',
  cycloneTrack: 'cyclone-track.geojson',
  nationalSummary: 'national-summary.csv',
  regionalSummary: 'regional-summary.csv',
  impactAssetType: 'impact-by-asset-type.csv',
  impactSector: 'impact-by-sector.csv',
};

class DataImporter {
  constructor() {
    this.client = null;
  }

  async connect() {
    this.client = new Client({ connectionString: DATABASE_URL });
    await this.client.connect();
    console.log('✓ Connected to database');
  }

  async disconnect() {
    if (this.client) {
      await this.client.end();
      console.log('✓ Disconnected from database');
    }
  }

  async clearTables() {
    console.log('\n📦 Clearing existing data...');
    const tables = [
      'damaged_buildings',
      'damaged_roads',
      'regional_impacts',
      'regional_impacts_by_sector',
      'exposure_clusters',
      'cyclone_track',
      'national_summary',
      'regional_summary',
      'impact_by_asset_type',
      'impact_by_sector',
    ];

    for (const table of tables) {
      await this.client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
      console.log(`  ✓ Cleared ${table}`);
    }
  }

  async importGeoJSON(filename, tableName, mapping) {
    const filePath = path.join(DATA_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠ File not found: ${filename}`);
      return;
    }

    console.log(`\n📍 Importing ${filename}...`);
    const startTime = Date.now();
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const features = data.features || [];
    
    console.log(`  Found ${features.length} features`);

    let imported = 0;
    let errors = 0;

    // Batch insert for better performance
    const batchSize = 1000;
    for (let i = 0; i < features.length; i += batchSize) {
      const batch = features.slice(i, Math.min(i + batchSize, features.length));
      
      for (const feature of batch) {
        try {
          const props = feature.properties || {};
          const geom = feature.geometry;

          // Build insert query dynamically based on mapping
          const columns = ['geom'];
          const values = [`ST_GeomFromGeoJSON('${JSON.stringify(geom)}')`];
          let paramIndex = 1;

          for (const [dbColumn, propKey] of Object.entries(mapping)) {
            if (props[propKey] !== undefined) {
              columns.push(dbColumn);
              values.push(`$${paramIndex++}`);
            }
          }

          const query = `
            INSERT INTO ${tableName} (${columns.join(', ')})
            VALUES (${values.join(', ')})
          `;

          const params = Object.entries(mapping)
            .map(([_, propKey]) => props[propKey])
            .filter(v => v !== undefined);

          await this.client.query(query, params);
          imported++;
        } catch (error) {
          errors++;
          if (errors < 5) {
            console.error(`  ✗ Error importing feature:`, error.message);
          }
        }
      }

      if ((i + batchSize) % 5000 === 0) {
        console.log(`  Progress: ${Math.min(i + batchSize, features.length)}/${features.length}`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  ✓ Imported ${imported} features in ${duration}s`);
    if (errors > 0) {
      console.log(`  ⚠ ${errors} errors encountered`);
    }
  }

  async importCSV(filename, tableName, mapping) {
    const filePath = path.join(DATA_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠ File not found: ${filename}`);
      return;
    }

    console.log(`\n📊 Importing ${filename}...`);
    const startTime = Date.now();
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    });

    console.log(`  Found ${records.length} records`);

    let imported = 0;
    let errors = 0;

    for (const record of records) {
      try {
        const columns = [];
        const values = [];
        let paramIndex = 1;

        for (const [dbColumn, csvColumn] of Object.entries(mapping)) {
          if (record[csvColumn] !== undefined && record[csvColumn] !== '') {
            columns.push(dbColumn);
            values.push(`$${paramIndex++}`);
          }
        }

        const query = `
          INSERT INTO ${tableName} (${columns.join(', ')})
          VALUES (${values.join(', ')})
        `;

        const params = Object.entries(mapping)
          .map(([_, csvColumn]) => record[csvColumn])
          .filter(v => v !== undefined && v !== '');

        await this.client.query(query, params);
        imported++;
      } catch (error) {
        errors++;
        if (errors < 5) {
          console.error(`  ✗ Error importing record:`, error.message);
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  ✓ Imported ${imported} records in ${duration}s`);
    if (errors > 0) {
      console.log(`  ⚠ ${errors} errors encountered`);
    }
  }

  async refreshViews() {
    console.log('\n🔄 Refreshing materialized views...');
    try {
      await this.client.query('SELECT refresh_all_views()');
      console.log('  ✓ All views refreshed');
    } catch (error) {
      console.error('  ✗ Error refreshing views:', error.message);
    }
  }

  async run() {
    try {
      await this.connect();
      await this.clearTables();

      // Import buildings
      await this.importGeoJSON(FILES.buildings, 'damaged_buildings', {
        building_id: 'id',
        damage_level: 'damage_level',
        damage_state: 'damage_state',
        replacement_cost: 'replacement_cost',
        structural_loss: 'structural_loss',
        contents_loss: 'contents_loss',
        total_loss: 'total_loss',
        occupancy_type: 'occupancy_type',
        building_type: 'building_type',
        region: 'region',
        sector: 'sector',
      });

      // Import roads
      await this.importGeoJSON(FILES.roads, 'damaged_roads', {
        road_id: 'id',
        road_name: 'name',
        road_type: 'type',
        damage_level: 'damage_level',
        length_km: 'length_km',
        repair_cost: 'repair_cost',
        region: 'region',
      });

      // Import regional impacts
      await this.importGeoJSON(FILES.regionalImpacts, 'regional_impacts', {
        region_id: 'region_id',
        region_name: 'name',
        total_buildings: 'total_buildings',
        damaged_buildings: 'damaged_buildings',
        damage_ratio: 'damage_ratio',
        total_loss: 'total_loss',
        affected_population: 'population',
      });

      // Import regional impacts by sector
      await this.importGeoJSON(FILES.regionalSector, 'regional_impacts_by_sector', {
        region_id: 'region_id',
        region_name: 'name',
        sector: 'sector',
        total_assets: 'total_assets',
        damaged_assets: 'damaged_assets',
        total_loss: 'total_loss',
      });

      // Import exposure clusters
      await this.importGeoJSON(FILES.exposureClusters, 'exposure_clusters', {
        cluster_id: 'cluster_id',
        exposure_value: 'exposure_value',
        building_count: 'building_count',
        region: 'region',
      });

      // Import cyclone track
      await this.importGeoJSON(FILES.cycloneTrack, 'cyclone_track', {
        cyclone_id: 'id',
        cyclone_name: 'name',
        timestamp: 'timestamp',
        wind_speed: 'wind_speed',
        pressure: 'pressure',
        category: 'category',
        forecast: 'forecast',
      });

      // Import CSV files
      await this.importCSV(FILES.nationalSummary, 'national_summary', {
        event_id: 'event_id',
        event_name: 'event_name',
        total_buildings: 'total_buildings',
        damaged_buildings: 'damaged_buildings',
        total_loss: 'total_loss',
        affected_population: 'affected_population',
        summary_date: 'date',
      });

      await this.importCSV(FILES.regionalSummary, 'regional_summary', {
        region_id: 'region_id',
        region_name: 'region_name',
        total_buildings: 'total_buildings',
        damaged_buildings: 'damaged_buildings',
        total_loss: 'total_loss',
        affected_population: 'affected_population',
      });

      await this.importCSV(FILES.impactAssetType, 'impact_by_asset_type', {
        asset_type: 'asset_type',
        total_assets: 'total_assets',
        damaged_assets: 'damaged_assets',
        total_loss: 'total_loss',
      });

      await this.importCSV(FILES.impactSector, 'impact_by_sector', {
        sector: 'sector',
        total_assets: 'total_assets',
        damaged_assets: 'damaged_assets',
        total_loss: 'total_loss',
        gdp_impact: 'gdp_impact',
        jobs_affected: 'jobs_affected',
      });

      // Refresh materialized views
      await this.refreshViews();

      console.log('\n✅ Import completed successfully!');
      
    } catch (error) {
      console.error('\n❌ Import failed:', error);
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }
}

// Run import
if (require.main === module) {
  const importer = new DataImporter();
  importer.run().catch(console.error);
}

module.exports = DataImporter;
