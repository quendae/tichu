import { test, expect } from '@playwright/test';

async function installMotionRecorder(page){
  await page.addInitScript(() => {
    window.__motionRecords=[];
    window.__motionAnimations=[];
    Element.prototype.animate=function(keyframes,options){
      const record={
        metadata:{...this.dataset},
        from:{left:Number.parseFloat(this.style.left),top:Number.parseFloat(this.style.top),width:Number.parseFloat(this.style.width),height:Number.parseFloat(this.style.height)},
        keyframes:keyframes.map(frame=>({...frame})),
        options:{...options},
      };
      window.__motionRecords.push(record);
      let finishHandler=null,cancelHandler=null;
      const animation={
        finish(){finishHandler?.()},
        cancel(){cancelHandler?.()},
      };
      Object.defineProperties(animation,{
        onfinish:{set(handler){finishHandler=handler}},
        oncancel:{set(handler){cancelHandler=handler}},
      });
      window.__motionAnimations.push(animation);
      return animation;
    };
  });
}

async function setMotionState(page,{hands=[[],[],[],[]],table=[],captured=[[],[],[],[]],currentPlayer=0,animations=true,phase='play'}){
  await page.evaluate(({hands,table,captured,currentPlayer,animations,phase})=>{
    const game=window.tichu.game;
    clearTimeout(game.botTimer);
    const state=game.newState();
    Object.assign(state,{hands,table,captured,currentPlayer,phase});
    state.settings.animations=animations;
    state.lastPlay=table.at(-1)?.play||null;
    game.state=state;
    game.emit();
    clearTimeout(game.botTimer);
  },{hands,table,captured,currentPlayer,animations,phase});
}

const motionCard=(id,rank=2,suit='jade',special=null)=>({id,rank,suit,special});
const singleEntry=(seat,card)=>({seat,cards:[card],play:{type:'single',length:1,value:card.rank||15,cards:[card]}});

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
  await page.evaluate(() => {
    clearTimeout(window.tichu.game.botTimer);
    window.tichu.game.botDelay = 0;
  });
  await expect(page.locator('[data-inline="exchange-confirm"]')).toBeDisabled();
  for (let i = 0; i < 3; i++) {
    // Let the previous card's hover lift settle before approaching its neighbour.
    await page.mouse.move(0, 0);
    const firstExchangeCard = page.locator('.seat-bottom [data-card]:not(.assigned)').first();
    await expect(firstExchangeCard.evaluate(card => {
      const rect = card.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + 8, rect.top + 8);
      return hit === card || card.contains(hit);
    })).resolves.toBe(true);
    // Click the exposed corner, not the centre hidden under the next card.
    await firstExchangeCard.click({ position: { x: 8, y: 8 } });
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
  await page.evaluate(() => {
    const game = window.tichu.game;
    clearTimeout(game.botTimer);
    game.botDelay = 0;
    game.scheduleBots();
  });
  const pass = page.locator('[data-inline="grand-pass"]');
  await pass.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.seat-bottom [data-card]')).toHaveCount(14);
  await expect(page.locator('[data-inline="exchange-confirm"]')).toBeVisible();
});

test('selected legal card is played when animations are enabled', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(() => {
    const game = window.tichu.game;
    clearTimeout(game.botTimer);
    const low = { id: 'test-pagoda-2', suit: 'pagoda', rank: 2, special: null };
    const high = { id: 'test-jade-4', suit: 'jade', rank: 4, special: null };
    game.state.phase = 'play';
    game.state.currentPlayer = 0;
    game.state.hands[0] = [high];
    game.state.table = [{ seat: 3, cards: [low], play: { type: 'single', length: 1, value: 2, cards: [low] } }];
    game.state.lastPlay = game.state.table[0].play;
    game.state.selected = new Set();
    game.emit();
  });

  await page.locator('[data-card="test-jade-4"]').click();
  await expect(page.locator('#play-btn')).toBeEnabled();
  const controlGeometry = await page.evaluate(() => {
    if (innerHeight > 520) return { overlap: false };
    const play = document.querySelector('#play-btn').getBoundingClientRect();
    const coach = document.querySelector('#coach-panel').getBoundingClientRect();
    const overlap = !(play.right <= coach.left || play.left >= coach.right || play.bottom <= coach.top || play.top >= coach.bottom);
    const coachStyle = getComputedStyle(document.querySelector('#coach-panel'));
    return { overlap, innerWidth, play: { left: play.left, right: play.right, top: play.top, bottom: play.bottom }, coach: { left: coach.left, right: coach.right, top: coach.top, bottom: coach.bottom, width: coachStyle.width, right: coachStyle.right, topValue: coachStyle.top, bottomValue: coachStyle.bottom } };
  });
  expect(controlGeometry).toEqual(expect.objectContaining({ overlap: false }));
  await page.locator('#play-btn').click();

  await expect.poll(() => page.evaluate(() => window.tichu.game.state.hands[0].length)).toBe(0);
  expect(errors).toEqual([]);
});

