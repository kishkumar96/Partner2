#!/usr/bin/env node
/**
 * Import Samoa TC Gita data into PostgreSQL database
 * 
 * Usage:
 *   node scripts/import-samoa-gita.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Suppress warnings
process.removeAllListeners('warning');

// Database connection - use port 5435 for actual database
const DATABASE_URL = process.env.DATABASE_URL || 
  'postgresql://kishank:Dcrp2024%40@localhost:5435/climate_risk';

// Data file paths
const DATA_DIR = path.join(__dirname, '..', 'public', 'samoa');
const TRACK_FILE = path.join(DATA_DIR, 'cyclone-track-gita.geojson');
const FORECAST_FILE = path.join(DATA_DIR, 'Official_Forecast_Track_GITA_SA.csv');

class SamoaDataImporter {
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

  async clearSamoaData() {
    console.log('\n🧹 Clearing existing Samoa TC Gita data...');
    // Check if cyclone_id column exists, otherwise just clear all (assuming single cyclone)
    try {
      await this.client.query(`
        ALTER TABLE cyclone_track 
        ADD COLUMN IF NOT EXISTS cyclone_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS cyclone_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS forecast BOOLEAN DEFAULT FALSE
      `);
      await this.client.query(`
        DELETE FROM cyclone_track 
        WHERE cyclone_id = 'TC_GITA_2018' OR cyclone_name = 'Gita'
      `);
    } catch (err) {
      // If ALTER fails, just truncate the table
      await this.client.query(`TRUNCATE TABLE cyclone_track RESTART IDENTITY`);
    }
    console.log('  ✓ Cleared existing data');
  }

  async importForecastTrack() {
    console.log('\n📊 Importing Samoa TC Gita forecast track...');
    
    if (!fs.existsSync(FORECAST_FILE)) {
      console.log('  ⚠ Forecast file not found');
      return;
    }

    const fileContent = fs.readFileSync(FORECAST_FILE, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    });

    console.log(`  Found ${records.length} track points`);

    let imported = 0;
    let errors = 0;

    for (const record of records) {
      try {
        const timestamp = record['Time[fmt=yyyy-MM-dd\'T\'HH:mm:ss\'Z\']'];
        const lat = parseFloat(record.Latitude);
        const lon = parseFloat(record.Longitude);
        
        // Normalize longitude to -180 to 180 range
        let normalizedLon = lon;
        if (lon > 180) {
          normalizedLon = lon - 360;
        }
        
        const pressure = record.Pressure && record.Pressure !== 'NaN' ? 
          parseFloat(record.Pressure) : null;
        const windSpeed = record.MeanWind && record.MeanWind !== 'NaN' ? 
          parseFloat(record.MeanWind) : null;
        const category = record.Category || '-3';
        
        // Determine if this is a forecast point (after 2018-02-10 12:00)
        const isForecast = new Date(timestamp) > new Date('2018-02-10T12:00:00Z');

        const query = `
          INSERT INTO cyclone_track (
            timestamp, 
            latitude,
            longitude,
            wind_speed, 
            pressure, 
            category,
            cyclone_id,
            cyclone_name,
            forecast
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9
          )
        `;

        await this.client.query(query, [
          timestamp,
          lat,
          normalizedLon,
          windSpeed,
          pressure,
          category,
          'TC_GITA_2018',
          'Gita',
          isForecast
        ]);
        
        imported++;
        
        if (imported % 10 === 0) {
          process.stdout.write(`\r  Progress: ${imported}/${records.length}`);
        }
      } catch (error) {
        errors++;
        if (errors < 5) {
          console.error(`\n  ✗ Error importing point at ${record.Latitude},${record.Longitude}:`, error.message);
        }
      }
    }

    console.log(`\n  ✓ Imported ${imported} track points`);
    if (errors > 0) {
      console.log(`  ⚠ ${errors} errors encountered`);
    }
  }

  async verifyImport() {
    console.log('\n✔️  Verifying import...');
    
    try {
      const countResult = await this.client.query(`
        SELECT 
          COUNT(*) as total_points,
          COUNT(*) FILTER (WHERE forecast = false) as historical_points,
          COUNT(*) FILTER (WHERE forecast = true) as forecast_points,
          MIN(timestamp) as first_point,
          MAX(timestamp) as last_point,
          MIN(pressure) as min_pressure,
          MAX(wind_speed) as max_wind_speed
        FROM cyclone_track
        WHERE cyclone_id = 'TC_GITA_2018'
      `);

      const stats = countResult.rows[0];
      console.log(`  Total points: ${stats.total_points}`);
      console.log(`  Historical points: ${stats.historical_points}`);
      console.log(`  Forecast points: ${stats.forecast_points}`);
      console.log(`  Time range: ${stats.first_point} to ${stats.last_point}`);
      console.log(`  Min pressure: ${stats.min_pressure} hPa`);
      console.log(`  Max wind speed: ${stats.max_wind_speed} knots`);
    } catch (err) {
      // Fallback if cyclone_id column doesn't exist
      const countResult = await this.client.query(`
        SELECT 
          COUNT(*) as total_points,
          MIN(timestamp) as first_point,
          MAX(timestamp) as last_point,
          MIN(pressure) as min_pressure,
          MAX(wind_speed) as max_wind_speed
        FROM cyclone_track
      `);

      const stats = countResult.rows[0];
      console.log(`  Total points: ${stats.total_points}`);
      console.log(`  Time range: ${stats.first_point} to ${stats.last_point}`);
      console.log(`  Min pressure: ${stats.min_pressure} hPa`);
      console.log(`  Max wind_speed: ${stats.max_wind_speed} knots`);
    }
  }

  async run() {
    try {
      await this.connect();
      await this.clearSamoaData();
      await this.importForecastTrack();
      await this.verifyImport();
      
      console.log('\n✅ Samoa TC Gita data import complete!');
      console.log('\n📍 You can now query the data with:');
      console.log('   curl http://localhost:3002/api/cyclone?cyclone_id=TC_GITA_2018');
    } catch (error) {
      console.error('\n❌ Import failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }
}

// Run the importer
const importer = new SamoaDataImporter();
importer.run();
