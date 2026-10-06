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
  await page.route('**/api/equities', route => route.fulfill({ json: { quotes: [{ symbol: 'AAPL', price: 110, changePct: 10, currency: 'USD', source: 'Yahoo Finance', updatedAt: '2026-01-14T20:00:00.000Z', retrievedAt: '2026-01-15T05:00:00.000Z', refreshFailed: false }], unavailable: [] } }));
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
  const selectedDate = archiveDates.find(date => date < current.asOfDate)!;
  const selectedBrief = JSON.parse(await readFile(resolve(`data/intel/archive/${selectedDate}.json`), 'utf8'));
  await page.goto('/'); await expect(page.locator('#brief-date')).toBeEnabled();
  await page.locator('#brief-date').selectOption(selectedDate);
  await expect(page.locator('#data-status')).toContainText('ARCHIVE');
  await expect(page.locator('#overview')).toContainText(selectedBrief.overview.oneLineTake);
  await expect(page.locator('#changes .section-meta')).not.toHaveText('PUBLISHED COMPARISONS');
  await expect(page.locator('#changes .section-meta')).toContainText('→');
  await expect(page.locator('#market-strip')).toContainText('Independent of briefing date');
  await expect(page.locator('[data-macro="VIX"]')).toContainText('16.3');
  await page.locator('#brief-date').selectOption(current.asOfDate);
  await expect(page.locator('#overview')).toContainText(current.overview.oneLineTake);
  const dates = await page.locator('#brief-date option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  expect(dates.every(date => Date.parse(current.asOfDate) - Date.parse(date) < 30 * 86400_000)).toBe(true);
});

test('Nasdaq displays sourced prices, opens one research section, and reuses the request', async ({ page }) => {
  let calls = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/equities') calls++; });
  await populated(page); await page.goto('/');
  const sections = page.locator('#nasdaq details');
  await sections.nth(1).locator('summary').click();
  await expect(page.locator('[data-equity="AAPL"]').first()).toContainText('$110.00');
  await expect(page.locator('[data-equity-source="AAPL"]').first()).toContainText('15 Jan 2026 · 3:00 AM ICT');
  await expect(sections.nth(1)).toContainText('Independent of briefing date');
  for (const index of [0, 2, 3, 1]) {
    await sections.nth(index).locator('summary').click();
    await expect(sections.nth(index)).toHaveAttribute('open', '');
    await expect(page.locator('#nasdaq details[open]')).toHaveCount(1);
  }
  expect(calls).toBe(1);
});

test('intelligence filters wrap without horizontal scrolling on desktop and mobile', async ({ page }) => {
  await populated(page);
  const data = { ...structuredClone(fixture), kind: 'briefing' };
  data.intelligence[0].tags = ['Technology', 'Semiconductors', 'Monetary policy', 'Employment', 'Geopolitics', 'Earnings', 'Inflation', 'Energy'];
  data.intelligence[1].tags = ['Currencies', 'Bonds', 'Commodities', 'Global markets', 'Fiscal policy', 'Consumer demand'];
  await page.route('**/data/intel/current.json', route => route.fulfill({ json: data }));
  await page.goto('/');
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.feed-filters button').last()).toBeAttached();
    const layout = await page.locator('.feed-filters').evaluate(element => ({ overflow: element.scrollWidth > element.clientWidth, rows: new Set([...element.children].map(child => child.getBoundingClientRect().top)).size }));
    expect(layout.overflow).toBe(false);
    expect(layout.rows).toBeGreaterThan(1);
  }
});

