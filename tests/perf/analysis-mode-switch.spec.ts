import { expect, test } from '@playwright/test';

/**
 * Switching analysis mode must leave nothing behind: Assessment reached from
 * Forecast has to look exactly like Assessment opened directly. Needs a country
 * that has both a Rapid Exposure Forecast and a post-event assessment:
 *
 * FORECAST_E2E_COUNTRY_URL=/vanuatu
 */
const countryUrl = process.env.FORECAST_E2E_COUNTRY_URL;

async function open(page: import('@playwright/test').Page) {
  await page.goto(countryUrl!, { waitUntil: 'networkidle' });
  await expect(page.getByRole('group', { name: 'Analysis mode' })).toBeVisible({ timeout: 60_000 });
}

async function visibleState(page: import('@playwright/test').Page) {
  await page.waitForTimeout(1500);
  const text = await page.locator('body').innerText();
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

test.describe('Analysis mode switching', () => {
  test('Assessment after Forecast matches a fresh Assessment', async ({ page }) => {
    test.skip(
      !countryUrl,
      'Set FORECAST_E2E_COUNTRY_URL to a country with a forecast and an assessment.'
    );
    await open(page);
    const fresh = await visibleState(page);

    await page
      .getByRole('group', { name: 'Analysis mode' })
      .getByRole('button', { name: 'Forecast', exact: true })
      .click();
    await expect(page.getByText('Exposure Forecast', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await page
      .getByRole('group', { name: 'Analysis mode' })
      .getByRole('button', { name: 'Assessment', exact: true })
      .click();
    await expect(page.getByText('Summary Dashboard', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const switched = await visibleState(page);

    const freshSet = new Set(fresh);
    const switchedSet = new Set(switched);
    expect(switched.filter(line => !freshSet.has(line))).toEqual([]);
    expect(fresh.filter(line => !switchedSet.has(line))).toEqual([]);
  });

  test('the mode never becomes an event filter the tables would obey', async ({ page }) => {
    test.skip(
      !countryUrl,
      'Set FORECAST_E2E_COUNTRY_URL to a country with a forecast and an assessment.'
    );
    await open(page);
    await page
      .getByRole('group', { name: 'Analysis mode' })
      .getByRole('button', { name: 'Forecast', exact: true })
      .click();
    await page
      .getByRole('group', { name: 'Analysis mode' })
      .getByRole('button', { name: 'Assessment', exact: true })
      .click();
    await page.getByRole('button', { name: /open data filters/i }).click();
    await expect(page.getByText(/Selected: [1-9]/)).toHaveCount(0);
    await expect(page.getByText(/ACTIVE:/)).toHaveCount(0);
  });

  test('Map Controls: overlays belong to Assessment, and each mode keeps its own switches', async ({
    page,
  }) => {
    test.skip(
      !countryUrl,
      'Set FORECAST_E2E_COUNTRY_URL to a country with a forecast and an assessment.'
    );
    const overlayRows = page.locator('button[aria-controls^=map-panel-overlay]');
    const mode = (name: string) =>
      page.getByRole('group', { name: 'Analysis mode' }).getByRole('button', { name, exact: true });
    await open(page);
    await expect(overlayRows).toHaveCount(5);

    await mode('Forecast').click();
    await expect(page.getByText('Forecast layers').first()).toBeVisible({ timeout: 30_000 });
    await expect(overlayRows).toHaveCount(0);

    await mode('Scenarios').click();
    await expect(page.getByText('Hazard Scenario').first()).toBeVisible({ timeout: 30_000 });
    await expect(overlayRows).toHaveCount(0);

    // The scenario's own switch must not touch Assessment's Maximum Inundation
    await page
      .locator('label', { hasText: 'Show on map' })
      .locator('input[type=checkbox]')
      .first()
      .uncheck({ force: true });
    await mode('Assessment').click();
    await expect(page.getByText('Map Shading').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('button[aria-controls=map-panel-overlay-flood]')).toContainText('On');
  });
});
