import { test, expect } from '@playwright/test';

async function renderFourteenCardHands(page, prefix = 'responsive') {
  await page.evaluate(prefix => {
    const game = window.tichu.game;
    const source = game.state.hands.flat();
    game.state.hands = Array.from({ length: 4 }, (_, seat) => Array.from({ length: 14 }, (_, index) => ({
      ...source[(seat * 7 + index) % source.length],
      id: `${prefix}-${seat}-${index}`,
    })));
    game.dispatchEvent(new CustomEvent('change', { detail: game.state }));
  }, prefix);
  await expect(page.locator('[data-card-zone="local"] .card')).toHaveCount(14);
}

async function responsiveCardGeometry(page) {
  return page.evaluate(() => {
    const local = document.querySelector('[data-card-zone="local"]');
    const opponent = document.querySelector('[data-card-zone="opponent"]');
    const cardRects = [...document.querySelectorAll('[data-card-zone] .card')].map(card => card.getBoundingClientRect());
    return {
      localCardWidth: parseFloat(getComputedStyle(local.querySelector('.card')).width),
      localHandStep: parseFloat(getComputedStyle(local).getPropertyValue('--hand-step')),
      opponentCardWidth: parseFloat(getComputedStyle(opponent.querySelector('.card')).width),
      opponentHandStep: parseFloat(getComputedStyle(opponent).getPropertyValue('--hand-step')),
      cardsInViewport: cardRects.every(rect => rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1),
    };
  });
}

for(const route of ['/']){
  test(`approved table concept stays playable and unclipped ${route}`,async({page},testInfo)=>{
    const errors=[];page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});page.on('pageerror',err=>errors.push(err.message));
    await page.goto(route);
    await expect(page).toHaveTitle(/Tichu/i);
    await expect(page.locator('.table')).toBeVisible();
    await expect(page.locator('.scoreboard')).toBeVisible();
    await expect(page.locator('#game-menu-button')).toBeVisible();
    await expect(page.locator('.seat-bottom .card')).toHaveCount(8);
    await expect(page.locator('#coach-menu-state')).toHaveText('ON');
    await expect(page.locator('[data-coach-section="goal"]')).toContainText('Cel');
    await expect(page.locator('[data-coach-section="action"]')).toContainText('Teraz');
    await expect(page.locator('[data-coach-section="reason"]')).toContainText('Dlaczego');

    const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
    const grand=page.locator('[data-inline="grand-call"]');
    await expect(grand).toBeVisible();
    const grandBox=await grand.boundingBox();
    expect(grandBox).not.toBeNull();
    expect(grandBox.x).toBeGreaterThanOrEqual(-1);expect(grandBox.x+grandBox.width).toBeLessThanOrEqual(viewport.width+1);
    expect(grandBox.y).toBeGreaterThanOrEqual(-1);expect(grandBox.y+grandBox.height).toBeLessThanOrEqual(viewport.height+1);
    if(viewport.height<=520){
      const coachBox=await page.locator('#coach-panel').boundingBox();
      const overlap=!(grandBox.x+grandBox.width<=coachBox.x||grandBox.x>=coachBox.x+coachBox.width||grandBox.y+grandBox.height<=coachBox.y||grandBox.y>=coachBox.y+coachBox.height);
      expect(overlap).toBe(false);
    }

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

    if(viewport.height>520){
      await page.locator('.coach-dock [data-action="coach-toggle"]').click();
      await expect(page.locator('#coach-menu-state')).toHaveText('OFF');
      await page.locator('#game-menu-button').click();
      await page.locator('#game-menu [data-action="coach-toggle"]').click();
      await expect(page.locator('#coach-menu-state')).toHaveText('ON');
    }else{
      await page.locator('#game-menu-button').click();
      await page.locator('#game-menu [data-action="coach-toggle"]').click();
      await expect(page.locator('#coach-menu-state')).toHaveText('OFF');
      await page.locator('#game-menu-button').click();
      await page.locator('#game-menu [data-action="coach-toggle"]').click();
      await expect(page.locator('#coach-menu-state')).toHaveText('ON');
    }

    await page.locator('#game-menu-button').click();
    await page.locator('#game-menu [data-action="open-rules"]').click();
    await expect(page.locator('.modal')).toBeVisible();
    await page.locator('[data-modal="close"]').click();
    await expect(page.locator('.modal')).toHaveCount(0);

    expect(errors).toEqual([]);
  });
}

