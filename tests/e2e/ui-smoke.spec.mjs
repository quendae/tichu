import { test, expect } from '@playwright/test';

for(const route of ['/']){
  test(`approved table concept stays playable and unclipped ${route}`,async({page},testInfo)=>{
    const errors=[];page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});page.on('pageerror',err=>errors.push(err.message));
    await page.goto(route);
    await expect(page).toHaveTitle(/Tichu/i);
    await expect(page.locator('.table')).toBeVisible();
    await expect(page.locator('.scoreboard')).toBeVisible();
    await expect(page.locator('.table-menu')).toBeVisible();
    await expect(page.locator('.seat-bottom .card')).toHaveCount(8);
    await expect(page.locator('#coach-menu-state')).toHaveText('ON');

    const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
    const grand=page.locator('[data-inline="grand-call"]');
    await expect(grand).toBeVisible();
    const grandBox=await grand.boundingBox();
    expect(grandBox).not.toBeNull();
    expect(grandBox.x).toBeGreaterThanOrEqual(-1);expect(grandBox.x+grandBox.width).toBeLessThanOrEqual(viewport.width+1);
    expect(grandBox.y).toBeGreaterThanOrEqual(-1);expect(grandBox.y+grandBox.height).toBeLessThanOrEqual(viewport.height+1);

    const overflow=await page.evaluate(()=>({body:document.body.scrollWidth-innerWidth,html:document.documentElement.scrollWidth-innerWidth}));
    expect(overflow.body).toBeLessThanOrEqual(1);expect(overflow.html).toBeLessThanOrEqual(1);

    // Exercise worst-case hand geometry without changing the game rules: render 14 visible cards.
    await page.evaluate(()=>{
      const game=window.tichu.game,state=game.state;
      state.hands[0]=[...state.hands[0],...state.hands[1].slice(0,6)].map((card,index)=>({...card,id:`layout-${index}-${card.id}`}));
      game.dispatchEvent(new CustomEvent('change',{detail:state}));
    });
    await expect(page.locator('.seat-bottom .card')).toHaveCount(14);

    const geometry=await page.evaluate(()=>{
      const hand=document.querySelector('.seat-bottom .player-hand'),cards=[...document.querySelectorAll('.seat-bottom .card')];
      const hs=getComputedStyle(hand),cs=cards[1]?getComputedStyle(cards[1]):null,hr=hand.getBoundingClientRect();
      return {
        viewport:{width:innerWidth,height:innerHeight},
        hand:{left:hr.left,right:hr.right,width:hr.width,handStep:hs.getPropertyValue('--hand-step'),cardWidth:hs.getPropertyValue('--card-width')},
        card:{width:cs?.width,marginLeft:cs?.marginLeft},
      };
    });
    console.log(`HAND_GEOMETRY ${testInfo.project.name} ${JSON.stringify(geometry)}`);
    await page.screenshot({path:`test-results/${testInfo.project.name}.png`,fullPage:false});

    const cardBounds=await page.locator('.seat-bottom .card').evaluateAll(cards=>cards.map(card=>{
      const r=card.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
    }));
    for(const r of cardBounds){
      expect(r.left).toBeGreaterThanOrEqual(-1);expect(r.right).toBeLessThanOrEqual(viewport.width+1);
      expect(r.top).toBeGreaterThanOrEqual(-1);expect(r.bottom).toBeLessThanOrEqual(viewport.height+1);
    }

    await page.locator('[data-action="coach-toggle"]').first().click();
    await expect(page.locator('#coach-menu-state')).toHaveText('OFF');
    await page.locator('[data-action="coach-toggle"]').first().click();
    await expect(page.locator('#coach-menu-state')).toHaveText('ON');

    await page.locator('[data-action="open-rules"]').first().click();
    await expect(page.locator('.modal')).toBeVisible();
    await page.locator('[data-modal="close"]').click();
    await expect(page.locator('.modal')).toHaveCount(0);

    expect(errors).toEqual([]);
  });
}
