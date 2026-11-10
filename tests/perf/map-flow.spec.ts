/**
 * Map Load Performance Flow
 *
 * Loads the map for Vanuatu (TC Gita dataset), waits for the map container and
 * summary panel to be visible, then captures:
 *   - Navigation timing (TTFB, DOMContentLoaded, Load)
 *   - First Contentful Paint (FCP) via PerformanceObserver polyfill
 *   - Largest Contentful Paint (LCP) via PerformanceObserver
 *   - Total long-task blocking time
 *
 * Thresholds are SOFT (warnings written to JSON, tests do not fail by default).
 * Flip HARD_GATE=true in the environment to turn warnings into failures.
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const HARD_GATE = process.env.HARD_GATE === 'true';

const THRESHOLDS = {
  fcp: 2000,      // ms
  lcp: 2500,      // ms
  longTask: 1000, // ms  (total blocking time from long tasks)
  load: 8000,     // ms  (full page load including async map tiles)
};

type PerfReport = {
  test: string;
  url: string;
  timestamp: string;
  metrics: Record<string, number | null>;
  violations: { metric: string; value: number; threshold: number }[];
};

async function collectWebVitals(page: Page): Promise<Record<string, number | null>> {
  return page.evaluate(() => {
    return new Promise<Record<string, number | null>>((resolve) => {
      const result: Record<string, number | null> = {
        fcp: null,
        lcp: null,
        longTaskTotal: 0,
        ttfb: null,
        domContentLoaded: null,
        loadEvent: null,
      };

      // Navigation timing
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (navEntries.length > 0) {
        const nav = navEntries[0];
        result.ttfb = Math.round(nav.responseStart - nav.requestStart);
        result.domContentLoaded = Math.round(nav.domContentLoadedEventEnd - nav.startTime);
        result.loadEvent = Math.round(nav.loadEventEnd - nav.startTime);
      }

      // FCP from paint entries
      const paintEntries = performance.getEntriesByType('paint');
      const fcpEntry = paintEntries.find(e => e.name === 'first-contentful-paint');
      if (fcpEntry) result.fcp = Math.round(fcpEntry.startTime);

      // LCP and long tasks via observer (with 5 s timeout)
      const completed = { lcp: false, longTask: false };
      const checkDone = () => {
        if (completed.lcp && completed.longTask) resolve(result);
      };

      // LCP
      try {
        const lcpObs = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          result.lcp = Math.round(last.startTime);
        });
        lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => { lcpObs.disconnect(); completed.lcp = true; checkDone(); }, 5000);
      } catch {
        completed.lcp = true;
        checkDone();
      }

      // Long tasks
      try {
        let total = 0;
        const ltObs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            total += entry.duration;
          }
          result.longTaskTotal = Math.round(total);
        });
        ltObs.observe({ type: 'longtask', buffered: true });
        setTimeout(() => { ltObs.disconnect(); result.longTaskTotal = Math.round(total); completed.longTask = true; checkDone(); }, 5000);
      } catch {
        completed.longTask = true;
        checkDone();
      }
    });
  });
}

function writeReport(report: PerfReport) {
  const dir = path.resolve('reports/perf');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `map-load-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\nPerf report written to: ${file}`);
}

test.describe('Map Load Performance', () => {
  test('Vanuatu map route – FCP, LCP, long tasks', async ({ page }) => {
    const url = '/?lat=-15.3767&lng=166.9592&zoom=7.0&country=VU';

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for the map container to be visible
    const mapContainer = page.locator('[data-testid="map-container"]');
    await expect(mapContainer).toBeVisible({ timeout: 30_000 });

    // Wait for the summary panel to appear (data has loaded)
    const summaryPanel = page.locator('[data-testid="summary-panel"]');
    await expect(summaryPanel).toBeVisible({ timeout: 30_000 });

    // Let LCP / long-task observers settle
    await page.waitForTimeout(6_000);

    const metrics = await collectWebVitals(page);
    console.log('\nMap Load Metrics:', JSON.stringify(metrics, null, 2));

    const violations: PerfReport['violations'] = [];
    const checks: [keyof typeof THRESHOLDS, string][] = [
      ['fcp', 'fcp'],
      ['lcp', 'lcp'],
      ['longTask', 'longTaskTotal'],
      ['load', 'loadEvent'],
    ];

    for (const [threshold, metricKey] of checks) {
      const value = metrics[metricKey];
      if (value !== null && value !== undefined && value > THRESHOLDS[threshold]) {
        violations.push({ metric: metricKey, value, threshold: THRESHOLDS[threshold] });
      }
    }

    const report: PerfReport = {
      test: 'map-load-vanuatu',
      url: `http://localhost:3002${url}`,
      timestamp: new Date().toISOString(),
      metrics,
      violations,
    };
    writeReport(report);

    if (violations.length > 0) {
      const msg = `Performance budget violations:\n${violations.map(v => `  ${v.metric}: ${v.value}ms > ${v.threshold}ms`).join('\n')}`;
      if (HARD_GATE) {
        throw new Error(msg);
      } else {
        console.warn(`\n⚠ SOFT GATE – ${msg}`);
      }
    }
  });

  test('Home route – baseline FCP and load', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const mapContainer = page.locator('[data-testid="map-container"]');
    await expect(mapContainer).toBeVisible({ timeout: 30_000 });

    await page.waitForTimeout(6_000);

    const metrics = await collectWebVitals(page);
    console.log('\nHome Route Metrics:', JSON.stringify(metrics, null, 2));

    const report: PerfReport = {
      test: 'home-baseline',
      url: 'http://localhost:3002/',
      timestamp: new Date().toISOString(),
      metrics,
      violations: [],
    };
    writeReport(report);
  });
});
