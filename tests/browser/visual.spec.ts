import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Intel } from '../../src/lib/intel/schema';

const current = JSON.parse(await readFile(resolve('data/intel/current.json'), 'utf8')) as Intel;
const fixture = JSON.parse(await readFile(resolve('data/intel/example.json'), 'utf8')) as Intel;
fixture.kind = 'briefing';
const previous: Intel = { ...structuredClone(fixture), asOfDate: '2026-01-14', generatedAt: '2026-01-14T08:00:00+07:00', markets: [{ ...fixture.markets[0]!, price: 19900, updatedAt: '2026-01-14T07:50:00+07:00' }], nq: null, events: [], intelligence: [] };
previous.overview!.sentiment = 'bearish';
previous.overview!.oneLineTake = 'Earlier published briefing for archive navigation.';
const views = ['overview', 'markets', 'leadership', 'levels', 'history', 'catalysts', 'themes', 'wire'] as const;

async function populated(page: Page, data = fixture) {
  await page.route('**/data/intel/current.json', route => route.fulfill({ json: data }));
  await page.route('**/data/intel/manifest.json', route => route.fulfill({ json: { dates: [data.asOfDate, previous.asOfDate] } }));
  await page.route('**/data/intel/archive/**', route => new URL(route.request().url()).pathname.endsWith(`${previous.asOfDate}.json`)
    ? route.fulfill({ json: previous }) : route.fulfill({ status: 404, body: '{}' }));
}
async function ready(page: Page) {
  await expect(page.locator('#brief-date')).toBeEnabled();
  await expect(page.locator('#item-picker')).toBeEnabled();
  await expect(page.locator('#brief-meta')).not.toContainText('MAPPING ARCHIVE');
}
async function openPoint(page: Page, view: string, id: string) {
  await page.locator(`[data-lens="${view}"]`).click();
  await page.locator('#item-picker').selectOption(id);
  await page.locator('#read-note').click();
  await expect(page.locator('#research-dialog')).toBeVisible();
}
async function fits(page: Page) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, viewportWidth: innerWidth, viewportHeight: innerHeight, x: scrollX, y: scrollY }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
  expect([dimensions.x, dimensions.y]).toEqual([0, 0]);
  for (const selector of ['#brief-date', '#item-picker', '#read-note', '.lens-nav']) {
    const box = await page.locator(selector).boundingBox();
    expect(box, selector).not.toBeNull();
    expect(box!.x, selector).toBeGreaterThanOrEqual(0);
    expect(box!.y, selector).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, selector).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
    expect(box!.y + box!.height, selector).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
  }
}

test.beforeEach(async ({ page }) => {
  // Text and layout remain deterministic when external fonts are unavailable.
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
});

for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [844, 390]]) {
  test(`all eight views remain usable without page scroll at ${width} × ${height}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await populated(page); await page.setViewportSize({ width, height }); await page.goto('/visual'); await ready(page);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    for (const view of views) {
      await page.locator(`[data-lens="${view}"]`).click();
      await expect(page.locator('.atlas-world')).toHaveAttribute('data-mode', view);
      await expect(page.locator(`[data-lens="${view}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-lens][aria-pressed="true"]')).toHaveCount(1);
      await expect(page.locator('#item-picker')).toBeEnabled();
      await fits(page);
      await page.locator('#read-note').click(); await expect(page.locator('#research-dialog')).toBeVisible();
      await page.keyboard.press('Escape'); await expect(page.locator('#research-dialog')).not.toBeVisible();
      if (view === 'history') {
        await page.locator('[data-history="changes"]').click();
        await page.locator('#item-picker').selectOption('shift:NQ');
        await fits(page); await page.locator('#read-note').click();
        await expect(page.locator('#research-dialog')).toContainText('19,900');
        await page.keyboard.press('Escape'); await page.locator('[data-history="bias"]').click();
      }
    }
    expect(errors).toEqual([]);
  });
}

test('published briefing reaches every market, leader, pair, event, theme and story', async ({ page }) => {
  await page.goto('/visual'); await ready(page);
  await expect(page.locator('#brief-date')).toHaveValue(current.asOfDate);
  const leaders = new Set([...(current.nq?.megaCaps ?? []), ...(current.nq?.semiconductors ?? []), ...(current.nq?.premarket ?? [])].map(item => item.symbol).filter(symbol => !['NQ', 'NQ=F', 'NDX', '^NDX', 'NASDAQ', 'NAS100', 'QQQ', '^IXIC'].includes(symbol)));
  const counts = { overview: 6, markets: current.markets.length, leadership: leaders.size, levels: current.fx?.instruments.length ?? 0, catalysts: current.events.length, themes: (current.overview?.themes.length ?? 0) + (current.overview?.risks.length ?? 0), wire: current.intelligence.length + new Set(current.intelligence.flatMap(story => story.tags)).size };
  for (const [view, count] of Object.entries(counts)) {
    await page.locator(`[data-lens="${view}"]`).click();
    await expect(page.locator('#item-picker option')).toHaveCount(count);
    await page.locator('#item-picker').selectOption({ index: count - 1 });
    await expect(page.locator('#item-position')).toHaveText(`${String(count).padStart(2, '0')} / ${String(count).padStart(2, '0')}`);
  }
  await page.goto('/');
  await expect(page.locator('a[href="/visual"], a[href="/visual.html"]')).toHaveCount(0);
});

