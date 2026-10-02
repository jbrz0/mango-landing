import { test, expect, type Page } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const fixture = JSON.parse(await readFile(resolve('data/intel/example.json'), 'utf8'));
const current = JSON.parse(await readFile(resolve('data/intel/current.json'), 'utf8'));
const archiveDates = (await readdir(resolve('data/intel/archive'))).map(file => file.replace('.json', '')).sort().reverse();
const macroFixture = { series: ['VIX', 'VXN', 'US10Y'].map(symbol => ({ symbol, points: [
  { date: '2026-01-13', value: symbol === 'US10Y' ? 4.1 : 16.1 },
  { date: '2026-01-14', value: symbol === 'US10Y' ? 4.2 : 16.2 },
  { date: '2026-01-15', value: symbol === 'US10Y' ? 4.3 : 16.3 },
], retrievedAt: '2026-01-15T05:00:00Z', refreshFailed: false })), unavailable: [] };
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
  await page.route('**/api/macro', route => route.fulfill({ json: macroFixture }));
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
    const socials = await page.locator('.footer-socials a').evaluateAll(links => links.map(link => link.getBoundingClientRect().top));
    expect(socials[0]).toBe(socials[1]);
    await expect(page.locator('[data-macro="US10Y"]')).toContainText('4.3%');
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
  await expect(page.locator('#market-strip')).toContainText('Independent of briefing date');
  await expect(page.locator('[data-macro="VIX"]')).toContainText('16.3');
  await page.locator('#brief-date').selectOption(current.asOfDate);
  await expect(page.locator('#overview')).toContainText(current.overview.oneLineTake);
});
test('corrupt current and latest archive recover from the next valid archive', async ({ page }) => {
  await page.route('**/data/intel/current.json', route => route.fulfill({ json: { broken: true } }));
  await page.route(`**/data/intel/archive/${current.asOfDate}.json`, route => route.fulfill({ body: '{' }));
  await page.goto('/');
  await expect(page.locator('#data-status')).toContainText('Recovered from a valid archive');
  await expect(page.locator('#brief-date')).toHaveValue(archiveDates.find(date => date < current.asOfDate)!);
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
  await page.locator('#briefing-quotes summary').click();
  await expect(page.locator('.ticker').first()).toContainText('20,000');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('stale research is marked and the available Nasdaq chart is explicitly a CFD', async ({ page }) => {
  await populated(page); await page.clock.setFixedTime(new Date('2026-01-18T05:00:00Z')); await page.goto('/');
  await expect(page.locator('#data-status')).toContainText('STALE');
  await page.getByRole('button', { name: 'NAS100 CFD chart' }).click();
  await expect(page.locator('#chart-instrument')).toHaveText('NAS100 · Nasdaq 100 CFD');
  await expect(page.locator('#chart-detail')).toContainText('not NQ futures');
  expect(await page.locator('#chart-symbol option').allTextContents()).not.toEqual(expect.arrayContaining([expect.stringMatching(/futures/)]));
  await page.locator('#chart-symbol').selectOption('OANDA:EURUSD');
  await expect(page.locator('#chart-instrument')).toHaveText('EURUSD · Spot FX');
  await expect(page.locator('#chart-host')).toContainText('Chart unavailable');
  await expect(page.locator('#overview')).toContainText('EXAMPLE rendered safely');
});

test('VIX, VXN and Treasury use actual native daily charts with date ranges and source attribution', async ({ page }) => {
  await page.goto('/');
  for (const symbol of ['VIX', 'VXN', 'US10Y']) {
    await page.locator('#chart-symbol').selectOption(`${symbol === 'US10Y' ? 'UST' : 'CBOE'}:${symbol}`);
    await expect(page.locator('.daily-canvas canvas').first()).toBeVisible();
    await expect(page.locator('.daily-readout')).toContainText('15 Jan 2026');
    await expect(page.locator('#chart-source')).toHaveAttribute('href', symbol === 'US10Y' ? /treasury.gov/ : /cboe.com/);
    await page.getByRole('group', { name: 'Chart date range' }).getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Chart date range' }).getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#chart-host iframe')).toHaveCount(0);
  }
});