test('wide table and card indices remain large and separated', async ({ page }) => {
  await page.setViewportSize({ width: 2542, height: 1283 });
  await page.goto('/');
  const geometry = await page.evaluate(() => {
    const table = document.querySelector('.table').getBoundingClientRect();
    const card = document.querySelector('.seat-bottom .card').getBoundingClientRect();
    const corner = document.querySelector('.seat-bottom .card-corner').getBoundingClientRect();
    const art = document.querySelector('.seat-bottom .art-layer').getBoundingClientRect();
    const intersects = !(corner.right <= art.left || corner.left >= art.right || corner.bottom <= art.top || corner.top >= art.bottom);
    return { tableWidth: table.width, viewportWidth: innerWidth, cardWidth: card.width, intersects };
  });
  expect(geometry.tableWidth / geometry.viewportWidth).toBeGreaterThanOrEqual(.82);
  expect(geometry.cardWidth).toBeGreaterThanOrEqual(88);
  expect(geometry.intersects).toBe(false);
});

test('desktop card geometry keeps seats, cards, and captions in stable zones', async ({ page }) => {
  await page.setViewportSize({ width: 2542, height: 1283 });
  await page.goto('/');

  await page.evaluate(() => {
    const state = window.tichu.game.state;
    const source = state.hands.flat().map((card, index) => ({ ...card, id: `geometry-${index}-${card.id}` }));
    state.hands = [source.slice(0, 14), source.slice(14, 28), source.slice(0, 14), source.slice(14, 28)];
    let cursor = 0;
    state.table = [1, 2, 5, 8].map((count, seat) => ({
      seat,
      cards: source.slice(cursor, cursor += count),
      play: { type: 'single', value: 2 },
    }));
    window.tichu.game.dispatchEvent(new CustomEvent('change', { detail: state }));
  });

  await expect(page.locator('[data-card-zone="local"] .card')).toHaveCount(14);
  await expect(page.locator('[data-card-zone="table"] .card')).toHaveCount(13);

  const geometry = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    const cardWidth = selector => parseFloat(getComputedStyle(document.querySelector(selector)).width);
    const cardHeight = selector => parseFloat(getComputedStyle(document.querySelector(selector)).height);
    const intersects = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    const table = rect('.table');
    const localCards = [...document.querySelectorAll('[data-card-zone="local"] .card')].map(card => card.getBoundingClientRect());
    const tableCards = [...document.querySelectorAll('[data-card-zone="table"] .card')].map(card => card.getBoundingClientRect());
    const stage = rect('.trick-stage');
    const groups = [...document.querySelectorAll('.trick-play')].map(group => {
      const caption = group.querySelector('.play-caption').getBoundingClientRect();
      const cards = [...group.querySelectorAll('.card')].map(card => card.getBoundingClientRect());
      return { caption, cards, insideStage: [...cards, caption].every(item => item.left >= stage.left - 1 && item.right <= stage.right + 1 && item.top >= stage.top - 1 && item.bottom <= stage.bottom + 1) };
    });
    const corner = rect('[data-card-zone="local"] .card-corner');
    const art = rect('[data-card-zone="local"] .art-layer');
    const topBadge = rect('.seat-top .player-badge');
    const leftSeat = rect('.seat-left');
    const rightSeat = rect('.seat-right');
    return {
      opponentWidths: [1, 2, 3].map(seat => cardWidth(`.seat[data-seat="${seat}"] [data-card-zone="opponent"] .card`)),
      tableCardWidth: cardWidth('[data-card-zone="table"] .card'),
      localCardWidth: cardWidth('[data-card-zone="local"] .card'),
      tableCardHeight: cardHeight('[data-card-zone="table"] .card'),
      localCardHeight: cardHeight('[data-card-zone="local"] .card'),
      topBadgeCenter: topBadge.left + topBadge.width / 2,
      tableCenter: table.left + table.width / 2,
      leftInset: leftSeat.left - table.left,
      rightInset: table.right - rightSeat.right,
      captionOverlapsCards: groups.some(group => tableCards.some(card => intersects(group.caption, card))),
      captionsOverlap: groups.some((group, index) => groups.slice(index + 1).some(other => intersects(group.caption, other.caption))),
      groupsInsideStage: groups.every(group => group.insideStage),
      localInViewport: localCards.every(card => card.left >= -1 && card.right <= innerWidth + 1 && card.top >= -1 && card.bottom <= innerHeight + 1),
      cornerOverlapsArt: intersects(corner, art),
    };
  });

  expect(geometry.opponentWidths).toEqual([96, 96, 96]);
  expect(geometry.tableCardWidth).toBe(96);
  expect(geometry.localCardWidth).toBe(104);
  expect(geometry.tableCardHeight).toBe(142);
  expect(geometry.localCardHeight).toBe(154);
  expect(Math.abs(geometry.topBadgeCenter - geometry.tableCenter)).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.leftInset - geometry.rightInset)).toBeLessThanOrEqual(2);
  expect(geometry.captionOverlapsCards).toBe(false);
  expect(geometry.captionsOverlap).toBe(false);
  expect(geometry.groupsInsideStage).toBe(true);
  expect(geometry.localInViewport).toBe(true);
  expect(geometry.cornerOverlapsArt).toBe(false);

  await page.locator('#game-menu-button').click();
  await page.locator('[data-action="open-dev-ui"]').click();
  await page.locator('[data-layout-key="localCardWidth"]').fill('112');
  await page.locator('[data-layout-key="opponentCardWidth"]').fill('112');
  await page.locator('[data-layout-key="playedCardStep"]').fill('72');
  await expect.poll(() => page.locator('[data-card-zone="local"] .card').first().evaluate(card => card.getBoundingClientRect().width)).toBe(112);
  await expect.poll(() => page.locator('[data-card-zone="table"] .card').first().evaluate(card => parseFloat(getComputedStyle(card).width))).toBe(112);
  await expect.poll(() => page.locator('.trick-play').evaluateAll(groups => {
    const stage=groups[0].closest('.trick-stage').getBoundingClientRect();
    return groups.every(group => {
      const rect=group.getBoundingClientRect();
      return rect.left>=stage.left-1&&rect.right<=stage.right+1;
    });
  })).toBe(true);
  await page.locator('[data-layout-key="badgeScale"]').fill('125');
  await page.locator('[data-layout-key="coachTextScale"]').fill('130');
  await expect.poll(() => page.locator('.seat-bottom .avatar').evaluate(avatar => parseFloat(getComputedStyle(avatar).width))).toBe(60);
  await expect.poll(() => page.locator('.coach-guide b').first().evaluate(text => parseFloat(getComputedStyle(text).fontSize))).toBeCloseTo(16.9, 1);
});

