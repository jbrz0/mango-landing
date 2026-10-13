import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const current = JSON.parse(await readFile(resolve('data/intel/current.json'), 'utf8'));

test('visual renders the briefing, stays unlisted, and escapes text', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/visual');
  await expect(page.locator('h1')).toContainText('See the brief');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('#one-line')).toContainText(current.overview.oneLineTake);
  await expect(page.locator('#field-list')).toContainText(current.markets[0].symbol);
  await expect(page.locator('#quote-strip')).toContainText('NQ');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);

  await page.goto('/');
  const hrefs = await page.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href') ?? ''));
  expect(hrefs.some(href => href.includes('/visual'))).toBe(false);
});

test('visual fits a phone width', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/visual');
  await expect(page.locator('#one-line')).toContainText(current.overview.oneLineTake.slice(0, 40));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});

test('visual escapes briefing text', async ({ page }) => {
  const data = structuredClone(current);
  data.overview.oneLineTake = '<img src=x onerror="window.injected=true"> VISUAL SAFE';
  await page.route('**/data/intel/current.json', route => route.fulfill({ json: data }));
  await page.route('**/data/intel/manifest.json', route => route.fulfill({ json: { dates: [data.asOfDate] } }));
  await page.route('**/data/intel/archive/**', route => route.fulfill({ json: data }));
  await page.goto('/visual');
  await expect(page.locator('#one-line')).toContainText('<img src=x');
  await expect(page.locator('#one-line')).toContainText('VISUAL SAFE');
  expect(await page.evaluate(() => 'injected' in window)).toBe(false);
});
