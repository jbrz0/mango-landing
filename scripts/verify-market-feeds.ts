import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { chartSymbols } from '../src/components/chart';
import { quoteSymbols } from '../src/components/markets';
import { macroResponseSchema } from '../src/lib/markets/schema';
import { equityResponseSchema } from '../src/lib/markets/equities';

// Opt-in live provider audit. Keep external network availability out of CI.
const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
const output = '.intel-work/market-audit';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
const results: Array<{ symbol: string; ok: boolean; detail: string }> = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  const macro = macroResponseSchema.parse(await (await page.request.get(new URL('/api/macro', url).href)).json());
  expect(macro.unavailable).toEqual([]);
  for (const series of macro.series) {
    expect(series.refreshFailed).toBe(false);
    console.log(`${series.symbol}: ${series.points.length} daily observations, latest ${JSON.stringify(series.points.at(-1))}`);
  }
  const quotes = page.frameLocator('#market-strip iframe').locator('body');
  await expect(quotes).toContainText(quoteSymbols.at(-1)!.title, { timeout: 20_000 });
  await expect.poll(async () => (await quotes.innerText()).match(/\d[\d,.]*%/g)?.length ?? 0, { timeout: 20_000 }).toBeGreaterThanOrEqual(quoteSymbols.length);
  const quoteText = await quotes.innerText();
  for (const symbol of quoteSymbols) expect(quoteText).toContain(symbol.title);
  expect(quoteText).not.toMatch(/unavailable|invalid symbol|only available/i);
  console.log('All quote-strip instruments returned prices and percentage changes.');
  const equities = equityResponseSchema.parse(await (await page.request.get(new URL('/api/equities', url).href)).json());
  expect(equities.unavailable).toEqual([]);
  expect(equities.quotes.length).toBeGreaterThan(0);
  for (const quote of equities.quotes) {
    expect(quote.refreshFailed).toBe(false);
    await expect(page.locator(`[data-equity="${quote.symbol}"]`).first()).toContainText(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(quote.price));
    await expect(page.locator(`[data-equity-source="${quote.symbol}"]`).first()).toContainText('Yahoo Finance');
  }
  const equityResponse = await page.request.head(new URL('/api/equities', url).href);
  expect(equityResponse.status()).toBe(200);
  expect(equityResponse.headers()['cache-control']).toContain('max-age=60');
  // Vercel consumes s-maxage at the edge and strips it from the browser response.
  if (!equityResponse.headers()['x-vercel-cache']) expect(equityResponse.headers()['cache-control']).toContain('s-maxage=900');
  expect((await page.request.post(new URL('/api/equities', url).href)).status()).toBe(405);
  await page.locator('#nasdaq details').nth(1).locator('summary').click();
  await page.locator('#nasdaq').screenshot({ path: `${output}/nasdaq-prices.png` });
  await page.locator('#nasdaq details').nth(1).locator('summary').click();
  await page.locator('#intelligence').screenshot({ path: `${output}/intelligence-tags.png` });
  console.log(`All ${equities.quotes.length} Nasdaq stock/ETF quotes returned sourced prices; shared cache headers verified.`);
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.quote-scroll').evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await page.screenshot({ path: `${output}/mobile-quotes.png` });
  await page.locator('#chart-symbol').selectOption('CBOE:VIX');
  await expect(page.locator('.daily-canvas canvas').first()).toBeVisible();
  await page.locator('#charts').screenshot({ path: `${output}/mobile-vix.png` });
  await page.locator('#nasdaq details').nth(1).locator('summary').click();
  await page.locator('#nasdaq').screenshot({ path: `${output}/mobile-nasdaq-prices.png` });
  const socialY = await page.locator('.footer-socials a').evaluateAll(links => links.map(link => link.getBoundingClientRect().y));
  expect(socialY[0]).toBe(socialY[1]); expect(errors).toEqual([]);
  await page.close();

  const queue = [...chartSymbols];
  await Promise.all(Array.from({ length: 3 }, async () => {
    let instrument;
    while ((instrument = queue.shift())) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const appErrors: string[] = []; page.on('pageerror', error => appErrors.push(error.message));
      try {
        await page.route('**/embed-widget-tickers.js', route => route.abort());
        await page.goto(url);
        await page.locator('#chart-symbol').scrollIntoViewIfNeeded();
        await page.locator('#chart-symbol').selectOption(instrument.id);
        let detail: string;
        if (instrument.daily) {
          await expect(page.locator('.daily-canvas canvas').first()).toBeVisible({ timeout: 20_000 });
          detail = await page.locator('.daily-readout').innerText();
          expect(detail).toMatch(/\d/); expect(detail).not.toMatch(/failed|Last available|Last published/);
          await page.getByRole('button', { name: '1Y', exact: true }).click();
        } else {
          const body = page.frameLocator('#chart-host iframe').locator('body');
          await expect(page.frameLocator('#chart-host iframe').locator('canvas').first()).toBeVisible({ timeout: 25_000 });
          await expect.poll(() => page.frameLocator('#chart-host iframe').locator('canvas').evaluateAll(canvases => canvases.reduce((count, canvas) => {
            const context = (canvas as HTMLCanvasElement).getContext('2d');
            if (!context) return count;
            const pixels = context.getImageData(0, 0, (canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height).data;
            for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 240 && pixels[i + 1] > 140 && pixels[i + 1] < 170 && pixels[i + 2] < 30) count++;
            return count;
          }, 0)), { timeout: 15_000 }).toBeGreaterThan(100);
          detail = `Orange line rendered; ${await body.innerText()}`;
          expect(detail).not.toMatch(/only available|invalid symbol|Try picking/i);
        }
        expect(appErrors).toEqual([]);
        await page.locator('#charts').screenshot({ path: `${output}/${instrument.id.replaceAll(':', '-')}.png` });
        results.push({ symbol: instrument.id, ok: true, detail: detail.slice(0, 500) });
        console.log(`PASS ${instrument.id}`);
      } catch (error) {
        results.push({ symbol: instrument.id, ok: false, detail: String(error) });
        console.error(`FAIL ${instrument.id}: ${error}`);
      } finally { await page.close(); }
    }
  }));
  await writeFile(`${output}/results.json`, JSON.stringify({ url, verifiedAt: new Date().toISOString(), results }, null, 2));
  expect(results.filter(result => !result.ok)).toEqual([]);
} finally { await browser.close(); }
