import { test, expect } from '@playwright/test';

test('answers both MNQ examples and preserves the last entered value through changes', async ({ page }) => {
  await page.goto('/tools/calculator-futures#mnq');
  const quantity = page.getByLabel('Amount of contracts', { exact: true });
  const points = page.getByLabel('Points move', { exact: true });
  const money = page.getByLabel('Amount of money', { exact: true });
  await quantity.fill('10');
  await points.fill('150');
  await expect(money).toHaveValue('3000.00');
  await expect(page.locator('#money-calculated')).toBeVisible();
  await money.fill('$3,000');
  await expect(points).toHaveValue('150');
  await expect(page.locator('#points-calculated')).toBeVisible();
  await quantity.fill('20');
  await expect(money).toHaveValue('$3,000');
  await expect(points).toHaveValue('75');
  await page.getByLabel('Contract', { exact: true }).selectOption('NQ');
  await expect(points).toHaveValue('7.5');
  await expect(money).toHaveValue('$3,000');
  await expect(page).toHaveURL(/#nq$/);
  await points.fill('-0.25');
  await expect(money).toHaveValue('-100.00');
  await quantity.fill('10');
  await expect(money).toHaveValue('-50.00');
});

test('all contracts, query links and live hash changes use the correct multipliers', async ({ page }) => {
  await page.goto('/tools/calculator-futures?contract=mbt');
  const contract = page.getByLabel('Contract', { exact: true });
  await expect(contract).toHaveValue('MBT');
  await page.getByLabel('Amount of contracts', { exact: true }).fill('10');
  await page.getByLabel('Points move', { exact: true }).fill('150');
  const expectations = { NQ: '30000.00', ES: '75000.00', MNQ: '3000.00', MES: '7500.00', GC: '150000.00', MGC: '15000.00', CL: '1500000.00', MCL: '150000.00', BTC: '7500.00', MBT: '150.00' };
  for (const [symbol, result] of Object.entries(expectations)) {
    await contract.selectOption(symbol);
    await expect(page.getByLabel('Amount of money', { exact: true })).toHaveValue(result);
  }
  await page.evaluate(() => { location.hash = '#mes'; });
  await expect(contract).toHaveValue('MES');
  await expect(page.getByLabel('Amount of money', { exact: true })).toHaveValue('7500.00');
});

test('keyboard navigation selects existing values and reset retains the contract', async ({ page }) => {
  await page.goto('/tools/calculator-futures#gc');
  await page.getByLabel('Contract', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Amount of contracts', { exact: true })).toBeFocused();
  await page.keyboard.type('10');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Points move', { exact: true })).toBeFocused();
  await page.keyboard.type('15');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Amount of money', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Amount of money', { exact: true })).toHaveValue('15000.00');
  await page.keyboard.type('3000');
  await expect(page.getByLabel('Points move', { exact: true })).toHaveValue('3');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Reset' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Contract', { exact: true })).toHaveValue('GC');
  await expect(page.getByLabel('Amount of contracts', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('Amount of contracts', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Points move', { exact: true })).toBeEmpty();
  await expect(page.getByLabel('Amount of money', { exact: true })).toBeEmpty();
});

test('invalid and cleared inputs remove stale answers, while zero remains a valid value', async ({ page }) => {
  await page.goto('/tools/calculator-futures');
  const quantity = page.getByLabel('Amount of contracts', { exact: true });
  const points = page.getByLabel('Points move', { exact: true });
  const money = page.getByLabel('Amount of money', { exact: true });
  await points.fill('150');
  await expect(money).toHaveValue('300.00');
  await quantity.fill('0');
  await expect(money).toBeEmpty();
  await expect(quantity).toHaveAttribute('aria-invalid', 'true');
  await quantity.fill('1.5');
  await expect(money).toBeEmpty();
  await quantity.fill('10');
  await expect(money).toHaveValue('3000.00');
  await points.fill('abc');
  await expect(money).toBeEmpty();
  await expect(points).toHaveAttribute('aria-invalid', 'true');
  await points.fill('0');
  await expect(money).toHaveValue('0.00');
  await points.fill('');
  await expect(money).toBeEmpty();
  await money.fill('3000');
  await expect(points).toHaveValue('150');
  await quantity.fill('');
  await expect(points).toBeEmpty();
  await expect(page.locator('#futures-status')).toContainText('whole number');
});

for (const width of [320, 390, 768, 1440]) {
  test(`large calculator controls fit ${width}px without overflow or app errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/tools/calculator-futures#mnq');
    await expect(page.getByRole('heading', { name: 'Futures calculator.' })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(3);
    await page.getByLabel('Amount of contracts', { exact: true }).fill('10');
    await page.getByLabel('Points move', { exact: true }).fill('150');
    await expect(page.getByLabel('Amount of money', { exact: true })).toHaveValue('3000.00');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.getByLabel('Points move', { exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(82);
    expect((await page.getByRole('button', { name: 'Reset' }).boundingBox())!.height).toBeGreaterThanOrEqual(64);
    expect(errors).toEqual([]);
  });
}
