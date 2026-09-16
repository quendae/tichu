import { test, expect } from '@playwright/test';

test('Grand Tichu decision keeps keyboard focus when an opponent declares', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => clearTimeout(window.tichu.game.botTimer));

  const pass = page.locator('[data-inline="grand-pass"]');
  await expect(pass).toBeVisible();
  await pass.focus();
  await expect(pass).toBeFocused();

  await page.evaluate(() => {
    const game = window.tichu.game;
    game.declareGrand(1, false);
    clearTimeout(game.botTimer);
  });

  await expect(pass).toBeFocused();

  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.tichu.game.state.declarations[0])).toBe('none');
});