test('side badges share the vertical fan centerlines at standard desktop width', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop seat-axis geometry is covered once.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const axes = await page.evaluate(() => {
    const centerX = element => {
      const rect = element.getBoundingClientRect();
      return rect.left + rect.width / 2;
    };
    const axis = side => ({
      badge: centerX(document.querySelector(`.seat-${side} .player-badge`)),
      fan: centerX(document.querySelector(`.seat-${side} .opponent-hand-side`)),
    });
    return { left: axis('left'), right: axis('right') };
  });
  expect(Math.abs(axes.left.badge - axes.left.fan)).toBeLessThanOrEqual(2);
  expect(Math.abs(axes.right.badge - axes.right.fan)).toBeLessThanOrEqual(2);
});

test('tablet hand geometry stays bounded at defaults and persisted desktop extremes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Tablet breakpoint geometry is covered once.');
  await page.setViewportSize({ width: 800, height: 800 });
  await page.goto('/');
  await renderFourteenCardHands(page, 'tablet-default');
  const defaults = await responsiveCardGeometry(page);
  expect(defaults.cardsInViewport).toBe(true);
  await page.locator('#game-menu-button').click();
  await page.locator('[data-action="open-dev-ui"]').click();
  await expect(page.locator('[data-layout-key="localHandStep"]')).toBeDisabled();
  await page.locator('[data-action="close-dev-ui"]').click();

  await page.evaluate(() => localStorage.setItem('tichu.qqnd.desktop-layout.v1', JSON.stringify({
    localCardWidth: 124,
    opponentCardWidth: 112,
    localHandStep: 84,
    opponentHandStep: 48,
    playedCardStep: 72,
  })));
  await page.reload();
  await renderFourteenCardHands(page, 'tablet-persisted');
  const persisted = await responsiveCardGeometry(page);
  expect(persisted.cardsInViewport).toBe(true);
  expect(persisted).toEqual(defaults);
});