test('motion captures exact local and exposed bot sources for every seat', async ({ page }) => {
  await installMotionRecorder(page);
  await page.goto('/');

  for(const seat of [0,1,2,3]){
    const played=motionCard(`motion-seat-${seat}`,seat+2);
    const spare=motionCard(`motion-spare-${seat}`,seat+7,'sword');
    const hands=[[],[],[],[]];
    hands[seat]=[played,spare];
    await setMotionState(page,{hands,currentPlayer:seat});
    const selector=seat===0
      ?`[data-card="${played.id}"]`
      :`.seat[data-seat="${seat}"] [data-card-zone="opponent"] .card:last-child`;
    const source=await page.locator(selector).boundingBox();

    const records=await page.evaluate(({seat,played})=>{
      window.__motionRecords.length=0;
      const game=window.tichu.game;
      game.state.hands[seat]=game.state.hands[seat].filter(card=>card.id!==played.id);
      game.state.table=[{seat,cards:[played],play:{type:'single',length:1,value:played.rank,cards:[played]}}];
      game.state.lastPlay=game.state.table[0].play;
      game.emit();
      clearTimeout(game.botTimer);
      return window.__motionRecords;
    },{seat,played});

    const clones=records.filter(record=>record.metadata.motionKind==='play');
    expect(clones).toHaveLength(1);
    expect(clones[0].metadata).toEqual(expect.objectContaining({
      motionKind:'play',motionSeat:String(seat),motionDestination:'table',motionCard:played.id,
    }));
    expect(clones[0].from.left).toBeCloseTo(source.x,0);
    expect(clones[0].from.top).toBeCloseTo(source.y,0);
    await page.evaluate(()=>{
      for(const animation of window.__motionAnimations.splice(0))animation.finish();
    });
    await expect(page.locator('[data-motion-kind]')).toHaveCount(0);
    await expect(page.locator('.trick-play.latest')).not.toHaveAttribute('data-motion-reveal');
  }
});

test('motion creates every combination clone with a 35 ms stagger and cleans cancellation', async ({ page }) => {
  await installMotionRecorder(page);
  await page.goto('/');
  const cards=[motionCard('motion-pair-a',6),motionCard('motion-pair-b',6,'sword'),motionCard('motion-pair-c',6,'star')];
  await setMotionState(page,{hands:[cards,[],[],[]]});

  const records=await page.evaluate(cards=>{
    window.__motionRecords.length=0;
    const game=window.tichu.game;
    game.state.hands[0]=[];
    game.state.table=[{seat:0,cards,play:{type:'triple',length:3,value:6,cards}}];
    game.state.lastPlay=game.state.table[0].play;
    game.emit();
    return window.__motionRecords;
  },cards);

  const clones=records.filter(record=>record.metadata.motionKind==='play');
  expect(clones.map(record=>record.metadata.motionCard)).toEqual(cards.map(card=>card.id));
  expect(clones.map(record=>record.options.delay)).toEqual([0,35,70]);
  const reveal=records.find(record=>record.metadata.motionReveal==='play');
  expect(reveal).toEqual(expect.objectContaining({
    metadata:expect.objectContaining({motionDestination:'table'}),
    keyframes:[{opacity:0},{opacity:0,offset:.62},{opacity:1}],
    options:expect.objectContaining({duration:500}),
  }));
  await expect(page.locator('.trick-play.latest')).toHaveAttribute('data-motion-reveal','play');
  await expect(page.locator('.trick-play.latest')).toHaveCSS('opacity','0');
  await expect(page.locator('[data-motion-kind="play"]')).toHaveCount(3);
  expect(await page.locator('[data-motion-kind="play"]').evaluateAll(clones=>clones.map(clone=>({
    ariaHidden:clone.getAttribute('aria-hidden'),tabIndex:clone.tabIndex,
  })))).toEqual(Array.from({length:3},()=>({ariaHidden:'true',tabIndex:-1})));
  await page.evaluate(()=>{
    for(const animation of window.__motionAnimations.splice(0))animation.cancel();
  });
  await expect(page.locator('[data-motion-kind]')).toHaveCount(0);
  await expect(page.locator('.trick-play.latest')).not.toHaveAttribute('data-motion-reveal');
  await expect(page.locator('.trick-play.latest')).not.toHaveAttribute('style',/opacity/);
});

