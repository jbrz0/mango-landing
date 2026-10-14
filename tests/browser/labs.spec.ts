import { test, expect } from '@playwright/test';
import { assets } from '../../src/lib/global/schema';
const now = '2026-10-09T18:00:00.000Z';
const globalFixture = {
  retrievedAt: now,
  quotes: assets.map((a, i) => ({ symbol: a.symbol, price: 100 + i, changePct: i % 2 ? -0.75 : 1.25, updatedAt: now, history: [98, 101, 100 + i] })),
  unavailable: [], newsUnavailable: [], sentiment: { value: 59, label: 'Greed', updatedAt: '2026-10-09T00:00:00.000Z' },
  headlines: [
    { id: 'europe', headline: 'France debt and European bank stocks', url: 'https://example.com/europe', source: 'Publisher', publishedAt: now, tags: ['Rates', 'Europe'] },
    { id: 'crypto', headline: 'Bitcoin market update', url: 'https://example.com/crypto', source: 'Publisher', publishedAt: now, tags: ['Crypto'] },
    { id: 'unsafe', headline: '<img src=x onerror="window.injected=true"> Iran oil supply', url: 'https://example.com/oil', source: 'Publisher', publishedAt: now, tags: ['Geopolitics'] },
  ],
};
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(now));
  await page.route('**/api/global', route => route.fulfill({ json: globalFixture }));
  await page.route('**/api/macro', route => route.fulfill({ json: { series: ['VIX', 'VXN', 'US10Y'].map(symbol => ({ symbol, points: [{ date: '2026-10-08', value: 16 }, { date: '2026-10-09', value: 18 }], retrievedAt: now, refreshFailed: false })), unavailable: [] } }));
});
for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
  for (const route of ['global', 'tools']) {
    test(`${route} fits ${width}px and renders without app errors`, async ({ page }) => {
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${route}`);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
      if (route === 'global') { await expect(page.locator('#quote-status')).toContainText('12 / 12'); await expect(page.locator('.map-node')).toHaveCount(4); }
      else { await expect(page.locator('.product-card')).toHaveCount(6); await expect(page.locator('#calculator, #calc-form')).toHaveCount(0); }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}
test('global region, topic and asset filters update real content and safely escape text', async ({ page }) => {
  await page.goto('/global'); await expect(page.locator('#quote-status')).toContainText('12 / 12');
  await page.locator('[data-region="Europe"]').click();
  await expect(page.locator('#region-context h3')).toHaveText('Europe');
  await expect(page.locator('#news-feed')).toContainText('France debt');
  await expect(page.locator('#news-feed')).not.toContainText('Bitcoin market update');
  await page.locator('[data-region="World"]').click();
  await page.locator('[data-topic="Crypto"]').click();
  await expect(page.locator('#news-feed')).toContainText('Bitcoin market update');
  await expect(page.locator('#news-feed')).not.toContainText('France debt');
  await page.locator('[data-topic="Geopolitics"]').click();
  await expect(page.locator('#news-feed')).toContainText('<img src=x');
  expect(await page.evaluate(() => 'injected' in window)).toBe(false);
  await page.locator('[data-asset-group="FX"]').click();
  await expect(page.locator('.asset-tile')).toHaveCount(3);
  const map = page.locator('[data-map-region="Asia Pacific"]');
  await map.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[data-region="Asia Pacific"]')).toHaveAttribute('aria-pressed', 'true');
});
test('global cold feed failures leave regional controls and published research usable', async ({ page }) => {
  await page.route('**/api/global', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.route('**/api/macro', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.goto('/global');
  await expect(page.locator('#refresh-global')).toBeEnabled();
  await expect(page.locator('#quote-status')).toContainText('unavailable');
  await expect(page.locator('#news-feed .wire-story')).not.toHaveCount(0);
  await page.locator('[data-region="Europe"]').click();
  await expect(page.locator('#region-context h3')).toHaveText('Europe');
});
test('global failed refresh retains dated observations with an explicit failure label', async ({ page }) => {
  await page.goto('/global'); await expect(page.locator('#quote-status')).toContainText('12 / 12');
  await expect(page.locator('#refresh-global')).toBeEnabled();
  await page.route('**/api/global', route => route.fulfill({ status: 503, json: {} }));
  await page.locator('#refresh-global').click();
  await expect(page.locator('#quote-status')).toContainText('Refresh failed / Last known');
  await expect(page.locator('.asset-tile').first()).toContainText('+1.25%');
});
test('tool catalog filters, searches, opens accessible details and uses published links', async ({ page }) => {
  await page.goto('/tools');
  await page.locator('[data-category="Indicators"]').click(); await expect(page.locator('.product-card')).toHaveCount(2);
  await page.locator('[data-details="market-regime"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#dialog-content .product-cta')).toHaveAttribute('href', 'https://www.tradingview.com/script/xQLgC1fS-Mango-Atlas-Market-Regime-HUD/');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.locator('[data-category="All tools"]').click();
  await page.locator('#tool-search').fill('AI Fund'); await expect(page.locator('.product-card')).toHaveCount(1);
  await page.locator('[data-details="ai-fund"]').click();
  await expect(page.getByRole('dialog')).toContainText('Platform-independent');
  await expect(page.getByRole('dialog').locator('a')).toHaveCount(0);
});
test('calculator entry points open the standalone page and outdated entries are absent', async ({ page }) => {
  const calculatorUrl = 'https://www.mangoatlas.xyz/tools/calculator-futures';
  await page.goto('/tools');
  const localCalculatorUrl = new URL('/tools/calculator-futures', page.url()).href;
  // Keep navigation local while exercising the exact production links.
  await page.route(calculatorUrl, route => route.fulfill({ status: 302, headers: { location: localCalculatorUrl } }));
  await expect(page.locator('#catalog-count')).toHaveText('6 / 6 TOOLS');
  await expect(page.locator('.toolkit-heading')).toContainText('6 tools to start');
  await expect(page.getByText('Futures Session Dashboard', { exact: true })).toHaveCount(0);
  await expect(page.locator('a[href*="N0Gy9U5Q"], a[href="#calculator"], #calculator, #calc-form')).toHaveCount(0);
  await expect(page.locator('.featured-calculator')).toHaveAttribute('href', calculatorUrl);
  await expect(page.getByRole('link', { name: 'Open tool' })).toHaveAttribute('href', calculatorUrl);
  await page.locator('[data-details="futures-calculator"]').click();
  await expect(page.getByRole('dialog')).toContainText('Dollar targets to required points');
  await expect(page.getByRole('link', { name: 'Open free calculator' })).toHaveAttribute('href', calculatorUrl);
  await page.getByRole('link', { name: 'Open free calculator' }).click();
  await expect(page).toHaveURL(localCalculatorUrl);
  await expect(page.getByRole('heading', { name: 'Futures calculator.' })).toBeVisible();
});
test('new pages remain absent from dashboard navigation and footer', async ({ page }) => {
  await page.route('https://s3.tradingview.com/**', route => route.abort());
  await page.route('**/api/equities', route => route.fulfill({ json: { quotes: [], unavailable: [] } }));
  await page.goto('/');
  await expect(page.locator('a[href="/global"], a[href="/tools"]')).toHaveCount(0);
});
