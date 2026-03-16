#!/usr/bin/env node

/**
 * Partner API Health Check Script
 * 
 * Tests all Partner API endpoints for all countries to verify availability
 * and data structure.
 * 
 * Usage:
 *   node scripts/check-partner-api.js
 *   npm run check:partner-api
 */

const BASE_URL = 'https://opmthredds.gem.spc.int/partner_api/v1';

const COUNTRY_CODES = ['VU', 'WS', 'TO', 'CK'];
const COUNTRY_NAMES = {
  VU: 'Vanuatu',
  WS: 'Samoa',
  TO: 'Tonga',
  CK: 'Cook Islands',
};

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'cyan');
  console.log('='.repeat(70));
}

async function checkEndpoint(url, method = 'GET') {
  const startTime = Date.now();
  
  try {
    const response = await fetch(url, { 
      method,
      headers: { 'Accept': 'application/json' },
    });
    
    const responseTime = Date.now() - startTime;
    const ok = response.ok;
    
    let data = null;
    let dataSize = 0;
    
    if (ok && method === 'GET') {
      const text = await response.text();
      dataSize = text.length;
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = text;
      }
    }
    
    return {
      ok,
      status: response.status,
      responseTime,
      data,
      dataSize,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      responseTime: Date.now() - startTime,
      error: error.message,
      dataSize: 0,
    };
  }
}

async function resolveCountryId(countryCode) {
  log(`\n🔍 Resolving country ID for ${COUNTRY_NAMES[countryCode]} (${countryCode})...`, 'blue');
  
  const result = await checkEndpoint(`${BASE_URL}/country/`);
  
  if (!result.ok) {
    log(`❌ Failed to fetch countries: HTTP ${result.status}`, 'red');
    return null;
  }
  
  const countries = Array.isArray(result.data) ? result.data : result.data?.results || [];
  
  log(`   Found ${countries.length} countries in database`, 'gray');
  
  // Try to match by code or name
  const countryNames = COUNTRY_NAMES[countryCode].toLowerCase().split(',');
  const match = countries.find(country => {
    const values = Object.values(country)
      .filter(v => typeof v === 'string')
      .map(v => v.toLowerCase());
    
    return values.some(v => 
      v === countryCode.toLowerCase() || 
      countryNames.some(name => v.includes(name.trim()))
    );
  });
  
  if (!match) {
    log(`   ⚠️  Country not found in Partner API`, 'yellow');
    return null;
  }
  
  const countryId = match.id || match.pk || match.country_id;
  log(`   ✅ Found: ID = ${countryId}`, 'green');
  
  return countryId;
}

async function checkCountryEndpoints(countryCode, countryId) {
  logSection(`Testing ${COUNTRY_NAMES[countryCode]} (${countryCode}) - Country ID: ${countryId}`);
  
  const endpoints = [
    { name: 'Cyclone Track', path: `/cyclone_track/?country=${countryId}` },
    { name: 'Event', path: `/event/?country=${countryId}` },
    { name: 'Risk Information', path: `/risk_information/?country=${countryId}` },
    { name: 'Risk Forecast', path: `/risk_forecast/?country=${countryId}` },
    { name: 'Hazard Information', path: `/hazard_information/?country=${countryId}` },
    { name: 'Citizen Science', path: `/citizen_science/?country=${countryId}` },
  ];
  
  const results = [];
  
  for (const endpoint of endpoints) {
    const url = `${BASE_URL}${endpoint.path}`;
    log(`\n📍 ${endpoint.name}`, 'blue');
    log(`   ${url}`, 'gray');
    
    const result = await checkEndpoint(url);
    
    if (result.ok) {
      const data = result.data;
      const count = Array.isArray(data) ? data.length : data?.count || data?.results?.length || 0;
      const hasData = count > 0;
      
      log(`   ✅ HTTP ${result.status} - ${result.responseTime}ms`, 'green');
      log(`   📊 Records: ${count} (${(result.dataSize / 1024).toFixed(2)} KB)`, hasData ? 'green' : 'yellow');
      
      if (hasData && data?.results?.[0]) {
        log(`   📝 Sample record keys: ${Object.keys(data.results[0]).join(', ')}`, 'gray');
      }
      
      results.push({ endpoint: endpoint.name, status: 'available', count, responseTime: result.responseTime });
    } else {
      log(`   ❌ HTTP ${result.status} - ${result.error || 'Request failed'}`, 'red');
      results.push({ endpoint: endpoint.name, status: 'unavailable', count: 0, responseTime: result.responseTime });
    }
  }
  
  return results;
}

