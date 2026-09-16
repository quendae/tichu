import { test, expect } from '@playwright/test';

test('overlapping cards keep lower-card labels behind the next card', async ({ page }) => {
  await page.goto('/');
  const cards = page.locator('.seat-bottom .card');
  await expect(cards).toHaveCount(8);

  const hit = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.seat-bottom .card')];
    const lower = cards[0];
    const upper = cards[1];
    const lowerRect = lower.getBoundingClientRect();
    const upperRect = upper.getBoundingClientRect();

    const x = Math.max(upperRect.left + 2, lowerRect.right - 8);
    const y = lowerRect.bottom - 8;
    const target = document.elementFromPoint(x, y);

    return {
      lowerId: lower.getAttribute('data-card-id'),
      upperId: upper.getAttribute('data-card-id'),
      hitCardId: target?.closest('.card')?.getAttribute('data-card-id') ?? null,
      hitClass: target?.className ?? null,
    };
  });

  expect(hit.hitCardId).toBe(hit.upperId);
});
