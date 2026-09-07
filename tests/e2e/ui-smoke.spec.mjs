import { test, expect } from '@playwright/test';

for(const route of ['/']){
  test(`approved table concept renders without overflow ${route}`,async({page},testInfo)=>{
    const errors=[];page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});page.on('pageerror',err=>errors.push(err.message));
    await page.goto(route);
    await expect(page).toHaveTitle(/Tichu/i);
    await expect(page.locator('.table')).toBeVisible();
    await expect(page.locator('.scoreboard')).toBeVisible();
    await expect(page.locator('.table-menu')).toBeVisible();
    await expect(page.locator('.seat-bottom .card')).toHaveCount(8);
    await expect(page.locator('#coach-menu-state')).toHaveText('ON');

    const overflow=await page.evaluate(()=>({body:document.body.scrollWidth-innerWidth,html:document.documentElement.scrollWidth-innerWidth}));
    expect(overflow.body).toBeLessThanOrEqual(1);expect(overflow.html).toBeLessThanOrEqual(1);

    await page.locator('[data-action="coach-toggle"]').first().click();
    await expect(page.locator('#coach-menu-state')).toHaveText('OFF');
    await page.locator('[data-action="coach-toggle"]').first().click();
    await expect(page.locator('#coach-menu-state')).toHaveText('ON');

    await page.locator('[data-action="open-rules"]').first().click();
    await expect(page.locator('.modal')).toBeVisible();
    await page.locator('[data-modal="close"]').click();
    await expect(page.locator('.modal')).toHaveCount(0);

    expect(errors).toEqual([]);
    await page.screenshot({path:`test-results/${testInfo.project.name}.png`,fullPage:false});
  });
}
