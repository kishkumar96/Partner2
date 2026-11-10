import { expect, test } from '@playwright/test';

/**
 * Uses a real imported REF event. Set these in the environment that owns the
 * fixture data (for example, local middleware with import_ref_run):
 *
 * FORECAST_E2E_URL=/vanuatu?mode=event&events=<forecast-event-id>
 * FORECAST_E2E_SECOND_URL=/vanuatu?mode=event&events=<another-forecast-id>
 *
 * Keeping fixture ids out of source means the suite is safe in environments
 * without the large REF sample outputs.
 */
const forecastUrl = process.env.FORECAST_E2E_URL;
const secondForecastUrl = process.env.FORECAST_E2E_SECOND_URL;

test.describe('Rapid Exposure Forecast overlays', () => {
  test('toggles the lazy floodplain overlay without disturbing the REF track', async ({ page }) => {
    test.skip(!forecastUrl, 'Set FORECAST_E2E_URL to an imported REF event.');
    const floodplainRequests: string[] = [];
    page.on('request', request => {
      if (/risk_information\/\d+\/?(?:\?|$)/.test(request.url())) {
        floodplainRequests.push(request.url());
      }
    });

    await page.goto(forecastUrl!, { waitUntil: 'networkidle' });
    await expect(page.getByText('Forecast layers', { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const track = page.getByLabel(/Rapid Exposure Forecast input track|Forecast track/);
    await expect(track).toBeChecked();

    const floodplain = page.getByLabel('Floodplain exposure');
    await expect(floodplain).not.toBeChecked();
    floodplainRequests.length = 0;
    await floodplain.check();
    await expect(floodplain).toBeChecked();
    await expect.poll(() => floodplainRequests.length).toBeGreaterThan(0);

    await floodplain.uncheck();
    await expect(floodplain).not.toBeChecked();
    await expect(track).toBeChecked();
  });

  test('does not retain floodplain geometry when changing forecast events', async ({ page }) => {
    test.skip(!forecastUrl || !secondForecastUrl, 'Set both REF event URLs to run this test.');
    await page.goto(forecastUrl!, { waitUntil: 'networkidle' });
    await page.getByLabel('Floodplain exposure').check();
    await expect(page.getByLabel('Floodplain exposure')).toBeChecked();

    await page.goto(secondForecastUrl!, { waitUntil: 'networkidle' });
    await expect(page.getByText('Forecast layers', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // The component remounts for the new event; only its default overlays are shown.
    await expect(page.getByLabel('Floodplain exposure')).not.toBeChecked();
    await expect(
      page.getByLabel(/Rapid Exposure Forecast input track|Forecast track/)
    ).toBeChecked();
  });
});
