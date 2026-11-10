import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/perf',
  timeout: 90_000,
  retries: 1,
  workers: 1, // run perf tests serially for stable timing
  reporter: [
    ['list'],
    ['json', { outputFile: 'reports/perf/playwright-results.json' }],
    ['html', { outputFolder: 'reports/perf/html', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:3002',
    browserName: 'chromium',
    headless: true,
    trace: 'on-first-retry',
    video: 'off',
    screenshot: 'only-on-failure',
    // Give the map enough time to settle on slower CI agents
    navigationTimeout: 60_000,
    actionTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1350, height: 940 },
      },
    },
  ],
  // Do NOT start the Next.js server here – perf:ci script owns that lifecycle
});