test('market research preserves exact snapshot values, missing values and provenance', async ({ page }) => {
  await populated(page); await page.goto('/visual'); await ready(page);
  await openPoint(page, 'markets', 'market:NQ');
  await expect(page.locator('#research-dialog')).toContainText('20,000');
  await expect(page.locator('#research-dialog')).toContainText('+0.25%');
  await expect(page.locator('#research-dialog')).toContainText('Synthetic test fixture');
  await expect(page.locator('#research-dialog')).toContainText(fixture.markets[0]!.updatedAt!);
  await page.keyboard.press('Escape');
  await openPoint(page, 'markets', 'market:VIX');
  await expect(page.locator('#research-dialog')).toContainText('Not supplied');
  await expect(page.locator('#research-dialog')).toContainText('Unavailable');
  await page.keyboard.press('Escape');
  await openPoint(page, 'leadership', 'leadership:AAPL');
  await expect(page.locator('#research-dialog')).toContainText('Premarket');
  await expect(page.locator('#research-dialog')).toContainText('EXAMPLE: No price supplied.');
});

test('both selects inset their arrows and the experiment badge is removed', async ({ page }) => {
  await populated(page); await page.goto('/visual'); await ready(page);
  await expect(page.locator('.atlas-header')).not.toContainText('EXPERIMENT');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const selector of ['#brief-date', '#item-picker']) {
      const style = await page.locator(selector).evaluate(element => {
        const css = getComputedStyle(element);
        return { appearance: css.appearance, image: css.backgroundImage, position: css.backgroundPosition, right: parseFloat(css.paddingRight) };
      });
      expect(style.appearance).toBe('none');
      expect(style.image).toContain('data:image/svg+xml');
      expect(style.position).toContain('11px');
      expect(style.right).toBeGreaterThanOrEqual(27);
    }
  }
});

test('FX levels, event times, themes and wire sources retain their complete research', async ({ page }) => {
  await populated(page); await page.goto('/visual'); await ready(page);
  await openPoint(page, 'levels', 'fx:EURUSD');
  await expect(page.locator('#research-dialog')).toContainText('1.05');
  await expect(page.locator('#research-dialog')).toContainText('1.1');
  await expect(page.locator('#research-dialog')).toContainText(fixture.fx!.macroPulse!);
  await expect(page.locator('#research-dialog')).toContainText('EXAMPLE levels only.');
  await page.keyboard.press('Escape');
  await openPoint(page, 'catalysts', 'event:example-release');
  await expect(page.locator('#research-dialog')).toContainText('7:30 PM');
  await expect(page.locator('#research-dialog')).toContainText('High');
  await expect(page.locator('.source-link')).toHaveAttribute('href', fixture.events[0]!.source);
  await page.keyboard.press('Escape');
  await openPoint(page, 'themes', 'risk:0');
  await expect(page.locator('#research-dialog')).toContainText(fixture.overview!.risks[0]!);
  await page.keyboard.press('Escape');
  await openPoint(page, 'wire', 'story:example-tech');
  await expect(page.locator('#research-dialog')).toContainText(fixture.intelligence[1]!.summary);
  await expect(page.locator('.source-link')).toHaveAttribute('href', fixture.intelligence[1]!.url);
  await expect(page.locator('.source-link')).toHaveAttribute('rel', 'noopener noreferrer');
  await page.keyboard.press('Escape');
  await openPoint(page, 'wire', 'topic:Macro');
  await expect(page.locator('#research-dialog')).toContainText('1 story');
  await expect(page.locator('#research-dialog')).toContainText(fixture.intelligence[0]!.headline);
});

test('archive selector and history points open their actual published briefing', async ({ page }) => {
  await populated(page); await page.goto('/visual'); await ready(page);
  await page.locator('#brief-date').selectOption(previous.asOfDate);
  await expect(page.locator('#brief-meta')).toContainText('ARCHIVED BRIEF');
  await expect(page.locator('#selected-content')).toContainText(previous.overview!.oneLineTake!);
  await page.locator('#brief-date').selectOption(fixture.asOfDate);
  await page.locator('[data-lens="history"]').click();
  await expect(page.locator('#item-picker option')).toHaveCount(4);
  await page.locator('#item-picker').selectOption(`history:broad:${previous.asOfDate}`);
  await page.locator('.load-session').click();
  await expect(page.locator('#brief-date')).toHaveValue(previous.asOfDate);
  await page.locator('[data-lens="overview"]').click();
  await expect(page.locator('#selected-content')).toContainText(previous.overview!.oneLineTake!);
});

