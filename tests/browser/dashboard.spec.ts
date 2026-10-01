import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const fixture = JSON.parse(await readFile(resolve('data/intel/example.json'), 'utf8'));
const current = JSON.parse(await readFile(resolve('data/intel/current.json'), 'utf8'));
async function populated(page: Page) {
  await page.clock.setFixedTime(new Date('2026-01-15T05:00:00Z'));
  const data = { ...structuredClone(fixture), kind: 'briefing' };
  data.overview.oneLineTake = '<script>window.injected = true</script> EXAMPLE rendered safely';
  await page.route('**/data/intel/current.json', route => route.fulfill({ json: data }));
  await page.route('**/data/intel/manifest.json', route => route.fulfill({ json: { dates: ['2026-01-15'] } }));
}
test.beforeEach(async ({ page }) => {
  // Deterministic UI tests never rely on a third-party chart connection.
  await page.route('https://s3.tradingview.com/**', route => route.abort());
});

for (const width of [375, 390, 430, 1440]) {
  test(`published dashboard fits ${width}px with correct links and no app errors`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('#brief-date')).toHaveValue(current.asOfDate);
    await expect(page.locator('#overview')).toContainText(current.overview.oneLineTake);
    await expect(page.locator('#data-status')).toContainText('ICT');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(page.getByRole('link', { name: 'Mango Atlas on X' })).toHaveAttribute('href', 'https://x.com/mangoatlas');
    await expect(page.locator('.discord-link')).toHaveAttribute('href', 'https://discord.gg/xUQSsm5UpV');
    expect(errors).toEqual([]);
  });
}
test('history selection changes briefing and compares actual earlier data', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#brief-date')).toBeEnabled();
  await page.locator('#brief-date').selectOption('2026-09-04');
  await expect(page.locator('#data-status')).toContainText('ARCHIVE');
  await expect(page.locator('#overview')).toContainText('Falling');
  await expect(page.locator('#changes')).toContainText('Rising');
  await expect(page.locator('#changes')).toContainText('Falling');
  await page.locator('#brief-date').selectOption(current.asOfDate);
  await expect(page.locator('#overview')).toContainText(current.overview.oneLineTake);
});
test('corrupt current and latest archive recover from the next valid archive', async ({ page }) => {
  await page.route('**/data/intel/current.json', route => route.fulfill({ json: { broken: true } }));
  await page.route(`**/data/intel/archive/${current.asOfDate}.json`, route => route.fulfill({ body: '{' }));
  await page.goto('/');
  await expect(page.locator('#data-status')).toContainText('Recovered from a valid archive');
  await expect(page.locator('#brief-date')).toHaveValue('2026-09-30');
});
test('all data failures retain usable dashboard and chart controls', async ({ page }) => {
  await page.route('**/data/intel/**', route => route.fulfill({ status: 503, body: '' }));
  await page.goto('/');
  await expect(page.locator('#data-status')).toContainText('Research could not be loaded');
  await expect(page.locator('#chart-symbol')).toBeEnabled();
  await expect(page.locator('#overview')).toContainText('Awaiting the daily briefing');
});
test('populated mobile: events in ICT, FX levels, feed filtering, escaped research, no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await populated(page); await page.goto('/');
  await expect(page.locator('#overview')).toContainText('<script>window.injected = true</script>');
  expect(await page.evaluate(() => 'injected' in window)).toBe(false);
  await expect(page.locator('#catalysts')).toContainText('7:30 PM');
  await page.getByRole('button', { name: '7 days', exact: true }).click();
  await expect(page.locator('#catalysts')).toContainText('Tentative');
  await page.locator('.fx-instrument').first().locator('summary').click();
  await expect(page.locator('.fx-content').first()).toContainText('1.05');
  await page.getByRole('button', { name: 'Technology', exact: true }).click();
  await expect(page.locator('.story')).toHaveCount(1);
  await expect(page.locator('.story')).toContainText('Technology story');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.locator('.story')).toHaveCount(2);
  await expect(page.locator('.ticker').first()).toContainText('20,000');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('stale briefing is marked and external futures never become a CFD silently', async ({ page }) => {
  await populated(page); await page.clock.setFixedTime(new Date('2026-01-18T05:00:00Z')); await page.goto('/');
  await expect(page.locator('#data-status')).toContainText('STALE');
  await page.getByRole('button', { name: 'View chart', exact: true }).click();
  await expect(page.locator('#chart-instrument')).toHaveText('NQ · Nasdaq 100 futures');
  await expect(page.locator('#chart-host')).toContainText('futures data is restricted');
  await expect(page.locator('#chart-host a')).toHaveAttribute('href', /CME_MINI%3ANQ1!/);
  await page.locator('#chart-symbol').selectOption('OANDA:EURUSD');
  await expect(page.locator('#chart-instrument')).toHaveText('EURUSD · Spot FX');
  await expect(page.locator('#chart-host')).toContainText('Chart unavailable');
  await expect(page.locator('#overview')).toContainText('EXAMPLE rendered safely');
});
test('daily and legacy HTML route redirect to dashboard', async ({ request }) => {
  for (const path of ['/daily', '/daily/', '/daily.html']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(308); expect(response.headers().location).toBe('/');
  }
});
