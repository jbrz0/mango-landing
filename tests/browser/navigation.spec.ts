import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://s3.tradingview.com/**', route => route.abort());
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: {} }));
  // Navigation must also work on devices that cannot render the 3D scene.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function(this: HTMLCanvasElement, kind: string) {
        return kind.includes('webgl') ? null : Reflect.apply(original, this, [kind]);
      },
    });
  });
});

for (const width of [320, 390, 768, 1024, 1101, 1440]) {
  test(`site navigation stays visible and fits each page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/visual', '/global', '/tools', '/tools/calculator-futures']) {
      await page.goto(path);
      const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
      await expect(nav.getByRole('link')).toHaveCount(4);
      await expect(nav.locator('[aria-current="page"]')).toHaveAttribute('href', path.startsWith('/tools') ? '/tools' : path);
      for (const link of await nav.getByRole('link').all()) await expect(link).toBeInViewport();
      const boxes = await nav.getByRole('link').evaluateAll(links => links.map(link => {
        const { x, y, width, height } = link.getBoundingClientRect();
        return { x, y, width, height };
      }));
      for (const [index, box] of boxes.entries()) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        if (width <= 1100) expect(box.height).toBeGreaterThanOrEqual(44);
        if (index) expect(box.x).toBeGreaterThanOrEqual(boxes[index - 1]!.x + boxes[index - 1]!.width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

for (const width of [320, 1440]) {
  test(`visitors can move between all site pages at ${width}px using the keyboard`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const [label, path] of [['Tools', '/tools'], ['Global Intel', '/global'], ['Visual Atlas', '/visual'], ['Dashboard', '/']]) {
      const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
      await nav.getByRole('link', { name: label, exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new URL(path!, 'http://127.0.0.1:5173').href);
      await expect(nav.locator('[aria-current="page"]')).toHaveText(label!);
    }
    // The mobile sticky header must leave section targets readable.
    await page.getByRole('navigation', { name: 'Dashboard sections' }).getByRole('link', { name: 'FX', exact: true }).click();
    await expect(page).toHaveURL(/#fx$/);
    await expect.poll(async () => {
      const headerBottom = await page.locator('.site-header').evaluate(element => getComputedStyle(element).position === 'sticky' ? element.getBoundingClientRect().bottom : 0);
      const sectionTop = await page.locator('#fx').evaluate(element => element.getBoundingClientRect().top);
      return sectionTop >= headerBottom - 1;
    }).toBe(true);
  });
}
