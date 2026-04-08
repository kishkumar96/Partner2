/**
 * Simple data import script for PostgreSQL (without PostGIS)
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const DATABASE_URL = process.env.DATABASE_URL || 
  'postgresql://kishank:Dcrp2024%40@localhost:5435/climate_risk';

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  console.log('🔌 Connecting to database...');
  await client.connect();
  console.log('✅ Connected!');

  try {
    // Import damaged buildings
    console.log('\n📦 Importing damaged buildings...');
    const buildingsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../public/damaged-buildings.geojson'), 'utf8')
    );
    
    let buildingCount = 0;
    for (const feature of buildingsData.features) {
      const { geometry } = feature;
      const props = feature.properties;
      
      // Handle different geometry types
      let longitude, latitude;
      if (geometry.type === 'Point') {
        [longitude, latitude] = geometry.coordinates;
      } else if (geometry.type === 'Polygon' && geometry.coordinates[0]) {
        // Calculate centroid of polygon
        const coords = geometry.coordinates[0];
        longitude = coords.reduce((sum, coord) => sum + coord[0], 0) / coords.length;
        latitude = coords.reduce((sum, coord) => sum + coord[1], 0) / coords.length;
      } else if (geometry.type === 'MultiPolygon' && geometry.coordinates[0]?.[0]) {
        // Use first polygon's centroid
        const coords = geometry.coordinates[0][0];
        longitude = coords.reduce((sum, coord) => sum + coord[0], 0) / coords.length;
        latitude = coords.reduce((sum, coord) => sum + coord[1], 0) / coords.length;
      } else {
        console.warn(`Skipping feature with unsupported geometry type: ${geometry.type}`);
        continue;
      }
      
      await client.query(
        `INSERT INTO damaged_buildings 
         (longitude, latitude, wind_loss, exposure, damage_ratio, building_type, occupancy)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          longitude,
          latitude,
          props.Wind_Loss || 0,
          props.Exposure || 0,
          props.Damage_Ratio || 0,
          props.Building_Type || props.BTypeCat || null,
          props.Occupancy || null,
        ]
      );
      
      buildingCount++;
      if (buildingCount % 1000 === 0) {
        console.log(`  Imported ${buildingCount} buildings...`);
      }
    }
    console.log(`✅ Imported ${buildingCount} buildings`);

    // Import cyclone track
    console.log('\n📦 Importing cyclone track...');
    const cycloneData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../public/cyclone-track.geojson'), 'utf8')
    );
    
    let trackCount = 0;
    for (const feature of cycloneData.features) {
      const { coordinates } = feature.geometry;
      const props = feature.properties;
      
      await client.query(
        `INSERT INTO cyclone_track 
         (longitude, latitude, timestamp, wind_speed, pressure, category)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          coordinates[0],
          coordinates[1],
          props.ISO_TIME || new Date(),
          props.USA_WIND || props.wind_speed || 0,
          props.USA_PRES || props.pressure || 0,
          props.STORM_NAME || props.category || null,
        ]
      );
      trackCount++;
    }
    console.log(`✅ Imported ${trackCount} cyclone track points`);

    // Import national summary
    console.log('\n📦 Importing national summary...');
    const nationalCsv = fs.readFileSync(
      path.join(__dirname, '../public/national-summary.csv'),
      'utf8'
    );
    const nationalRecords = parse(nationalCsv, { columns: true, skip_empty_lines: true });
    
    for (const record of nationalRecords) {
      await client.query(
        `INSERT INTO national_summary (metric_name, metric_value, metric_unit)
         VALUES ($1, $2, $3)`,
        [
          record.Metric || record.metric_name,
          parseFloat(record.Value || record.value) || 0,
          record.Unit || record.unit || '',
        ]
      );
    }
    console.log(`✅ Imported ${nationalRecords.length} national summary records`);

    // Import impact by sector
    console.log('\n📦 Importing impact by sector...');
    const sectorCsv = fs.readFileSync(
      path.join(__dirname, '../public/impact-by-sector.csv'),
      'utf8'
    );
    const sectorRecords = parse(sectorCsv, { columns: true, skip_empty_lines: true });
    
    for (const record of sectorRecords) {
      await client.query(
        `INSERT INTO impact_by_sector (sector_name, total_damage, affected_assets)
         VALUES ($1, $2, $3)`,
        [
          record.Sector || record.sector_name,
          parseFloat(record['Total Damage'] || record.total_damage) || 0,
          parseInt(record['Affected Assets'] || record.affected_assets) || 0,
        ]
      );
    }
    console.log(`✅ Imported ${sectorRecords.length} sector impact records`);

    console.log('\n🎉 Data import complete!');
    
    // Show summary
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM damaged_buildings) as buildings,
        (SELECT COUNT(*) FROM cyclone_track) as cyclone_points,
        (SELECT COUNT(*) FROM national_summary) as national_metrics,
        (SELECT COUNT(*) FROM impact_by_sector) as sectors
    `);
    
    console.log('\n📊 Database Summary:');
    console.log(`  - Buildings: ${counts.rows[0].buildings}`);
    console.log(`  - Cyclone track points: ${counts.rows[0].cyclone_points}`);
    console.log(`  - National metrics: ${counts.rows[0].national_metrics}`);
    console.log(`  - Sector impacts: ${counts.rows[0].sectors}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(console.error);
