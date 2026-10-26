import { test, expect } from '@playwright/test';
import snapshot from '../../public/data/gex/current.json' with { type: 'json' };

test.beforeEach(async ({page})=>{
  await page.clock.setFixedTime(new Date(snapshot.retrievedAt));
  await page.route('**/data/gex/current.json',route=>route.fulfill({json:snapshot}));
});
for(const width of [320,390,768,1440]) {
  test(`GEX renders real saved data and fits ${width}px`,async({page})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height:1000});await page.goto('/gex');
    await expect(page.locator('.gex-metric').first()).toContainText(snapshot.spot.toFixed(2));
    await expect(page.locator('.gex-heatmap')).toBeVisible();
    await expect(page.locator('.site-nav a[href="/gex"]')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
test('expiry window, chart view, range and keyboard cell inspection work',async({page})=>{
  await page.goto('/gex');
  await page.getByRole('button',{name:'Next 7 days',exact:true}).click();
  await expect(page.locator('.gex-map-panel .panel-meta')).toContainText('NEXT 7 DAYS');
  await page.locator('#gex-range').selectOption('0.02');
  await expect(page.locator('.gex-heatmap-scale')).toContainText('$1 STRIKE BUCKETS');
  const cell=page.locator('[data-cell]').first();await cell.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#gex-inspector')).toContainText('Calls $');
  await page.getByRole('button',{name:'By strike',exact:true}).click();
  await expect(page.locator('.gex-profile')).toBeVisible();await expect(page.locator('.gex-heatmap')).toHaveCount(0);
  await page.getByRole('button',{name:'Next 90 days',exact:true}).click();
  await expect(page.locator('.gex-map-panel .panel-meta')).toContainText('NEXT 90 DAYS');
  await page.getByRole('button',{name:'Heatmap',exact:true}).click();
  await expect(page.locator('.gex-heatmap')).toBeVisible();
});
test('failed update checks preserve dated data, and a cold failure never invents levels',async({page})=>{
  await page.goto('/gex');await expect(page.locator('.gex-metric')).toHaveCount(5);
  await page.route('**/data/gex/current.json',route=>route.fulfill({status:503,json:{}}));
  await page.getByRole('button',{name:'Check for update'}).click();
  await expect(page.locator('#gex-status')).toContainText('UPDATE CHECK FAILED');
  await expect(page.locator('.gex-metric')).toHaveCount(5);
  await page.reload();await expect(page.locator('#gex-content')).toContainText('The map is waiting for data');
  await expect(page.locator('.gex-metric')).toHaveCount(0);
});
test('old data during a trading session is shown as the last saved snapshot',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-10-29T18:00:00Z'));
  await page.goto('/gex');await expect(page.locator('#gex-status')).toContainText('LAST SAVED SNAPSHOT');await expect(page.locator('#gex-status')).not.toContainText(/stale/i);
});

for (const width of [320,390,768,1440]) {
  test(`Walls chart exposes key levels and fits ${width}px`, async({page})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height:1000});await page.goto('/gex');
    await page.getByRole('button',{name:'Walls',exact:true}).click();
    await expect(page.locator('.gex-walls')).toBeVisible();
    await expect(page.locator('#gex-range')).toHaveValue('levels');
    expect(await page.locator('.gex-walls-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    for(const [kind,index] of [['call',2],['put',3],['spot',0],['flip',4]] as const) {
      const exact = (await page.locator('.gex-metric strong').nth(index).innerText()).replace('$','');
      await expect(page.locator(`[data-wall-marker="${kind}"] .walls-level-price`)).toHaveText(exact);
    }
    const row = page.locator('[data-wall-strike]').first();
    await row.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#gex-inspector')).toContainText('strike bucket');
    await expect(page.locator('#gex-inspector')).toContainText('Calls $');
    await page.locator('#gex-range').selectOption('0.02');
    await expect(page.locator('.gex-walls-caption')).toContainText('EACH SIDE');
    await page.getByRole('button',{name:'Next 7 days',exact:true}).click();
    await expect(page.locator('[data-view="walls"]')).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.gex-map-panel .panel-meta')).toContainText('NEXT 7 DAYS');
    await page.getByRole('button',{name:'Heatmap',exact:true}).click();
    await expect(page.locator('.gex-heatmap')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