test('motion collects visible trick cards toward normal and Dragon recipients', async ({ page }) => {
  await installMotionRecorder(page);
  await page.goto('/');

  for(const recipient of [2,3]){
    const low=motionCard(`motion-low-${recipient}`,5);
    const winner=recipient===3?motionCard('motion-dragon',15,null,'dragon'):motionCard('motion-high',10,'star');
    const table=[singleEntry(1,low),singleEntry(0,winner)];
    await setMotionState(page,{table});
    const target=await page.locator(`.seat[data-seat="${recipient}"] .player-badge`).boundingBox();

    const records=await page.evaluate(({recipient,low,winner})=>{
      window.__motionRecords.length=0;
      const game=window.tichu.game;
      game.state.table=[];
      game.state.lastPlay=null;
      game.state.captured[recipient]=[low,winner];
      game.state.dragonRecipient=null;
      game.emit();
      return window.__motionRecords;
    },{recipient,low,winner});

    const compact=await page.evaluate(()=>innerWidth<=680||innerHeight<=520);
    expect(records.map(record=>record.metadata.cardId)).toEqual(compact?[winner.id]:[low.id,winner.id]);
    for(const record of records){
      expect(record.metadata).toEqual(expect.objectContaining({
        motionKind:'collect',motionSeat:String(recipient),motionDestination:`seat-${recipient}`,
      }));
      const finalTransform=record.keyframes.at(-1).transform;
      expect(finalTransform).toContain('scale(.58)');
      const [,dx,dy]=finalTransform.match(/translate\(([-\d.]+)px,([-\d.]+)px\)/);
      expect(Number(dx)).toBeCloseTo(target.x+target.width/2-(record.from.left+record.from.width/2),0);
      expect(Number(dy)).toBeCloseTo(target.y+target.height/2-(record.from.top+record.from.height/2),0);
      expect(record.options.duration).toBeGreaterThan(0);
    }
    await page.evaluate(()=>{
      for(const animation of window.__motionAnimations.splice(0))animation.finish();
    });
  }
});

test('motion combines a final play and collection without an intermediate table render', async ({ page }) => {
  await installMotionRecorder(page);
  await page.goto('/');
  const tableCard=motionCard('motion-table-card',8,'sword');
  const finalCard=motionCard('motion-final-card',12,'star');
  await setMotionState(page,{
    hands:[[],[],[finalCard],[]],
    table:[singleEntry(1,tableCard)],
    captured:[[],[],[],[]],
    currentPlayer:2,
  });

  const records=await page.evaluate(({tableCard,finalCard})=>{
    window.__motionRecords.length=0;
    const game=window.tichu.game;
    game.state.hands[2]=[];
    game.state.table=[];
    game.state.lastPlay=null;
    game.state.captured[2]=[tableCard,finalCard];
    game.state.phase='round-end';
    game.emit();
    return window.__motionRecords;
  },{tableCard,finalCard});

  expect(records.map(record=>record.metadata.motionCard).sort()).toEqual(['motion-final-card','motion-table-card']);
  expect(records.every(record=>record.metadata.motionKind==='play-and-collect')).toBe(true);
  expect(records.every(record=>record.metadata.motionDestination==='seat-2')).toBe(true);
});