test('fourteen-card local hand fits every desktop breakpoint without shrinking cards', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop breakpoint geometry is covered once.');
  const layouts = [
    { name: 'default', values: null, widths: { 680: 52, 681: 78, 800: 78, 900: 78, 901: 104, 1024: 104, 1440: 104 } },
    { name: 'persisted-maxima', values: { localCardWidth: 124, localHandStep: 84 }, widths: { 680: 52, 681: 78, 800: 78, 900: 78, 901: 124, 1024: 124, 1440: 124 } },
  ];
  const viewportWidths = [680, 681, 800, 900, 901, 1024, 1440];

  for (const layout of layouts) {
    for (const width of viewportWidths) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await page.evaluate(values => {
        const key = 'tichu.qqnd.desktop-layout.v1';
        if (values) localStorage.setItem(key, JSON.stringify(values));
        else localStorage.removeItem(key);
      }, layout.values);
      await page.reload();
      await renderFourteenCardHands(page, `local-hand-${layout.name}-${width}`);

      const geometry = await page.evaluate(() => {
        const hand = document.querySelector('[data-card-zone="local"]');
        const table = document.querySelector('.table').getBoundingClientRect();
        const style = getComputedStyle(hand);
        const cards = [...hand.querySelectorAll('.card')].map(card => card.getBoundingClientRect());
        const secondCardStyle = getComputedStyle(hand.querySelectorAll('.card')[1]);
        return {
          cardWidth: cards[0].width,
          configuredStep: parseFloat(style.getPropertyValue('--configured-hand-step')),
          effectiveStep: cards[1].width + parseFloat(secondCardStyle.marginLeft),
          cardsFit: cards.every(card => card.left >= -1 && card.right <= innerWidth + 1 && card.top >= -1 && card.bottom <= innerHeight + 1 && card.left >= table.left - 1 && card.right <= table.right + 1 && card.top >= table.top - 1 && card.bottom <= table.bottom + 1),
        };
      });

      expect(geometry.cardsFit, `${layout.name} at ${width}px`).toBe(true);
      expect(geometry.cardWidth, `${layout.name} at ${width}px`).toBeCloseTo(layout.widths[width], 1);
      expect(geometry.effectiveStep, `${layout.name} at ${width}px`).toBeLessThanOrEqual(geometry.configuredStep + .1);
      if (layout.name === 'default' && width === 1440) expect(geometry.effectiveStep).toBeCloseTo(72, 1);
    }
  }
});

