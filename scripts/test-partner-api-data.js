#!/usr/bin/env node

/**
 * Test Partner API Data Loading
 * 
 * This script simulates how the application loads data from Partner API
 * to help debug why local files are being used instead.
 */

const BASE_URL = 'https://opmthredds.gem.spc.int/partner_api/v1';

async function testCountryData(countryCode) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing data load for ${countryCode}`);
  console.log('='.repeat(70));

  try {
    // Step 1: Get country ID
    const countriesRes = await fetch(`${BASE_URL}/country/`);
    const countriesData = await countriesRes.json();
    const countries = Array.isArray(countriesData) ? countriesData : countriesData.results || [];
    
    const country = countries.find(c => {
      const values = Object.values(c).map(v => String(v).toLowerCase());
      return values.some(v => v.includes(countryCode.toLowerCase()));
    });

    if (!country) {
      console.log(`❌ Country ${countryCode} not found in API`);
      return;
    }

    const countryId = country.id;
    console.log(`✅ Found country ID: ${countryId}`);

    // Step 2: Fetch cyclone track
    console.log(`\n📍 Fetching cyclone track...`);
    const cycloneRes = await fetch(`${BASE_URL}/cyclone_track/?country=${countryId}`);
    const cycloneData = await cycloneRes.json();

    console.log(`Response structure:`, {
      isArray: Array.isArray(cycloneData),
      hasResults: !!cycloneData.results,
      hasType: !!cycloneData.type,
      hasFeatures: !!cycloneData.features,
    });

    if (cycloneData.type === 'FeatureCollection') {
      console.log(`✅ Response is a GeoJSON FeatureCollection`);
      console.log(`   Features: ${cycloneData.features?.length || 0}`);
      if (cycloneData.features?.[0]) {
        console.log(`   First feature geometry type: ${cycloneData.features[0].geometry?.type}`);
        console.log(`   First feature properties:`, Object.keys(cycloneData.features[0].properties || {}));
      }
    } else if (Array.isArray(cycloneData)) {
      console.log(`⚠️  Response is an array with ${cycloneData.length} items`);
      if (cycloneData[0]) {
        console.log(`   First item keys:`, Object.keys(cycloneData[0]));
      }
    } else if (cycloneData.results) {
      console.log(`⚠️  Response has 'results' array with ${cycloneData.results.length} items`);
      if (cycloneData.results[0]) {
        console.log(`   First result keys:`, Object.keys(cycloneData.results[0]));
      }
    } else {
      console.log(`❓ Unknown response structure:`, Object.keys(cycloneData));
    }

    // Step 3: Test what buildCycloneTrackFromPartnerPayload would do
    console.log(`\n🔧 Simulating buildCycloneTrackFromPartnerPayload...`);
    
    let trackData = null;
    
    if (cycloneData.type === 'FeatureCollection' && Array.isArray(cycloneData.features)) {
      console.log(`   ✅ Would use direct FeatureCollection`);
      trackData = cycloneData;
    } else {
      console.log(`   ⚠️  Would try to extract from array/paginated response`);
      
      const rows = Array.isArray(cycloneData) 
        ? cycloneData 
        : cycloneData.results || [];
      
      console.log(`   Found ${rows.length} rows to process`);
      
      if (rows.length > 0 && rows[0]) {
        const firstRow = rows[0];
        console.log(`   First row keys:`, Object.keys(firstRow));
        
        // Check for geometry fields (NEW)
        const hasGeometry = firstRow.geometry || firstRow.geometry_computed;
        console.log(`   Has geometry field: ${hasGeometry ? '✅' : '❌'}`);
        
        if (hasGeometry) {
          const geom = firstRow.geometry_computed || firstRow.geometry;
          console.log(`   Geometry type: ${geom?.type || 'unknown'}`);
          console.log(`   Geometry is:`, typeof geom);
          console.log(`   Geometry value (first 200 chars):`, JSON.stringify(geom).substring(0, 200));
          trackData = true; // Would successfully create FeatureCollection
        } else {
          const hasCoords = (
            firstRow.longitude !== undefined || 
            firstRow.lat !== undefined ||
            firstRow.lon !== undefined ||
            firstRow.latitude !== undefined
          );
          
          console.log(`   Has coordinate fields: ${hasCoords ? '✅' : '❌'}`);
          
          if (hasCoords) {
            const lon = firstRow.longitude || firstRow.lon || firstRow.lng;
            const lat = firstRow.latitude || firstRow.lat;
            console.log(`   Sample coords: [${lon}, ${lat}]`);
            trackData = true;
          }
        }
      }
    }

    console.log(`\n💡 Result: ${trackData ? '✅ Would load from Partner API' : '❌ Would fall back to local files'}`);

  } catch (error) {
    console.error(`❌ Error:`, error.message);
  }
}

async function main() {
  console.log('🔍 Partner API Data Structure Test');
  console.log(`Base URL: ${BASE_URL}\n`);

  const countries = ['VU', 'WS', 'TO', 'CK'];
  
  for (const country of countries) {
    await testCountryData(country);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('✅ Test complete');
  console.log('='.repeat(70));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