test('provider charts use the orange line and compact interval controls', async ({ page }) => {
  await page.route('**/embed-widget-advanced-chart.js', route => route.fulfill({ contentType: 'application/javascript', body: 'const frame = document.createElement("iframe"); frame.src = "https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale=en"; document.currentScript.parentElement.append(frame);' }));
  await page.route('https://www.tradingview-widget.com/**', route => route.fulfill({ body: '<html><body>Chart fixture</body></html>' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'NAS100 CFD chart' }).click();
  const config = () => page.locator('#chart-host script').evaluate(element => JSON.parse(element.textContent!));
  expect(await config()).toMatchObject({ style: '2', hide_top_toolbar: true, hide_legend: true, hide_volume: true, interval: '60', timezone: 'Asia/Bangkok', overrides: { 'mainSeriesProperties.lineStyle.color': '#ff990a' } });
  await expect(page.locator('#chart-host iframe')).toHaveAttribute('src', /overrides=/);
  const overrides = await page.locator('#chart-host iframe').evaluate(element => JSON.parse(new URL((element as HTMLIFrameElement).src).searchParams.get('overrides')!));
  expect(overrides).toMatchObject({ 'mainSeriesProperties.lineStyle.color': '#ff990a', 'mainSeriesProperties.lineStyle.colorType': 'solid' });
  await page.getByRole('button', { name: '4h', exact: true }).click();
  expect((await config()).interval).toBe('240');
  await expect(page.getByRole('button', { name: '4h', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('stock quote outage is explicit while research remains usable', async ({ page }) => {
  await page.route('**/api/equities', route => route.fulfill({ status: 503, json: { quotes: [], unavailable: ['AAPL'] } }));
  await populated(page); await page.goto('/');
  await page.locator('#nasdaq details').nth(1).locator('summary').click();
  await expect(page.locator('[data-equity="AAPL"]').first()).toHaveText('Price unavailable');
  await expect(page.locator('#nasdaq')).toContainText('EXAMPLE');
  await expect(page.locator('#chart-symbol')).toBeEnabled();
});

test.describe('viewer in New York', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('timestamps, research clock references and catalyst days all convert together', async ({ page }) => {
    // Keep this timezone scenario on its original briefing as daily data advances.
    const timezoneBrief = JSON.parse(await readFile(resolve('data/intel/archive/2026-10-02.json'), 'utf8'));
    await page.route('**/data/intel/current.json', route => route.fulfill({ json: timezoneBrief }));
    await page.route('**/data/intel/manifest.json', route => route.fulfill({ json: { dates: archiveDates.filter(date => date <= timezoneBrief.asOfDate) } }));
    await page.clock.setFixedTime(new Date('2026-10-02T02:00:00Z'));
    await page.goto('/');
    await expect(page.locator('.desk-clock')).toContainText('NEW YORK');
    await expect(page.locator('#data-status')).toContainText('01 Oct 2026 · 9:43 PM EDT');
    await expect(page.locator('#brief-date')).toHaveValue('2026-10-02');
    await expect(page.locator('#catalysts .event-date')).toHaveText('01 Oct 2026');
    await expect(page.locator('#catalysts .event-row')).toHaveCount(1);
    await expect(page.locator('#catalysts .event-row')).toContainText('7:30 PM');
    await page.getByRole('button', { name: '7 days', exact: true }).click();
    await expect(page.locator('#catalysts .event-row')).toHaveCount(6);
    await expect(page.locator('#catalysts')).toContainText('8:30 AM');
    await expect(page.locator('#nasdaq')).toContainText('NFP 8:30 AM EDT');
    await expect(page.locator('#themes')).toContainText('8:30 AM EDT');
    await expect(page.locator('[data-macro="US10Y"]')).toContainText('15 Jan 2026');
    await page.getByRole('button', { name: 'NAS100 CFD chart' }).click();
    expect(await page.locator('#chart-host script').evaluate(element => JSON.parse(element.textContent!).timezone)).toBe('America/New_York');
  });
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
  await expect(page.locator('#briefing-quotes')).toHaveCount(0);
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

test('readable research, icons, stock identities and flags survive narrow layouts and image failure', async ({ page }) => {
  await populated(page);
  const data = { ...structuredClone(fixture), kind: 'briefing' };
  data.nq.megaCaps = ['TSLA', 'AAPL'].map(symbol => ({ symbol, changePct: null, context: 'EXAMPLE leadership research', source: 'Test fixture', updatedAt: null }));
  data.fx.instruments.push({ symbol: 'XAUUSD', bias: null, driver: 'EXAMPLE gold context', posture: 'Watch only above 4,120. A close above 4,170 turns it bullish.', support: [4120], resistance: [4170], comments: null });
  data.intelligence[0].symbols.push('AAPL');
  await page.route('**/data/intel/current.json', route => route.fulfill({ json: data }));
  await page.route('**/company-logos/TSLA.png', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  await expect(page.locator('#brief-date')).toBeEnabled();
  await page.getByRole('button', { name: '7 days', exact: true }).click();
  await expect(page.locator('#catalysts img[src="/flags/jp.svg"]')).toBeVisible();
  await expect(page.locator('#catalysts img[src="/flags/us.svg"]').first()).toBeVisible();
  await page.locator('#nasdaq details').nth(1).locator('summary').click();
  const tesla = page.locator('.mover').filter({ has: page.locator('.stock-identity strong', { hasText: 'TSLA' }) }).first();
  await expect(tesla.locator('.company-logo img')).toBeHidden();
  await expect(tesla.locator('.stock-identity')).toContainText('TSLA');
  const apple = page.locator('.mover img[src="/company-logos/AAPL.png"]').first();
  await apple.scrollIntoViewIfNeeded();
  await expect(apple).toBeVisible();
  await expect.poll(() => apple.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('h2 .section-icon')).toHaveCount(9);
  await expect(page.locator('.story-tags .stock-identity')).toContainText('AAPL');
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px`).toBe(true);
    expect(await page.locator('.research-copy').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(15);
  }
  const gold = page.locator('.fx-instrument').filter({ has: page.locator('summary strong', { hasText: 'XAUUSD' }) });
  await expect(gold.locator('.badge')).toHaveText('Watch only');
  await gold.locator('summary').click();
  await expect(gold.getByRole('button', { name: 'Open XAUUSD chart' })).toHaveAttribute('data-chart', 'OANDA:XAUUSD');
});