test('current trick keeps two readable recent plays on desktop and only the latest on compact screens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Current-trick responsive geometry is covered once.');

  const renderLongTrick = async prefix => {
    await page.evaluate(prefix => {
      const state = window.tichu.game.state;
      const source = state.hands.flat().map((card, index) => ({ ...card, id: `${prefix}-${index}-${card.id}` }));
      state.settings = { ...state.settings, animations: false };
      state.phase = 'play';
      state.currentPlayer = 0;
      let cursor = 0;
      state.table = [1, 8, 8].map((count, index) => ({
        seat: [1, 2, 3][index],
        cards: source.slice(cursor, cursor += count),
        play: { type: 'single', value: index + 2 },
      }));
      window.tichu.game.dispatchEvent(new CustomEvent('change', { detail: state }));
    }, prefix);
    await expect(page.locator('.trick-play')).toHaveCount(2);
    await expect(page.locator('.trick-play').nth(0).locator('.card')).toHaveCount(8);
    await expect(page.locator('.trick-play').nth(1).locator('.card')).toHaveCount(8);
  };

  const readGeometry = () => page.evaluate(() => {
    const intersects = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    const stage = document.querySelector('.trick-stage').getBoundingClientRect();
    const actions = document.querySelector('.table-actions').getBoundingClientRect();
    const topSeat = document.querySelector('.seat-top').getBoundingClientRect();
    const bottomSeat = document.querySelector('.seat-bottom').getBoundingClientRect();
    const groups = [...document.querySelectorAll('.trick-play')].map(group => {
      const caption = group.querySelector('.play-caption').getBoundingClientRect();
      const cards = [...group.querySelectorAll('.card')].map(card => card.getBoundingClientRect());
      return { rect: group.getBoundingClientRect(), caption, cards, opacity: Number(getComputedStyle(group).opacity) };
    });
    const allItems = groups.flatMap(group => [...group.cards, group.caption]);
    return {
      bounds: { stage, actions, topSeat, bottomSeat },
      stageClearOfActions: !intersects(stage, actions),
      stageClearOfHands: !intersects(stage, topSeat) && !intersects(stage, bottomSeat),
      actionsClearOfHands: !intersects(actions, topSeat) && !intersects(actions, bottomSeat),
      allInsideStage: allItems.every(item => item.left >= stage.left - 1 && item.right <= stage.right + 1 && item.top >= stage.top - 1 && item.bottom <= stage.bottom + 1),
      groupsOverlap: intersects(groups[0].rect, groups[1].rect),
      captionsOverlap: intersects(groups[0].caption, groups[1].caption),
      captionsOverlapCards: groups.some(group => groups.some(other => other.cards.some(card => intersects(group.caption, card)))),
      captionsBelowOwnCards: groups.every(group => group.caption.top >= Math.max(...group.cards.map(card => card.bottom))),
      opacities: groups.map(group => group.opacity),
      tableCardWidths: [...document.querySelectorAll('[data-card-zone="table"] .card')].map(card => parseFloat(getComputedStyle(card).width)),
      opponentCardWidth: parseFloat(getComputedStyle(document.querySelector('[data-card-zone="opponent"] .card')).width),
    };
  });

  const layouts = [
    { width: 2542, height: 1283, name: 'large-default', values: null },
    { width: 2542, height: 1283, name: 'large-max', values: { opponentCardWidth: 112, playedCardStep: 72 } },
    { width: 1440, height: 900, name: 'standard-default', values: null },
    { width: 1440, height: 900, name: 'standard-max', values: { opponentCardWidth: 112, playedCardStep: 72 } },
  ];
  for (const layout of layouts) {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await page.goto('/');
    await page.evaluate(values => {
      const key = 'tichu.qqnd.desktop-layout.v1';
      if (values) localStorage.setItem(key, JSON.stringify(values));
      else localStorage.removeItem(key);
    }, layout.values);
    await page.reload();
    await renderLongTrick(layout.name);
    const geometry = await readGeometry();
    expect(geometry.stageClearOfActions, layout.name).toBe(true);
    expect(geometry.stageClearOfHands, `${layout.name} ${JSON.stringify(geometry.bounds)}`).toBe(true);
    expect(geometry.actionsClearOfHands, `${layout.name} ${JSON.stringify(geometry.bounds)}`).toBe(true);
    expect(geometry.allInsideStage, layout.name).toBe(true);
    expect(geometry.groupsOverlap, layout.name).toBe(true);
    expect(geometry.captionsOverlap, layout.name).toBe(false);
    expect(geometry.captionsOverlapCards, layout.name).toBe(false);
    expect(geometry.captionsBelowOwnCards, layout.name).toBe(true);
    expect(geometry.opacities[0], layout.name).toBeLessThan(geometry.opacities[1]);
    expect(geometry.opacities[1], layout.name).toBe(1);
    expect(geometry.tableCardWidths.every(width => Math.abs(width - geometry.opponentCardWidth) <= 1), layout.name).toBe(true);
  }

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await renderLongTrick('compact');
  await expect(page.locator('.trick-play').nth(0)).toBeHidden();
  await expect(page.locator('.trick-play.latest')).toBeVisible();
});

test('compact geometry ignores persisted desktop badge and Coach scaling', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tichu.qqnd.desktop-layout.v1', JSON.stringify({ badgeScale: 125, coachTextScale: 130 })));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const portrait = await page.evaluate(() => {
    const css = selector => getComputedStyle(document.querySelector(selector));
    return {
      avatar: [css('.seat-bottom .avatar').width, css('.seat-bottom .avatar').height, css('.seat-bottom .avatar').flexBasis],
      coach: [css('.coach-drag-handle').fontSize, css('.coach-guide small').fontSize, css('.coach-guide b').fontSize, css('.coach-guide span').fontSize],
    };
  });
  expect(portrait.avatar).toEqual(['31px', '31px', '31px']);
  expect(portrait.coach).toEqual(['7px', '6px', '10px', '8px']);

  await page.setViewportSize({ width: 800, height: 360 });
  await page.reload();
  const landscape = await page.evaluate(() => {
    const css = selector => getComputedStyle(document.querySelector(selector));
    return {
      avatar: [css('.seat-bottom .avatar').width, css('.seat-bottom .avatar').height, css('.seat-bottom .avatar').flexBasis],
      coach: [css('.coach-drag-handle').fontSize, css('.coach-guide small').fontSize, css('.coach-guide b').fontSize, css('.coach-guide span').fontSize],
    };
  });
  expect(landscape.avatar).toEqual(['39px', '39px', '39px']);
  expect(landscape.coach).toEqual(['7px', '6px', '8px', '7px']);

  await page.evaluate(() => window.tichu.uiState.coachEnabled && document.querySelector('.coach-toggle')?.click());
  await expect(page.locator('.coach-off-button')).toHaveCSS('font-size', '8px');
});

