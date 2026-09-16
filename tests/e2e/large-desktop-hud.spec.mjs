import { test, expect } from '@playwright/test';

test('large desktop scales HUD while Coach shows help without section labels', async ({ page }) => {
  await page.setViewportSize({ width: 2542, height: 1283 });
  await page.goto('/');

  const initial = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
    const style = selector => getComputedStyle(document.querySelector(selector));
    return {
      topbarHeight: rect('.topbar')?.height ?? 0,
      scoreboardHeight: rect('.scoreboard')?.height ?? 0,
      playerBadgePaddingTop: parseFloat(style('.seat-top .player-badge').paddingTop),
      playerNameSize: parseFloat(style('.seat-top .player-copy b').fontSize),
      playerMetaSize: parseFloat(style('.seat-top .player-copy small').fontSize),
      coachLabels: [...document.querySelectorAll('.coach-guide small')].map(node => ({
        text: node.textContent.trim(),
        display: getComputedStyle(node).display,
      })),
      coachSectionDisplay: style('.coach-guide > div').display,
    };
  });

  expect(initial.topbarHeight).toBeGreaterThanOrEqual(66);
  expect(initial.scoreboardHeight).toBeGreaterThanOrEqual(54);
  expect(initial.playerBadgePaddingTop).toBeGreaterThanOrEqual(7);
  expect(initial.playerNameSize).toBeGreaterThanOrEqual(15);
  expect(initial.playerMetaSize).toBeGreaterThanOrEqual(10);
  expect(initial.coachLabels.map(label => label.text)).toEqual(['Cel', 'Teraz', 'Dlaczego']);
  for (const label of initial.coachLabels) expect(label.display).toBe('none');
  expect(initial.coachSectionDisplay).toBe('block');

  await page.evaluate(() => {
    const game = window.tichu.game;
    clearTimeout(game.botTimer);
    game.botDelay = 0;
    game.scheduleBots();
  });
  await page.locator('[data-inline="grand-pass"]').click();
  await expect(page.locator('[data-inline="exchange-confirm"]')).toBeVisible();

  const exchange = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
    const style = selector => getComputedStyle(document.querySelector(selector));
    return {
      controllerHeight: rect('.exchange-controller')?.height ?? 0,
      headingSize: parseFloat(style('.exchange-heading b').fontSize),
      confirmHeight: rect('.confirm-exchange')?.height ?? 0,
      recipientNameSize: parseFloat(style('.recipient-name').fontSize),
      turnStatusSize: parseFloat(style('.turn-status').fontSize),
    };
  });

  expect(exchange.controllerHeight).toBeGreaterThanOrEqual(150);
  expect(exchange.headingSize).toBeGreaterThanOrEqual(18);
  expect(exchange.confirmHeight).toBeGreaterThanOrEqual(40);
  expect(exchange.recipientNameSize).toBeGreaterThanOrEqual(13);
  expect(exchange.turnStatusSize).toBeGreaterThanOrEqual(13);
});
