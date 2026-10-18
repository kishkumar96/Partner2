#!/usr/bin/env node
/**
 * Warm the THREDDS layers a country's dashboard loads by default.
 *
 * THREDDS decodes a large NetCDF on its first request (about 90 s for
 * Vanuatu's TC Lola _merged.nc) and serves repeats in under a second. Run
 * this after THREDDS (re)starts so the first user doesn't pay that cost.
 *
 *   node scripts/warm-thredds.mjs VU [VU TO ...]
 *
 * Env: APP_URL (default http://localhost:3112), PARTNER_API_BASE_URL
 * (default http://localhost:8000). Requests go through the app's
 * partner-proxy, the same path the browser uses.
 */
const APP_URL = (process.env.APP_URL || 'http://localhost:3112').replace(/\/$/, '');
const API = (process.env.PARTNER_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
const TIMEOUT_MS = 180_000;

const list = async path => {
  const response = await fetch(`${API}/partner_api/v1/${path}`);
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload) ? payload : (payload.results ?? []);
};

async function warmCountry(shortName) {
  const countries = await list('country/');
  const country = countries.find(c => c.short_name === shortName);
  if (!country) throw new Error(`No country ${shortName}`);

  const events = (await list(`event/?country=${country.id}`)).filter(
    e => Array.isArray(e.hazards) && e.hazards.length > 0
  );
  const wantedIds = new Set(events.flatMap(e => e.hazards.map(String)));
  const rows = (await list(`hazard_information/?country=${country.id}`)).filter(
    row => wantedIds.has(String(row.id)) && typeof row.url === 'string'
  );
  console.log(`${shortName}: warming ${rows.length} event layer(s)`);

  for (const row of rows) {
    const marker = '/thredds/wms';
    const url = new URL(row.url);
    const index = url.pathname.indexOf(marker);
    if (index < 0) continue;
    const datasetPath = url.pathname.slice(index + marker.length);
    const params = new URLSearchParams({
      SERVICE: 'WMS',
      VERSION: '1.1.1',
      REQUEST: 'GetMap',
      LAYERS: row.layer_name || 'Depth',
      SRS: 'EPSG:3857',
      WIDTH: '256',
      HEIGHT: '256',
      FORMAT: 'image/png',
      TRANSPARENT: 'true',
      STYLES: 'default-scalar/x-Sst',
      BBOX: '18400000,-1800000,18900000,-1300000',
    });
    const started = Date.now();
    try {
      const response = await fetch(`${APP_URL}/api/partner-proxy/thredds/wms${datasetPath}?${params}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      await response.arrayBuffer();
      console.log(`  ${response.status} ${((Date.now() - started) / 1000).toFixed(1)}s  ${row.title}`);
    } catch (error) {
      console.log(`  FAILED ${row.title}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

const countries = process.argv.slice(2);
if (countries.length === 0) {
  console.error('Usage: node scripts/warm-thredds.mjs VU [TO WS CK]');
  process.exit(2);
}
for (const code of countries) {
  await warmCountry(code.toUpperCase()).catch(error => {
    console.error(`${code}: ${error.message}`);
    process.exitCode = 1;
  });
}