test('menu and Dev UI keep desktop tuning outside game state', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#game-menu')).toBeHidden();

  await page.locator('#game-menu-button').click();
  await expect(page.locator('#game-menu [data-action]')).toHaveCount(6);
  await page.locator('.scoreboard').click();
  await expect(page.locator('#game-menu')).toBeHidden();
  await expect(page.locator('#game-menu-button')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#game-menu-button').click();
  const positions = await page.evaluate(() => {
    const table = document.querySelector('.table').getBoundingClientRect();
    const menu = document.querySelector('#game-menu').getBoundingClientRect();
    const topbar = document.querySelector('.topbar').getBoundingClientRect();
    const trigger = document.querySelector('#game-menu-button').getBoundingClientRect();
    return { tableLeft: table.left, menuLeft: menu.left, triggerTop: trigger.top, triggerBottom: trigger.bottom, topbarTop: topbar.top, topbarBottom: topbar.bottom };
  });
  expect(positions.menuLeft).toBeGreaterThan(positions.tableLeft + 100);
  expect(positions.triggerTop).toBeGreaterThanOrEqual(positions.topbarTop);
  expect(positions.triggerBottom).toBeLessThanOrEqual(positions.topbarBottom);

  await page.keyboard.press('Escape');
  await expect(page.locator('#game-menu')).toBeHidden();
  await expect(page.locator('#game-menu-button')).toBeFocused();
  await page.locator('#game-menu-button').click();
  await page.locator('[data-action="open-dev-ui"]').click();
  await expect(page.locator('#dev-ui-panel')).toBeVisible();

  await page.locator('#dev-ui-panel [data-action="close-dev-ui"]').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#dev-ui-panel')).toBeHidden();
  await expect(page.locator('#game-menu-button')).toBeFocused();
  await page.locator('#game-menu-button').click();
  await page.locator('[data-action="open-dev-ui"]').click();
  await expect(page.locator('#dev-ui-panel')).toBeVisible();

  if((page.viewportSize()?.width ?? 0)<=900){
    await expect(page.locator('[data-layout-key="localCardWidth"]')).toBeDisabled();
    await expect(page.locator('.dev-mobile-note')).toBeVisible();
    return;
  }
  await page.locator('[data-layout-key="localCardWidth"]').fill('112');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--local-card-width').trim())).toBe('112px');
  const adjustedJson = '{"localCardWidth":112,"opponentCardWidth":96,"localHandStep":72,"opponentHandStep":34,"badgeScale":100,"playedCardStep":54,"coachTextScale":100}';
  await page.evaluate(() => { document.querySelector('#layout-export').value = 'stale'; });
  await page.locator('[data-action="copy-layout"]').click();
  await expect(page.locator('#layout-export')).toHaveValue(adjustedJson);
  await page.locator('[data-action="reset-layout"]').click();
  await expect(page.locator('[data-action="reset-layout"]')).toBeFocused();
  const defaultJson = '{"localCardWidth":104,"opponentCardWidth":96,"localHandStep":72,"opponentHandStep":34,"badgeScale":100,"playedCardStep":54,"coachTextScale":100}';
  await expect(page.locator('#layout-export')).toHaveValue(defaultJson);
  await expect(page.locator('[data-layout-key="localCardWidth"]')).toHaveValue('104');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--local-card-width').trim())).toBe('104px');
  expect(await page.evaluate(() => localStorage.getItem('tichu.qqnd.desktop-layout.v1'))).toBeNull();
  await page.locator('[data-layout-key="localCardWidth"]').fill('112');
  await page.reload();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--local-card-width').trim())).toBe('112px');
});

test('live desktop-to-compact resize disables tuning and docks the Coach', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Live breakpoint transition is covered once.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const handle = page.locator('.coach-drag-handle');
  const table = await page.locator('.table').boundingBox();
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(table.x + 240, table.y + 220, { steps: 5 });
  await page.mouse.up();
  expect(await page.locator('#coach-panel').evaluate(panel => panel.style.left)).not.toBe('');

  await page.locator('#game-menu-button').click();
  await page.locator('[data-action="open-dev-ui"]').click();
  await expect(page.locator('[data-layout-key="localCardWidth"]')).toBeEnabled();
  await page.setViewportSize({ width: 800, height: 360 });
  await expect(page.locator('[data-layout-key="localCardWidth"]')).toBeDisabled();
  await expect(handle).toBeDisabled();
  await expect(handle).toHaveAttribute('aria-disabled', 'true');
  expect(await page.locator('#coach-panel').evaluate(panel => ({ left: panel.style.left, top: panel.style.top, right: panel.style.right, bottom: panel.style.bottom, transform: panel.style.transform }))).toEqual({ left: '', top: '', right: '', bottom: '', transform: '' });
});

