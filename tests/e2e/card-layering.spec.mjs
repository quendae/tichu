import { test, expect } from '@playwright/test';

test('overlapping cards isolate their labels and artwork from neighbouring cards', async ({ page }) => {
  await page.goto('/');
  const cards = page.locator('.seat-bottom .card');
  await expect(cards).toHaveCount(8);

  const stacking = await cards.evaluateAll(nodes => nodes.map(card => ({
    isolation: getComputedStyle(card).isolation,
    position: getComputedStyle(card).position,
  })));

  expect(stacking.length).toBeGreaterThan(1);
  for (const card of stacking) {
    expect(card.position).toBe('relative');
    expect(card.isolation).toBe('isolate');
  }
});
