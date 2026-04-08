#!/usr/bin/env node

/**
 * Import Samoa Regional Impact Data into PostgreSQL
 * 
 * This script imports:
 * - regional-impacts.geojson → regional_impacts table
 * - regional-impacts-by-sector.geojson → impact_by_sector table  
 * 
 * Run: node scripts/import-samoa-regional-impacts.js
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Database connection
const connectionString = process.env.DATABASE_URL || 
  'postgresql://kishank:Dcrp2024%40@localhost:5435/climate_risk';

async function importRegionalImpacts() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Read GeoJSON files
    const regionalImpactsPath = path.join(__dirname, '../public/samoa/regional-impacts.geojson');
    const regionalImpactsBySectorPath = path.join(__dirname, '../public/samoa/regional-impacts-by-sector.geojson');
    
    const regionalImpactsData = JSON.parse(fs.readFileSync(regionalImpactsPath, 'utf8'));
    const bySectorData = JSON.parse(fs.readFileSync(regionalImpactsBySectorPath, 'utf8'));
    
    console.log(`📊 Loaded ${regionalImpactsData.features.length} regional impact records`);
    console.log(`📊 Loaded ${bySectorData.features.length} sector impact records`);

    // Extend table schema to support detailed Samoa data
    await client.query(`ALTER TABLE regional_impacts ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) DEFAULT 'VU'`);
    await client.query(`ALTER TABLE regional_impacts ADD COLUMN IF NOT EXISTS region VARCHAR(255)`);
    await client.query(`ALTER TABLE regional_impacts ADD COLUMN IF NOT EXISTS total_population INTEGER`);
    await client.query(`ALTER TABLE regional_impacts ADD COLUMN IF NOT EXISTS damaged_buildings INTEGER`);
    await client.query(`ALTER TABLE regional_impacts ADD COLUMN IF NOT EXISTS total_buildings INTEGER`);
    await client.query(`ALTER TABLE regional_impacts ADD COLUMN IF NOT EXISTS building_loss NUMERIC`);
    await client.query(`ALTER TABLE regional_impacts ADD COLUMN IF NOT EXISTS road_loss NUMERIC`);
    await client.query(`ALTER TABLE regional_impacts ADD COLUMN IF NOT EXISTS infrastructure_loss NUMERIC`);
    await client.query(`ALTER TABLE regional_impacts ADD COLUMN IF NOT EXISTS crop_loss NUMERIC`);
    await client.query(`ALTER TABLE regional_impacts ADD COLUMN IF NOT EXISTS total_value NUMERIC`);
    await client.query(`ALTER TABLE regional_impacts ADD COLUMN IF NOT EXISTS exposed_population INTEGER`);
    await client.query(`ALTER TABLE regional_impacts ADD COLUMN IF NOT EXISTS damaged_road_km NUMERIC`);
    await client.query(`ALTER TABLE regional_impacts ADD COLUMN IF NOT EXISTS total_road_km NUMERIC`);
    await client.query(`ALTER TABLE regional_impacts ADD COLUMN IF NOT EXISTS geometry_json TEXT`);
    
    await client.query(`ALTER TABLE impact_by_sector ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) DEFAULT 'VU'`);
    await client.query(`ALTER TABLE impact_by_sector ADD COLUMN IF NOT EXISTS region VARCHAR(255)`);
    await client.query(`ALTER TABLE impact_by_sector ADD COLUMN IF NOT EXISTS sector VARCHAR(100)`);
    await client.query(`ALTER TABLE impact_by_sector ADD COLUMN IF NOT EXISTS total_loss NUMERIC`);
    await client.query(`ALTER TABLE impact_by_sector ADD COLUMN IF NOT EXISTS damaged_buildings INTEGER`);
    await client.query(`ALTER TABLE impact_by_sector ADD COLUMN IF NOT EXISTS building_loss NUMERIC`);
    await client.query(`ALTER TABLE impact_by_sector ADD COLUMN IF NOT EXISTS road_loss NUMERIC`);
    await client.query(`ALTER TABLE impact_by_sector ADD COLUMN IF NOT EXISTS infrastructure_loss NUMERIC`);
    await client.query(`ALTER TABLE impact_by_sector ADD COLUMN IF NOT EXISTS crop_loss NUMERIC`);
    await client.query(`ALTER TABLE impact_by_sector ADD COLUMN IF NOT EXISTS exposed_population INTEGER`);
    
    // Create unique constraint for Samoa data (must come before we use ON CONFLICT)
    try {
      // Drop existing index if it exists with wrong WHERE clause
      await client.query(`DROP INDEX IF EXISTS idx_regional_impacts_country_region`);
      await client.query(`DROP INDEX IF EXISTS idx_impact_sector_country_region_sector`);
      
      // Recreate without WHERE clause so it can be used in ON CONFLICT
      await client.query(`
        CREATE UNIQUE INDEX idx_regional_impacts_country_region 
        ON regional_impacts(country_code, region)`);
      
      await client.query(`
        CREATE UNIQUE INDEX idx_impact_sector_country_region_sector 
        ON impact_by_sector(country_code, region, sector)`);
        
      console.log('✅ Created unique indexes');
    } catch (err) {
      console.log('⚠️  Indexes might already exist:', err.message);
    }
    
    console.log('✅ Updated table schemas');

    // Import regional_impacts
    let importedRegional = 0;
    for (const feature of regionalImpactsData.features) {
      const props = feature.properties;
      const geom = feature.geometry;
      
      // Convert geometry to WKT-like format (simplified - just store as JSON for now)
      const geomJson = JSON.stringify(geom);
      
      const query = `
        INSERT INTO regional_impacts (
          country_code, region, region_name, total_loss, total_population, damaged_buildings,
          total_buildings, building_loss, road_loss, infrastructure_loss,
          crop_loss, total_value, exposed_population, damaged_road_km,
          total_road_km, geometry_json
        ) VALUES (
          $1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
        ON CONFLICT (country_code, region) 
        DO UPDATE SET
          region_name = EXCLUDED.region_name,
          total_loss = EXCLUDED.total_loss,
          total_population = EXCLUDED.total_population,
          damaged_buildings = EXCLUDED.damaged_buildings,
          total_buildings = EXCLUDED.total_buildings,
          building_loss = EXCLUDED.building_loss,
          road_loss = EXCLUDED.road_loss,
          infrastructure_loss = EXCLUDED.infrastructure_loss,
          crop_loss = EXCLUDED.crop_loss,
          total_value = EXCLUDED.total_value,
          exposed_population = EXCLUDED.exposed_population,
          damaged_road_km = EXCLUDED.damaged_road_km,
          total_road_km = EXCLUDED.total_road_km,
          geometry_json = EXCLUDED.geometry_json
      `;
      
      await client.query(query, [
        'WS', // Samoa country code
        props['Region.Region'] || props.Region,
        props.Total_Loss || 0,
        props.Total_Population || 0,
        props.Damaged_Buildings || 0,
        props.Total_Buildings || 0,
        props.Building_Loss || 0,
        props.Road_Loss || 0,
        props.Infrastructure_Loss || 0,
        props.Crop_Loss || 0,
        props.Total_Value || 0,
        props.Population_Exposed_To_Any_Hazard || 0,
        props.Damaged_Road_km || 0,
        props.Total_Road_km || 0,
        geomJson
      ]);
      
      importedRegional++;
    }
    
    console.log(`✅ Imported ${importedRegional} regional impact records`);

    // Import impact_by_sector (transform from wide to long format)
    let importedSector = 0;
    const sectors = ['Education', 'Health', 'Transport', 'Residential', 'Commercial', 'Industrial', 'Agriculture', 'Infrastructure'];
    
    for (const feature of bySectorData.features) {
      const props = feature.properties;
      const region = props.Region || props['Region.Region'];
      
      // Extract data for each sector - import all sectors even with 0 values
      for (const sector of sectors) {
        const prefix = `Sector.${sector}.`;
        const totalLoss = props[`${prefix}Loss`] || 0;
        const buildingLoss = props[`${prefix}Building_Loss`] || 0;
        const roadLoss = props[`${prefix}Road_Loss`] || 0;
        const infrastructureLoss = props[`${prefix}Infrastructure_Loss`] || 0;
        const cropLoss = props[`${prefix}Crop_Loss`] || 0;
        const damagedBuildings = props[`${prefix}Number_Damaged_Buildings`] || 0;
        const exposedPop = props[`${prefix}Population_Exposed_To_Any_Hazard`] || 0;
        
        const query = `
          INSERT INTO impact_by_sector (
            country_code, region, sector, sector_name, total_loss, damaged_buildings,
            building_loss, road_loss, infrastructure_loss, crop_loss,
            exposed_population
          ) VALUES (
            $1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10
          )
          ON CONFLICT (country_code, region, sector)
          DO UPDATE SET
            sector_name = EXCLUDED.sector_name,
            total_loss = EXCLUDED.total_loss,
            damaged_buildings = EXCLUDED.damaged_buildings,
            building_loss = EXCLUDED.building_loss,
            road_loss = EXCLUDED.road_loss,
            infrastructure_loss = EXCLUDED.infrastructure_loss,
            crop_loss = EXCLUDED.crop_loss,
            exposed_population = EXCLUDED.exposed_population
        `;
        
        await client.query(query, [
          'WS', // Samoa country code
          region,
          sector,
          totalLoss,
          damagedBuildings,
          buildingLoss,
          roadLoss,
          infrastructureLoss,
          cropLoss,
          exposedPop
        ]);
        
        importedSector++;
      }
    }
    
    console.log(`✅ Imported ${importedSector} sector impact records`);

    // Verify imports
    const regionalCount = await client.query(
      "SELECT COUNT(*) FROM regional_impacts WHERE country_code = 'WS'"
    );
    const sectorCount = await client.query(
      "SELECT COUNT(*) FROM impact_by_sector WHERE country_code = 'WS'"
    );
    
    console.log('\n📈 Verification:');
    console.log(`   Regional impacts (Samoa): ${regionalCount.rows[0].count}`);
    console.log(`   Sector impacts (Samoa): ${sectorCount.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
    console.log('\n✅ Database connection closed');
  }
}

// Run import
importRegionalImpacts()
  .then(() => {
    console.log('\n🎉 Samoa data import completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Import failed:', error);
    process.exit(1);
  });