test('phone landscape ignores persisted Coach placement and prevents dragging', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Compact Coach behavior is covered once.');
  await page.addInitScript(() => localStorage.setItem('tichu.qqnd.coach-position.v1', JSON.stringify({ x: 260, y: 180 })));
  await page.setViewportSize({ width: 800, height: 360 });
  await page.goto('/');
  const coach = page.locator('#coach-panel');
  const handle = page.locator('.coach-drag-handle');
  await expect(handle).toBeDisabled();
  await expect(handle).toHaveAttribute('aria-disabled', 'true');
  expect(await coach.evaluate(panel => ({ left: panel.style.left, top: panel.style.top, right: panel.style.right, bottom: panel.style.bottom, transform: panel.style.transform }))).toEqual({ left: '', top: '', right: '', bottom: '', transform: '' });

  const before = await coach.boundingBox();
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(250, 230, { steps: 5 });
  await page.mouse.up();
  const after = await coach.boundingBox();
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
  expect(await page.evaluate(() => window.tichu.uiState.coachPosition)).toEqual({ x: 260, y: 180 });
});

test('movable Coach stays inside the desktop table, persists, and resets',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-1440','Coach dragging is intentionally disabled on compact layouts.');
  await page.goto('/');
  const coach=page.locator('#coach-panel'),table=page.locator('.table'),handle=page.locator('.coach-drag-handle');
  await expect(handle).toBeVisible();
  const before=await coach.boundingBox(),tableBox=await table.boundingBox(),handleBox=await handle.boundingBox();
  expect(before).not.toBeNull();expect(tableBox).not.toBeNull();expect(handleBox).not.toBeNull();

  await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+handleBox.height/2);
  await page.mouse.down();
  await page.mouse.move(tableBox.x+230,tableBox.y+220,{steps:8});
  await page.mouse.up();

  const moved=await coach.boundingBox();
  expect(moved).not.toBeNull();
  expect(moved.x).not.toBeCloseTo(before.x,0);
  expect(moved.x).toBeGreaterThanOrEqual(tableBox.x-1);
  expect(moved.y).toBeGreaterThanOrEqual(tableBox.y-1);
  expect(moved.x+moved.width).toBeLessThanOrEqual(tableBox.x+tableBox.width+1);
  expect(moved.y+moved.height).toBeLessThanOrEqual(tableBox.y+tableBox.height-169);

  await page.reload();
  const reloaded=await coach.boundingBox();
  expect(reloaded).not.toBeNull();
  expect(reloaded.x).toBeCloseTo(moved.x,0);
  expect(reloaded.y).toBeCloseTo(moved.y,0);

  await page.locator('[data-action="reset-coach-position"]').click();
  const reset=await coach.boundingBox();
  expect(reset).not.toBeNull();
  expect(reset.x).toBeCloseTo(before.x,0);
  expect(reset.y).toBeCloseTo(before.y,0);
});

test('opponent fans cap their effective step to each seat at desktop maxima', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop fan geometry is covered once.');
  for (const width of [901, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('tichu.qqnd.desktop-layout.v1', JSON.stringify({ opponentCardWidth: 112, opponentHandStep: 48 })));
    await page.reload();
    await renderFourteenCardHands(page, `opponent-fans-${width}`);
    const geometry = await page.evaluate(() => {
      const table = document.querySelector('.table').getBoundingClientRect();
      const fan = (selector, axis) => {
        const hand = document.querySelector(selector);
        const elements = [...hand.querySelectorAll('.card')];
        const cards = elements.map(card => card.getBoundingClientRect());
        const style = getComputedStyle(hand);
        const next = getComputedStyle(elements[1]);
        return {
          configured: parseFloat(style.getPropertyValue('--configured-hand-step')),
          effective: parseFloat(next[axis]) + parseFloat(next[axis === 'marginLeft' ? 'width' : 'height']),
          cardsFit: cards.every(card => card.left >= table.left - 1 && card.right <= table.right + 1 && card.top >= table.top - 1 && card.bottom <= table.bottom + 1 && card.left >= -1 && card.right <= innerWidth + 1 && card.top >= -1 && card.bottom <= innerHeight + 1),
        };
      };
      return { top: fan('.opponent-hand-top', 'marginLeft'), left: fan('.seat-left .opponent-hand-side', 'marginTop'), right: fan('.seat-right .opponent-hand-side', 'marginTop') };
    });
    for (const [seat, fan] of Object.entries(geometry)) {
      expect(fan.cardsFit, `${width}px ${seat}`).toBe(true);
      expect(fan.configured, `${width}px ${seat}`).toBe(48);
      expect(fan.effective, `${width}px ${seat}`).toBeLessThanOrEqual(48.1);
    }
    if (width === 1440) expect(geometry.top.effective).toBeCloseTo(48, 1);
  }
});

