import { test, expect } from '@playwright/test';
import snapshot from '../../public/data/gex/current.json' with { type: 'json' };
import { analyze, snapshotSchema } from '../../src/lib/gex/model';

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
  await page.goto('/gex');await expect(page.locator('#gex-status')).toContainText('LAST SAVED SNAPSHOT');await expect(page.locator('#gex-status')).toHaveClass(/is-stale/);
  await expect(page.locator('#gex-read-freshness')).toContainText('not current positioning');
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

test('compact dashboard reconciles the selected book, exact source times and expiry concentration', async({page})=>{
  await page.goto('/gex');
  await expect(page.getByRole('heading',{name:'QQQ Gamma Exposure',exact:true})).toBeVisible();
  await expect(page.getByText('THE POSITIONING DESK',{exact:true})).toHaveCount(0);
  await expect(page.locator('#methodology')).not.toHaveAttribute('open');
  for (const days of [7,30,90]) {
    await page.getByRole('button',{name:`Next ${days} days`,exact:true}).click();
    const b = analyze(snapshotSchema.parse(snapshot), days);
    await expect(page.locator('.gex-map-panel .panel-meta')).toContainText(`${b.contracts.length.toLocaleString('en-US')} OPTION SERIES`);
    await expect(page.locator('.gex-book-summary')).toContainText(`${b.contracts.reduce((sum,c)=>sum+c.oi,0).toLocaleString('en-US')} contracts`);
    const before = await page.locator('.gex-metrics').innerText();
    await page.locator('#gex-range').selectOption('0.08');
    expect(await page.locator('.gex-metrics').innerText()).toBe(before);
    await expect(page.getByRole('region',{name:'Market Read'})).toContainText(`${(b.largestExpiry!.gross/b.gross*100).toFixed(1)}% of gross`);
  }
  await expect(page.locator('#gex-status time')).toHaveCount(3);
  await expect(page.locator('#gex-status time').first()).toHaveAttribute('datetime',snapshot.quoteAsOf);
  await expect(page.locator('#gex-status time').nth(1)).toHaveAttribute('datetime',snapshot.chainAsOf);
  await page.locator('#methodology summary').click();
  await expect(page.locator('#methodology')).toContainText('Rates and dividends are assumed zero');
});

test('all chart modes share positive/negative colors and profile inspection works from the keyboard',async({page})=>{
  await page.goto('/gex');
  const key = async(selector:string, prop:string) => page.locator(selector).first().evaluate((el,prop)=>getComputedStyle(el).getPropertyValue(prop),prop);
  expect(await key('.gex-key-positive','background-color')).toBe('rgb(0, 230, 118)');
  expect(await key('.gex-key-negative','background-color')).toBe('rgb(255, 51, 85)');
  expect(await page.locator('[data-cell]').evaluateAll(els=>els.some(el=>(el as HTMLElement).style.background.includes('0, 230, 118')))).toBe(true);
  expect(await page.locator('[data-cell]').evaluateAll(els=>els.some(el=>(el as HTMLElement).style.background.includes('255, 51, 85')))).toBe(true);
  await expect(page.locator('.gex-level-strip')).toContainText('Nearest flip');
  await page.getByRole('button',{name:'Walls',exact:true}).click();
  expect(await key('.walls-call-bar','fill')).toBe('rgb(0, 230, 118)');
  expect(await key('.walls-put-bar','fill')).toBe('rgb(255, 51, 85)');
  await page.getByRole('button',{name:'By strike',exact:true}).click();
  expect(await key('.gex-call-bar i','background-color')).toBe('rgb(0, 230, 118)');
  expect(await key('.gex-put-bar i','background-color')).toBe('rgb(255, 51, 85)');
  const row=page.locator('.gex-profile-row').first();await row.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#gex-inspector')).toContainText('strike bucket');
  await expect(row).toHaveAttribute('aria-pressed','true');
});

test('empty selected expiry book shows no invented metrics or context',async({page})=>{
  const far = {...snapshot,contracts:snapshot.contracts.map(c=>({...c,expiry:'2027-12-17'}))};
  // Retain unique series when replacing expiry dates from a multi-expiry chain.
  far.contracts = [...new Map(far.contracts.map(c=>[`${c.side}:${c.strike}`,c])).values()];
  await page.route('**/data/gex/current.json',route=>route.fulfill({json:far}));
  await page.goto('/gex');
  await expect(page.locator('#gex-content')).toContainText('No usable option series');
  await expect(page.locator('.gex-metric')).toHaveCount(0);
  await expect(page.locator('.gex-market-read')).toHaveCount(0);
});

test('failed update marks retained context and regressed snapshots do not replace it',async({page})=>{
  await page.goto('/gex');await expect(page.locator('.gex-metric')).toHaveCount(5);
  const before=await page.locator('.gex-metrics').innerText();
  await page.route('**/data/gex/current.json',route=>route.fulfill({json:{...snapshot,chainAsOf:'2026-10-20T15:00:00Z'}}));
  await page.getByRole('button',{name:'Check for update'}).click();
  await expect(page.locator('#gex-status')).toContainText('UPDATE CHECK FAILED');
  await expect(page.locator('#gex-read-freshness')).toContainText('last saved snapshot');
  expect(await page.locator('.gex-metrics').innerText()).toBe(before);
});
