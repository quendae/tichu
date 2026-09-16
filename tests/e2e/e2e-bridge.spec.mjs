import {test,expect} from '@playwright/test';

test('normal navigation never installs bridge',async({page})=>{
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(()=>typeof window.__tichuE2E)).toBe('undefined');
});

test('e2e=1 installs safe bridge',async({page})=>{
  await page.goto('/?e2e=1');
  await expect.poll(()=>page.evaluate(()=>typeof window.__tichuE2E)).toBe('object');
  const status=await page.evaluate(()=>window.__tichuE2E.getMultiplayerStatus());
  expect(status).not.toHaveProperty('resumeToken');
  expect(status).not.toHaveProperty('session');
});