test('macro provider outage has a clear recovery action and preserves research', async ({ page }) => {
  await page.route('**/api/macro', route => route.fulfill({ status: 503, json: { series: [], unavailable: ['VIX', 'VXN', 'US10Y'] } }));
  await page.goto('/');
  await expect(page.locator('[data-macro="VIX"]')).toContainText('Unavailable');
  await page.locator('#chart-symbol').selectOption('CBOE:VIX');
  await expect(page.locator('#chart-host')).toContainText('Daily source temporarily unavailable');
  await page.route('**/api/macro', route => route.fulfill({ json: macroFixture }));
  await page.getByRole('button', { name: 'Retry chart' }).click();
  await expect(page.locator('.daily-canvas canvas').first()).toBeVisible();
  await page.locator('#refresh-macro').click();
  await expect(page.locator('[data-macro="VIX"]')).toContainText('16.3');
  await expect(page.locator('#overview')).toContainText(current.overview.oneLineTake);
});
test('daily and legacy HTML route redirect to dashboard', async ({ request }) => {
  for (const path of ['/daily', '/daily/', '/daily.html']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(308); expect(response.headers().location).toBe('/');
  }
});

async function panelSpacing(page: Page) {
  return page.evaluate(() => {
    const columns = [['overview', 'nasdaq', 'charts', 'fx', 'changes'], ['catalysts', 'macro', 'themes', 'intelligence']];
    return columns.flatMap(ids => ids.slice(1).map((id, index) => ({
      pair: `${ids[index]} → ${id}`,
      gap: document.getElementById(id)!.getBoundingClientRect().top - document.getElementById(ids[index])!.getBoundingClientRect().bottom,
    })));
  });
}

for (const width of [1024, 1440, 1920]) {
  test(`populated ${width}px desktop has consistent gaps within both columns`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.locator('#brief-date')).toHaveValue(current.asOfDate);
    await expect(page.locator('[data-macro="US10Y"]')).toContainText('4.3%');
    for (const { pair, gap } of await panelSpacing(page)) {
      expect(gap, pair).toBeCloseTo(width <= 1100 ? 14 : 18, 0);
    }
  });
}

test('expanding research leaves the other column in place and closes gaps in its own column', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await populated(page); await page.goto('/');
  await expect(page.locator('[data-macro="US10Y"]')).toContainText('4.3%');
  const secondary = () => page.locator('#catalysts, #macro, #themes, #intelligence').evaluateAll(panels => panels.map(panel => panel.getBoundingClientRect().top + window.scrollY));
  const positions = await secondary();
  await page.locator('#nasdaq .research-detail').first().locator('summary').click();
  await page.locator('#fx .fx-instrument').first().locator('summary').click();
  expect(await secondary()).toEqual(positions);
  for (const { pair, gap } of await panelSpacing(page)) expect(gap, pair).toBeCloseTo(18, 0);
});

test('mobile and desktop resizing preserve panel order, open research and the interactive chart', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await populated(page); await page.goto('/');
  await page.locator('#chart-symbol').selectOption('CBOE:VIX');
  await expect(page.locator('.daily-canvas canvas').first()).toBeVisible();
  await page.locator('#fx .fx-instrument').first().locator('summary').click();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('.dashboard-grid > section')).toHaveCount(9);
  expect(await page.locator('.dashboard-grid > section').evaluateAll(panels => panels.map(panel => panel.id))).toEqual(['overview', 'catalysts', 'nasdaq', 'charts', 'themes', 'macro', 'fx', 'intelligence', 'changes']);
  await expect(page.locator('#fx .fx-instrument').first()).toHaveAttribute('open', '');
  await page.locator('#charts').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '1Y', exact: true }).click();
  await expect(page.getByRole('button', { name: '1Y', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.daily-canvas canvas').first()).toBeVisible();
  for (const { pair, gap } of await panelSpacing(page)) expect(gap, pair).toBeCloseTo(18, 0);
});
