import { test, expect } from '@playwright/test';

test('overlapping cards isolate their labels and artwork from neighbouring cards', async ({ page }) => {
  await page.goto('/');
  const cards = page.locator('.seat-bottom .card');
  await expect(cards).toHaveCount(8);

  const geometry = await cards.evaluateAll(nodes => nodes.map(card => {
    const rect = card.getBoundingClientRect();
    const corner = card.querySelector('.card-corner')?.getBoundingClientRect();
    const art = card.querySelector('.art-layer')?.getBoundingClientRect();
    return {
      card: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      corner: corner && { left: corner.left, right: corner.right, top: corner.top, bottom: corner.bottom },
      art: art && { left: art.left, right: art.right, top: art.top, bottom: art.bottom },
    };
  }));

  expect(geometry.length).toBeGreaterThan(1);
  expect(geometry.slice(1).some((entry,index) => entry.card.left < geometry[index].card.right)).toBe(true);

  const inside = (child,parent) => child
    && child.left >= parent.left - 1
    && child.right <= parent.right + 1
    && child.top >= parent.top - 1
    && child.bottom <= parent.bottom + 1;

  for (const entry of geometry) {
    expect(inside(entry.corner,entry.card)).toBe(true);
    expect(inside(entry.art,entry.card)).toBe(true);
  }
});