async function main() {
  logSection('🌍 Partner API Health Check');
  log(`Base URL: ${BASE_URL}`, 'gray');
  log(`Testing ${COUNTRY_CODES.length} countries...`, 'gray');
  
  // Step 1: Check base country endpoint
  logSection('Step 1: Checking /country/ endpoint');
  const countryResult = await checkEndpoint(`${BASE_URL}/country/`);
  
  if (!countryResult.ok) {
    log(`\n❌ CRITICAL: Cannot access /country/ endpoint (HTTP ${countryResult.status})`, 'red');
    log('   Partner API may be offline or unreachable', 'red');
    process.exit(1);
  }
  
  const totalCountries = Array.isArray(countryResult.data) 
    ? countryResult.data.length 
    : countryResult.data?.count || 0;
  
  log(`✅ /country/ endpoint working (${totalCountries} countries found)`, 'green');
  
  // Step 2: Resolve country IDs and test endpoints
  const allResults = {};
  
  for (const countryCode of COUNTRY_CODES) {
    const countryId = await resolveCountryId(countryCode);
    
    if (countryId) {
      const results = await checkCountryEndpoints(countryCode, countryId);
      allResults[countryCode] = { countryId, results };
    } else {
      allResults[countryCode] = { countryId: null, results: [] };
      log(`⚠️  Skipping endpoint tests (country not in API)`, 'yellow');
    }
  }
  
  // Step 3: Summary
  logSection('📊 Summary');
  
  for (const countryCode of COUNTRY_CODES) {
    const { countryId, results } = allResults[countryCode];
    
    log(`\n${COUNTRY_NAMES[countryCode]} (${countryCode}):`, 'blue');
    
    if (!countryId) {
      log(`  ❌ Not available in Partner API`, 'red');
      continue;
    }
    
    log(`  🆔 Country ID: ${countryId}`, 'gray');
    
    const available = results.filter(r => r.status === 'available').length;
    const withData = results.filter(r => r.count > 0).length;
    
    log(`  📡 Endpoints: ${available}/${results.length} available, ${withData} with data`, 
      available > 0 ? 'green' : 'yellow');
    
    for (const result of results) {
      const icon = result.status === 'available' ? '✅' : '❌';
      const dataInfo = result.count > 0 ? ` (${result.count} records)` : '';
      log(`     ${icon} ${result.endpoint}${dataInfo}`, result.status === 'available' ? 'gray' : 'red');
    }
  }
  
  // Step 4: Recommendations
  logSection('💡 Recommendations');
  
  const countriesWithData = Object.entries(allResults)
    .filter(([_, { results }]) => results.some(r => r.count > 0))
    .map(([code]) => code);
  
  if (countriesWithData.length === 0) {
    log('⚠️  No countries have data in the Partner API yet', 'yellow');
    log('   Continue using local file-based data for all countries', 'yellow');
  } else {
    log(`✅ ${countriesWithData.length} countries have data in Partner API:`, 'green');
    countriesWithData.forEach(code => log(`   - ${COUNTRY_NAMES[code]} (${code})`, 'green'));
    
    const countriesWithoutData = COUNTRY_CODES.filter(code => !countriesWithData.includes(code));
    if (countriesWithoutData.length > 0) {
      log(`\n⚠️  ${countriesWithoutData.length} countries not yet in API:`, 'yellow');
      countriesWithoutData.forEach(code => log(`   - ${COUNTRY_NAMES[code]} (${code})`, 'yellow'));
      log('   These will continue using local files', 'gray');
    }
  }
  
  log('\n✅ Health check complete!', 'green');
}

// Run the script
main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