test('played-card steps cap to the visible central stage', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Central-stage geometry is covered once.');
  for (const width of [901, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('tichu.qqnd.desktop-layout.v1', JSON.stringify({ opponentCardWidth: 112, playedCardStep: 72 })));
    await page.reload();
    await page.evaluate(prefix => {
      const state = window.tichu.game.state;
      const source = state.hands.flat().map((card, index) => ({ ...card, id: `${prefix}-${index}-${card.id}` }));
      state.phase = 'play';
      state.currentPlayer = 0;
      state.table = [
        { seat: 1, cards: source.slice(0, 8), play: { type: 'single', value: 2 } },
        { seat: 2, cards: source.slice(8, 16), play: { type: 'single', value: 3 } },
      ];
      window.tichu.game.dispatchEvent(new CustomEvent('change', { detail: state }));
    }, `played-stage-${width}`);
    const geometry = await page.evaluate(() => {
      const stage = document.querySelector('.trick-stage').getBoundingClientRect();
      const elements = [...document.querySelectorAll('.played-cards .card')];
      const cards = elements.map(card => card.getBoundingClientRect());
      const played = getComputedStyle(document.querySelector('.played-cards'));
      const next = getComputedStyle(elements[1]);
      return {
        configured: parseFloat(played.getPropertyValue('--configured-played-card-step')),
        effective: parseFloat(next.marginLeft) + parseFloat(next.width),
        cardsFit: cards.every(card => card.left >= stage.left - 1 && card.right <= stage.right + 1 && card.top >= stage.top - 1 && card.bottom <= stage.bottom + 1),
      };
    });
    expect(geometry.cardsFit, `${width}px`).toBe(true);
    expect(geometry.configured, `${width}px`).toBe(72);
    expect(geometry.effective, `${width}px`).toBeLessThanOrEqual(72.1);
  }
});

test('tablet geometry ignores persisted badge and every Coach text scale', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Tablet scale isolation is covered once.');
  await page.addInitScript(() => localStorage.setItem('tichu.qqnd.desktop-layout.v1', JSON.stringify({ badgeScale: 125, coachTextScale: 130 })));
  await page.setViewportSize({ width: 800, height: 800 });
  await page.goto('/');
  await page.evaluate(() => {
    const state = window.tichu.game.state;
    state.phase = 'play';
    state.currentPlayer = 0;
    state.selected = new Set([state.hands[0][0].id]);
    window.tichu.game.dispatchEvent(new CustomEvent('change', { detail: state }));
  });
  const tablet = await page.evaluate(() => {
    const css = selector => getComputedStyle(document.querySelector(selector));
    return {
      avatar: [css('.seat-bottom .avatar').width, css('.seat-bottom .avatar').height, css('.seat-bottom .avatar').flexBasis],
      coach: [
        css('.coach-drag-handle').fontSize,
        css('.coach-guide small').fontSize,
        css('.coach-guide b').fontSize,
        css('.coach-guide span').fontSize,
        css('.coach-selection b').fontSize,
        css('.coach-selection span').fontSize,
        css('.coach-meta').fontSize,
        css('.coach-toggle').fontSize,
      ],
    };
  });
  expect(tablet.avatar).toEqual(['48px', '48px', '48px']);
  expect(tablet.coach).toEqual(['8px', '7px', '11px', '9px', '9px', '8px', '8px', '8px']);
});

test('keyboard opening Dev UI moves focus to its close control and restores the menu trigger', async ({ page }) => {
  await page.goto('/');
  const menu = page.locator('#game-menu-button');
  await menu.focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-action="open-dev-ui"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#dev-ui-panel [data-action="close-dev-ui"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toBeFocused();
});
