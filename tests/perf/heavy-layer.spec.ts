/**
 * Heavy Layer Load Performance Flow
 *
 * Tests the time taken to load large GeoJSON datasets (damaged-buildings,
 * damaged-roads) from public/ when the user zooms into the map to trigger
 * vector-layer rendering.
 *
 * Network requests to /damaged-buildings.geojson and /damaged-roads.geojson
 * are intercepted and timed.  Threshold is SOFT by default; set HARD_GATE=true
 * to make failures block the build.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const HARD_GATE = process.env.HARD_GATE === 'true';

const THRESHOLDS = {
  damagedBuildingsLoad: 5000,  // ms – time from navigation-start to geojson response complete
  damagedRoadsLoad: 5000,      // ms
  layerRenderIdle: 12_000,     // ms – time from navigation to network-idle after zoom
};

type LayerTimingReport = {
  test: string;
  url: string;
  timestamp: string;
  timings: Record<string, number | null>;
  violations: { asset: string; value: number; threshold: number }[];
};

function writeReport(report: LayerTimingReport) {
  const dir = path.resolve('reports/perf');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `heavy-layer-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\nLayer timing report: ${file}`);
}

test.describe('Heavy Layer Load Performance', () => {
  test('Damaged-buildings and roads GeoJSON load timing', async ({ page }) => {
    const url = '/?lat=-15.3767&lng=166.9592&zoom=7.0&country=VU';

    const navigationStart = Date.now();
    const timings: Record<string, number | null> = {
      damagedBuildingsLoad: null,
      damagedRoadsLoad: null,
      networkIdle: null,
    };

    // Intercept and time the large GeoJSON fetches
    page.on('response', async (response) => {
      const u = response.url();
      if (u.includes('damaged-buildings') && u.endsWith('.geojson')) {
        try {
          await response.body(); // wait for full download
          timings.damagedBuildingsLoad = Date.now() - navigationStart;
        } catch {
          // body already consumed
        }
      }
      if (u.includes('damaged-roads') && u.endsWith('.geojson')) {
        try {
          await response.body();
          timings.damagedRoadsLoad = Date.now() - navigationStart;
        } catch {
          // body already consumed
        }
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for map container
    const mapContainer = page.locator('[data-testid="map-container"]');
    await expect(mapContainer).toBeVisible({ timeout: 30_000 });

    // Zoom in to zoom level 10 to ensure tile/vector layer loads trigger
    await page.evaluate(() => {
      // Access the maplibre map instance if exposed on window
      const w = window as unknown as Record<string, unknown>;
      if (w.__map && typeof (w.__map as { zoomTo?: (z: number) => void }).zoomTo === 'function') {
        (w.__map as { zoomTo: (z: number) => void }).zoomTo(10);
      }
    });

    // Wait for network idle (all GeoJSON chunks downloaded) or timeout
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {/* soft */});
    timings.networkIdle = Date.now() - navigationStart;

    // Give extra time for any deferred fetches
    await page.waitForTimeout(2_000);

    console.log('\nLayer Load Timings:', JSON.stringify(timings, null, 2));

    const violations: LayerTimingReport['violations'] = [];

    if (
      timings.damagedBuildingsLoad !== null &&
      timings.damagedBuildingsLoad > THRESHOLDS.damagedBuildingsLoad
    ) {
      violations.push({
        asset: 'damaged-buildings.geojson',
        value: timings.damagedBuildingsLoad,
        threshold: THRESHOLDS.damagedBuildingsLoad,
      });
    }

    if (
      timings.damagedRoadsLoad !== null &&
      timings.damagedRoadsLoad > THRESHOLDS.damagedRoadsLoad
    ) {
      violations.push({
        asset: 'damaged-roads.geojson',
        value: timings.damagedRoadsLoad,
        threshold: THRESHOLDS.damagedRoadsLoad,
      });
    }

    if (
      timings.networkIdle !== null &&
      timings.networkIdle > THRESHOLDS.layerRenderIdle
    ) {
      violations.push({
        asset: 'network-idle',
        value: timings.networkIdle,
        threshold: THRESHOLDS.layerRenderIdle,
      });
    }

    const report: LayerTimingReport = {
      test: 'heavy-layer-load-vanuatu',
      url: `http://localhost:3002${url}`,
      timestamp: new Date().toISOString(),
      timings,
      violations,
    };
    writeReport(report);

    if (violations.length > 0) {
      const msg = `Layer load budget violations:\n${violations.map(v => `  ${v.asset}: ${v.value}ms > ${v.threshold}ms`).join('\n')}`;
      if (HARD_GATE) {
        throw new Error(msg);
      } else {
        console.warn(`\n⚠ SOFT GATE – ${msg}`);
      }
    }
  });
});
