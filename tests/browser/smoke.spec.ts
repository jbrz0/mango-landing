import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Lean smoke coverage: every public route survives feed outages, and briefing freshness follows the weekday publish schedule.
const fixture = JSON.parse(await readFile(resolve('data/intel/example.json'), 'utf8'));
const routes = ['/', '/gex', '/global', '/tools', '/visual', '/tools/calculator-futures'];

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(`console: ${message.text()}`); });
  return errors;
}

for (const width of [390, 1440]) {
  test(`all routes render without app errors when every feed fails at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route(/^https:\/\/(s3\.tradingview\.com|fonts\.googleapis\.com|www\.googletagmanager\.com)\//, route => route.abort());
    await page.route('**/api/**', route => route.fulfill({ status: 503, json: {} }));
    await page.route('**/data/**', route => route.fulfill({ status: 503, body: '' }));
    const errors = collectErrors(page);
    for (const path of routes) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} overflow`).toBe(true);
    }
    await page.goto('/');
    await expect(page.locator('#data-status')).toContainText('UNAVAILABLE');
    await page.goto('/gex');
    await expect(page.locator('#gex-status')).toContainText(/unavailable/i);
    expect(errors).toEqual([]);
  });
}

async function publishFriday(page: Page) {
  const data = { ...structuredClone(fixture), kind: 'briefing', asOfDate: '2026-01-16', generatedAt: '2026-01-16T08:35:00+07:00' };
  data.intelligence = data.intelligence.map((item: { publishedAt: string | null }, i: number) => ({ ...item, publishedAt: null, ...(i === 0 ? { url: 'https://www.bloomberg.com/news/articles/2026-01-15/example-story' } : {}) }));
  await page.route('https://s3.tradingview.com/**', route => route.abort());
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: {} }));
  await page.route('**/data/intel/current.json', route => route.fulfill({ json: data }));
  await page.route('**/data/intel/manifest.json', route => route.fulfill({ json: { dates: ['2026-01-16'] } }));
}

const noStaleText = async (page: Page) => expect(await page.locator('body').innerText()).not.toMatch(/stale|predate/i);

test('a Friday brief keeps its real date over the weekend and before the Monday publish', async ({ page }) => {
  await publishFriday(page);
  for (const instant of ['2026-01-18T05:00:00Z', '2026-01-19T01:00:00Z']) {
    await page.clock.setFixedTime(new Date(instant));
    await page.goto('/');
    await expect(page.locator('#data-status')).toContainText('PREVIOUS BRIEF');
    await expect(page.locator('#data-status')).toContainText('16 Jan');
    await noStaleText(page);
  }
  // An untimed story shows its source date neutrally when the publisher URL carries one.
  await expect(page.locator('.story').first().locator('time')).toHaveAttribute('datetime', '2026-01-15');
});

test('a missed weekday publish shows no stale label, keeps the true date and warns in the console', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
  await publishFriday(page);
  await page.clock.setFixedTime(new Date('2026-01-19T04:00:00Z')); // Monday 11:00 BKK, the Monday brief is overdue
  await page.goto('/');
  await expect(page.locator('#data-status')).toContainText('PREVIOUS BRIEF');
  await expect(page.locator('#data-status')).toContainText('16 Jan');
  await expect(page.locator('#data-status')).not.toContainText('LATEST');
  await noStaleText(page);
  await page.goto('/global');
  await expect(page.locator('#brief-status')).toContainText('16 Jan 2026');
  await noStaleText(page);
  await page.goto('/visual');
  await expect(page.locator('#brief-meta')).toContainText('PUBLISHED SNAPSHOT');
  await noStaleText(page);
  expect(warnings.filter(text => text.includes('[mango-atlas] brief 2026-01-16')).length).toBeGreaterThanOrEqual(3);
});
