import { test, expect } from '@playwright/test';

test('Blender materials decode and exchange remains interactive', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const materials = await page.evaluate(async () => {
    const declarations = [
      getComputedStyle(document.querySelector('.table')).backgroundImage,
      getComputedStyle(document.querySelector('.table'), '::after').backgroundImage,
      getComputedStyle(document.querySelector('.card-back'), '::after').backgroundImage,
    ];
    return Promise.all(declarations.map(async declaration => {
      const url = declaration.match(/url\("?([^"\)]+)"?\)/)?.[1];
      if (!url) throw new Error('Missing material in computed CSS');
      const image = new Image(); image.src = url;
      await image.decode();
      return { url, width: image.naturalWidth, height: image.naturalHeight };
    }));
  });
  expect(materials.map(image => image.url.split('/').pop())).toEqual([
    'walnut-lacquer.webp', 'tea-felt.webp', 'dragon-medallion.webp',
  ]);
  expect(materials.every(image => image.width >= 768 && image.height >= 768)).toBe(true);
  await page.locator('[data-inline="grand-pass"]').click();
  await expect(page.locator('.seat-bottom [data-card]')).toHaveCount(14);
  await expect(page.locator('[data-inline="exchange-confirm"]')).toBeDisabled();
  for (let i = 0; i < 3; i++) {
    // Let the previous card's hover lift settle before approaching its neighbour.
    await page.mouse.move(0, 0);
    // Click the exposed corner, not the centre hidden under the next card.
    await page.locator('.seat-bottom [data-card]:not(.assigned)').first().click({ position: { x: 8, y: 8 } });
  }
  await expect(page.locator('[data-inline="exchange-confirm"]')).toBeEnabled();
  await page.locator('[data-inline="exchange-confirm"]').click();
  await expect.poll(() => page.evaluate(() => window.tichu.game.state.phase)).toBe('play');
  expect(errors).toEqual([]);
});

test('missing decorative assets preserve cards and keyboard actions', async ({ page }) => {
  await page.route('**/assets/blender/*.webp', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.seat-bottom .card')).toHaveCount(8);
  const fallback = await page.evaluate(() => ({
    table: getComputedStyle(document.querySelector('.table')).backgroundColor,
    felt: getComputedStyle(document.querySelector('.table'), '::after').backgroundColor,
    glyph: getComputedStyle(document.querySelector('.back-glyph')).color,
  }));
  for (const color of Object.values(fallback)) expect(color).not.toBe('rgba(0, 0, 0, 0)');
  const pass = page.locator('[data-inline="grand-pass"]');
  await pass.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.seat-bottom [data-card]')).toHaveCount(14);
  await expect(page.locator('[data-inline="exchange-confirm"]')).toBeVisible();
});