test('keyboard data navigation, camera controls and help work with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await populated(page); await page.goto('/visual'); await ready(page);
  await page.locator('#atlas-canvas').focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#item-picker')).toHaveValue('nq-bias');
  await page.keyboard.press('Enter'); await expect(page.locator('#research-dialog')).toContainText(fixture.nq!.summary!);
  await page.keyboard.press('Escape');
  await page.locator('#previous-item').click(); await expect(page.locator('#item-picker')).toHaveValue('regime');
  await page.locator('#next-item').click(); await expect(page.locator('#item-picker')).toHaveValue('nq-bias');
  await page.locator('#auto-rotate').click(); await expect(page.locator('#auto-rotate')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#auto-rotate').click(); await expect(page.locator('#auto-rotate')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#reset-view').click();
  await page.locator('#help').click(); await expect(page.locator('#research-dialog')).toContainText('Every point is accessible');
  await page.locator('#close-dialog').click(); await expect(page.locator('#research-dialog')).not.toBeVisible();
});

test('history snapshot changes compare stored quotes precisely and label missing comparisons', async ({ page }) => {
  await populated(page); await page.goto('/visual'); await ready(page);
  await page.locator('[data-lens="history"]').click(); await page.locator('[data-history="changes"]').click();
  await page.locator('#item-picker').selectOption('shift:NQ'); await page.locator('#read-note').click();
  await expect(page.locator('#research-dialog')).toContainText('19,900');
  await expect(page.locator('#research-dialog')).toContainText('20,000');
  await expect(page.locator('#research-dialog')).toContainText('0.5025125628140703');
  await expect(page.locator('#research-dialog')).toContainText('does not establish a daily session return');
  await page.keyboard.press('Escape');
  await page.locator('#item-picker').selectOption('shift:US10Y'); await page.locator('#read-note').click();
  await expect(page.locator('#research-dialog')).toContainText('Not comparable');
  await expect(page.locator('#research-dialog')).toContainText('previous briefing has no snapshot for this symbol');
  await page.keyboard.press('Escape');
  await page.locator('#item-picker').selectOption('shift:research'); await page.locator('#read-note').click();
  await expect(page.locator('#research-dialog')).toContainText('Bearish → Neutral');
});

test('safe text rendering includes full untruncated research in the dialog', async ({ page }) => {
  const data = structuredClone(fixture);
  const attack = '<img src=x onerror="window.injected=true">';
  data.overview!.oneLineTake = `${attack} ${'Published research. '.repeat(30)}VISIBLE END`;
  data.intelligence[0]!.headline = `${attack} SAFE HEADLINE`;
  data.intelligence[0]!.summary = `${attack} SAFE SUMMARY`;
  await populated(page, data); await page.goto('/visual'); await ready(page);
  await page.locator('#read-note').click();
  await expect(page.locator('#research-dialog')).toContainText(attack);
  await expect(page.locator('#research-dialog')).toContainText('VISIBLE END');
  await expect(page.locator('#research-dialog img')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await openPoint(page, 'wire', 'story:example-macro');
  await expect(page.locator('#research-dialog')).toContainText('SAFE HEADLINE');
  await expect(page.locator('#research-dialog')).toContainText('SAFE SUMMARY');
  expect(await page.evaluate(() => 'injected' in window)).toBe(false);
});

test('WebGL failure leaves every value and source accessible on a phone', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: function(this: HTMLCanvasElement, kind: string) { return kind.includes('webgl') ? null : Reflect.apply(original, this, [kind]); } });
  });
  await populated(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/visual'); await ready(page);
  await expect(page.locator('.atlas-world')).toHaveClass(/no-webgl/);
  await expect(page.locator('#reset-view')).toBeDisabled();
  await expect(page.locator('.fallback-node')).toHaveCount(6);
  await page.locator('.fallback-node[data-node="nq-bias"]').click(); await expect(page.locator('#item-picker')).toHaveValue('nq-bias');
  await openPoint(page, 'wire', 'story:example-tech');
  await expect(page.locator('.source-link')).toHaveAttribute('href', fixture.intelligence[1]!.url);
  await page.keyboard.press('Escape'); await fits(page);
});

test('cold data failure displays an actionable retry without a blank atlas', async ({ page }) => {
  await page.route('**/data/intel/**', route => route.fulfill({ status: 503, body: '{}' }));
  await page.setViewportSize({ width: 320, height: 568 }); await page.goto('/visual');
  await expect(page.locator('#brief-meta')).toHaveText('BRIEFING UNAVAILABLE');
  await expect(page.locator('#scene-message')).toContainText('The briefing could not be loaded.');
  await expect(page.locator('#retry-data')).toBeVisible();
  await expect(page.locator('#brief-date')).toBeDisabled();
  await expect(page.locator('#read-note')).toBeDisabled();
  await expect(page.locator('[data-lens]')).toHaveCount(8);
  await expect(page.locator('#retry-data')).toBeInViewport();
});
