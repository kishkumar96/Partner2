/**
 * Import damaged roads only
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

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
    // Check if roads already exist
    const existingCount = await client.query('SELECT COUNT(*) FROM damaged_roads');
    const existing = parseInt(existingCount.rows[0].count);
    
    if (existing > 0) {
      console.log(`⚠️  Found ${existing} existing roads. Clearing table...`);
      await client.query('TRUNCATE damaged_roads CASCADE');
    }

    // Import damaged roads
    console.log('\n📦 Importing damaged roads...');
    const roadsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../public/damaged-roads.geojson'), 'utf8')
    );
    
    let roadCount = 0;
    for (const feature of roadsData.features) {
      const { geometry } = feature;
      const props = feature.properties;
      
      // Extract road damage data
      const totalLoss = props.Loss || props.Total_Loss || 0;
      
      // For LineString geometry, get start and end points
      if (geometry.type === 'LineString' && geometry.coordinates.length >= 2) {
        const startCoord = geometry.coordinates[0];
        const endCoord = geometry.coordinates[geometry.coordinates.length - 1];
        
        await client.query(
          `INSERT INTO damaged_roads 
           (road_name, damage, road_type, start_lat, start_lon, end_lat, end_lon)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            props.Details || props.road_name || null,
            totalLoss,
            props.UseType || props.road_type || 'unknown',
            startCoord[1], // latitude
            startCoord[0], // longitude
            endCoord[1],
            endCoord[0],
          ]
        );
        
        roadCount++;
        if (roadCount % 500 === 0) {
          console.log(`  Imported ${roadCount} roads...`);
        }
      }
    }
    console.log(`✅ Imported ${roadCount} damaged roads`);

    // Show summary
    const counts = await client.query('SELECT COUNT(*) as count FROM damaged_roads');
    console.log(`\n📊 Total roads in database: ${counts.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(console.error);