test('motion plays Dog without collection and skips disabled or reduced motion', async ({ page }) => {
  await installMotionRecorder(page);
  await page.goto('/');
  const dog=motionCard('motion-dog',0,null,'dog');
  await setMotionState(page,{hands:[[],[dog],[],[]],currentPlayer:1});
  const dogResult=await page.evaluate(()=>{
    window.__motionRecords.length=0;
    const game=window.tichu.game;
    const result=game.playCards(1,['motion-dog']);
    clearTimeout(game.botTimer);
    return {
      ok:result.ok,records:window.__motionRecords,
      tableLength:game.state.table.length,
      capturedCount:game.state.captured.reduce((count,cards)=>count+cards.length,0),
    };
  });
  expect(dogResult).toEqual(expect.objectContaining({ok:true,tableLength:0,capturedCount:0}));
  const dogRecords=dogResult.records;
  expect(dogRecords.filter(record=>record.metadata.motionKind==='play')).toHaveLength(1);
  expect(dogRecords.find(record=>record.metadata.motionKind==='play').metadata).toEqual(expect.objectContaining({
    motionSeat:'1',motionCard:'motion-dog',motionDestination:'table',
  }));
  expect(dogRecords.some(record=>['collect','play-and-collect'].includes(record.metadata.motionKind))).toBe(false);

  const disabled=motionCard('motion-disabled',4);
  await setMotionState(page,{hands:[[disabled],[],[],[]],animations:true});
  await page.evaluate(disabled=>{
    window.__motionRecords.length=0;
    const game=window.tichu.game;
    game.state.hands[0]=[];
    game.state.table=[{seat:0,cards:[disabled],play:{type:'single',length:1,value:4,cards:[disabled]}}];
    game.state.settings.animations=false;
    game.emit();
  },disabled);
  expect(await page.evaluate(()=>window.__motionRecords)).toEqual([]);
  await expect(page.locator('.trick-play.latest')).not.toHaveAttribute('data-motion-reveal');

  await page.emulateMedia({reducedMotion:'reduce'});
  const reduced=motionCard('motion-reduced',5);
  await setMotionState(page,{hands:[[reduced],[],[],[]]});
  await page.evaluate(reduced=>{
    window.__motionRecords.length=0;
    const game=window.tichu.game;
    game.state.hands[0]=[];
    game.state.table=[{seat:0,cards:[reduced],play:{type:'single',length:1,value:5,cards:[reduced]}}];
    game.emit();
  },reduced);
  expect(await page.evaluate(()=>window.__motionRecords)).toEqual([]);
  await expect(page.locator('.trick-play.latest')).not.toHaveAttribute('data-motion-reveal');
});

test('motion rebases first and resumed authoritative snapshots, then animates contiguous updates', async ({ page }) => {
  await installMotionRecorder(page);
  await page.goto('/');
  const first=motionCard('remote-first',4);
  const second=motionCard('remote-second',7,'sword');
  const resumed=motionCard('remote-resumed',9,'star');
  const afterResume=motionCard('remote-after-resume',11,'pagoda');
  await setMotionState(page,{hands:[[],[first],[],[]]});

  const result=await page.evaluate(({first,second,resumed,afterResume})=>{
    const game=window.tichu.game,mp=window.tichu.mp;
    const room={id:'ROOM-MOTION',game:'tichu',status:'in_game',ownerSessionId:'self',players:[{id:'self',nickname:'You'}]};
    mp.room=room;mp.session={id:'self',nickname:'You'};mp.active=true;mp.stateSeq=0;
    const state=(hands,table)=>{
      const value=game.newState();
      Object.assign(value,{phase:'play',hands,table,captured:[[],[],[],[]]});
      value.lastPlay=table.at(-1)?.play||null;
      return value;
    };
    const entry=(seat,card)=>({seat,cards:[card],play:{type:'single',length:1,value:card.rank,cards:[card]}});

    window.__motionRecords.length=0;
    mp.applyState(state([[],[],[second],[]],[entry(1,first)]),10);
    const firstSnapshot=[...window.__motionRecords];

    window.__motionRecords.length=0;
    mp.applyState(state([[],[],[],[resumed]],[entry(1,first),entry(2,second)]),11);
    const contiguous=[...window.__motionRecords];

    mp.handle({type:'session.resumed',session:{id:'self',nickname:'You'},rooms:[room]});
    window.__motionRecords.length=0;
    mp.applyState(state([[afterResume],[],[],[]],[entry(1,first),entry(2,second),entry(3,resumed)]),20);
    const resumeSnapshot=[...window.__motionRecords];

    window.__motionRecords.length=0;
    mp.applyState(state([[],[],[],[]],[entry(1,first),entry(2,second),entry(3,resumed),entry(0,afterResume)]),21);
    const afterResumeUpdate=[...window.__motionRecords];
    return {firstSnapshot,contiguous,resumeSnapshot,afterResumeUpdate};
  },{first,second,resumed,afterResume});

  expect(result.firstSnapshot).toEqual([]);
  expect(result.contiguous.filter(record=>record.metadata.motionKind==='play')).toHaveLength(1);
  expect(result.contiguous.find(record=>record.metadata.motionKind==='play').metadata.motionSeat).toBe('2');
  expect(result.resumeSnapshot).toEqual([]);
  expect(result.afterResumeUpdate.filter(record=>record.metadata.motionKind==='play')).toHaveLength(1);
  expect(result.afterResumeUpdate.find(record=>record.metadata.motionKind==='play').metadata.motionSeat).toBe('0');
});