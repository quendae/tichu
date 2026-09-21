import {test,expect} from '@playwright/test';

async function renderShell(page){
  await page.goto('/');
  await page.evaluate(()=>window.tichu.mp.renderShell());
}

async function renderRoom(page,{seat=1,isHost=false,fillBots=true,allConnected=false}={}){
  await renderShell(page);
  await page.evaluate(({seat,isHost,fillBots,allConnected})=>{
    const mp=window.tichu.mp;
    mp.session={id:`p${seat}`,nickname:'Gracz'};
    mp.seat=seat;
    mp.isHost=isHost;
    mp.fillBots=fillBots;
    mp.room={
      id:'ABCD-EFGH',status:'lobby',ownerSessionId:isHost?`p${seat}`:'p0',game:'tichu',
      players:[
        {id:'p0',nickname:'Ala',connected:true},
        {id:'p1',nickname:'Bartek',connected:true},
        {id:'p2',nickname:'Celina',connected:allConnected},
      ],
    };
    mp.renderLobby();
  },{seat,isHost,fillBots,allConnected});
}

async function prepareActiveGame(page){
  await page.goto('/');
  await page.evaluate(()=>{
    const mp=window.tichu.mp;
    mp.active=true;
    mp.session={id:'p0',nickname:'Ala'};
    mp.seat=0;
    mp.room={
      id:'ABCD-EFGH',status:'in_game',ownerSessionId:'p0',game:'tichu',
      players:[
        {id:'p0',nickname:'Ala',connected:true},
        {id:'p1',nickname:'Bartek',connected:true},
        {id:'p2',nickname:'Celina',connected:true},
        {id:'p3',nickname:'Darek',connected:true},
      ],
    };
    mp.scheduleReconnect=()=>{};
  });
}

test('multiplayer setup leads with Quick Play and keeps room creation secondary',async({page})=>{
  await renderShell(page);
  const modal=page.locator('#mp-modal');
  await expect(modal.getByRole('heading',{name:'Tichu online'})).toBeVisible();
  await expect(modal.getByText('Server-authoritative')).toHaveCount(0);
  await expect(modal.locator('#mp-quick')).toHaveText('Szybka gra');
  await expect(modal.locator('#mp-quick')).toHaveClass(/mp-primary-action/);
  await expect(modal.getByRole('heading',{name:'Dołącz kodem'})).toBeVisible();
  await expect(modal.getByRole('heading',{name:'Utwórz pokój'})).toBeVisible();

  const quickBox=await modal.locator('#mp-quick').boundingBox();
  const createBox=await modal.locator('#mp-create').boundingBox();
  expect(quickBox?.y).toBeLessThan(createBox?.y??0);
});

test('Quick Play has a visible searching state and closing the modal leaves the queue',async({page})=>{
  await renderShell(page);
  await page.evaluate(()=>{
    const mp=window.tichu.mp;
    mp.queued=true;
    mp.sentForTest=[];
    mp.send=message=>mp.sentForTest.push(message);
    mp.renderLobby();
  });

  await expect(page.locator('#mp-quick')).toHaveText('Anuluj wyszukiwanie');
  await expect(page.locator('#mp-queue-state')).toContainText('Szukam stołu');
  await page.locator('#mp-close').click();
  await expect(page.locator('#mp-modal')).toHaveCount(0);

  const state=await page.evaluate(()=>({queued:window.tichu.mp.queued,sent:window.tichu.mp.sentForTest}));
  expect(state.queued).toBe(false);
  expect(state.sent).toContainEqual({type:'queue.leave',game:'tichu'});
});

test('lobby seats are labelled from the local player perspective',async({page})=>{
  await renderRoom(page,{seat:1,isHost:false,fillBots:true});
  await expect(page.locator('#mp-room-code')).toHaveText('ABCD-EFGH');
  await expect(page.locator('#mp-copy-code')).toBeVisible();

  const roles=await page.locator('.mp-seat').evaluateAll(nodes=>nodes.map(node=>({
    seat:Number(node.dataset.seat),role:node.querySelector('.mp-seat-role')?.textContent?.trim(),
    status:node.querySelector('.mp-seat-status')?.textContent?.trim(),name:node.querySelector('.mp-seat-name')?.textContent?.trim(),
  })));
  expect(roles).toEqual([
    {seat:0,role:'RYWAL',status:'ONLINE · HOST',name:'Ala'},
    {seat:1,role:'TY',status:'ONLINE',name:'Bartek'},
    {seat:2,role:'RYWAL',status:'OFFLINE',name:'Celina'},
    {seat:3,role:'PARTNER',status:'BOT',name:'Bot'},
  ]);
  await expect(page.locator('#mp-start')).toBeHidden();
  await expect(page.locator('#mp-lobby-state')).toContainText('Czekamy na hosta');
});

test('host lobby exposes readiness and a clear start action',async({page})=>{
  await renderRoom(page,{seat:0,isHost:true,fillBots:true,allConnected:true});
  await expect(page.locator('#mp-start')).toBeVisible();
  await expect(page.locator('#mp-start')).toBeEnabled();
  await expect(page.locator('#mp-lobby-state')).toContainText('Stół gotowy');
  await expect(page.locator('#mp-bots')).toBeEnabled();
});

test('public room cards show occupancy and game state without inline styles',async({page})=>{
  await renderShell(page);
  await page.evaluate(()=>{
    const mp=window.tichu.mp;
    mp.rooms=[
      {id:'ROOM-ONE1',game:'tichu',visibility:'public',name:'Pokój Ani',status:'lobby',players:[{},{},{}]},
      {id:'ROOM-TWO2',game:'tichu',visibility:'public',name:'Pełny mecz',status:'in_game',players:[{},{},{},{}]},
    ];
    mp.renderRooms();
  });
  await expect(page.locator('.mp-room-card')).toHaveCount(2);
  await expect(page.locator('.mp-room-card').first()).toContainText('3/4');
  await expect(page.locator('.mp-room-card').first()).toContainText('OCZEKUJE');
  await expect(page.locator('.mp-room-card').nth(1)).toContainText('W GRZE');
  await expect(page.locator('.mp-room-card').nth(1).getByRole('button',{name:'Dołącz'})).toBeDisabled();
  expect(await page.locator('#mp-modal [style]').count()).toBe(0);
});

test('multiplayer modal fits a phone viewport without horizontal overflow',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await renderRoom(page,{seat:0,isHost:true,fillBots:true});
  const geometry=await page.locator('#mp-modal').evaluate(node=>({
    left:node.getBoundingClientRect().left,
    right:node.getBoundingClientRect().right,
    viewport:document.documentElement.clientWidth,
    scrollWidth:node.scrollWidth,
    clientWidth:node.clientWidth,
  }));
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth+1);
});

test('active multiplayer shows a reconnect banner when its socket is lost',async({page})=>{
  await prepareActiveGame(page);
  await page.evaluate(()=>window.tichu.mp.onSocketClosed?.());
  const banner=page.locator('#mp-connection-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Utracono połączenie');
  await expect(banner).toContainText('ponowne łączenie');
});

test('presence shows server countdown, bot takeover and a short return notice',async({page})=>{
  await prepareActiveGame(page);
  await page.evaluate(()=>{
    const mp=window.tichu.mp;
    mp.handle({
      type:'game.presence',roomId:'ABCD-EFGH',botSeats:[],hostSessionId:'p0',authoritative:true,
      presence:[
        {sessionId:'p0',seat:0,nickname:'Ala',connected:true,graceDeadline:null,botActive:false},
        {sessionId:'p1',seat:1,nickname:'Bartek',connected:false,graceDeadline:Date.now()+60_000,botActive:false},
        {sessionId:'p2',seat:2,nickname:'Celina',connected:true,graceDeadline:null,botActive:false},
        {sessionId:'p3',seat:3,nickname:'Darek',connected:true,graceDeadline:null,botActive:false},
      ],
    });
  });
  const chip=page.locator('.seat[data-seat="1"] .mp-presence-chip');
  await expect(chip).toContainText('ROZŁĄCZONY');
  await expect(chip).toContainText(/bot za (59|60) s/);

  await page.evaluate(()=>{
    const mp=window.tichu.mp;
    mp.handle({
      type:'game.presence',roomId:'ABCD-EFGH',botSeats:[1],hostSessionId:'p0',authoritative:true,
      presence:[
        {sessionId:'p0',seat:0,nickname:'Ala',connected:true,graceDeadline:null,botActive:false},
        {sessionId:'p1',seat:1,nickname:'Bartek',connected:false,graceDeadline:null,botActive:true},
        {sessionId:'p2',seat:2,nickname:'Celina',connected:true,graceDeadline:null,botActive:false},
        {sessionId:'p3',seat:3,nickname:'Darek',connected:true,graceDeadline:null,botActive:false},
      ],
    });
  });
  await expect(chip).toContainText('BOT GRA ZA GRACZA');

  await page.evaluate(()=>window.tichu.mp.handle({
    type:'game.player.connection',roomId:'ABCD-EFGH',sessionId:'p1',seat:1,nickname:'Bartek',connected:true,reclaimedFromBot:true,botSeats:[],hostSessionId:'p0',authoritative:true,
  }));
  await expect(chip).toContainText('GRACZ WRÓCIŁ');
});

test('round end separates round points from the match score and gives one next action',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{
    Object.assign(window.tichu.game.state,{phase:'round-end',round:4,roundScore:[120,-20],scores:[640,510]});
    window.tichu.game.emit();
  });
  const summary=page.locator('#round-summary');
  await expect(summary).toBeVisible();
  await expect(summary.locator('.summary-kicker')).toHaveText('RUNDA 4 ZAKOŃCZONA');
  await expect(summary.locator('.summary-round-score')).toContainText('120');
  await expect(summary.locator('.summary-round-score')).toContainText('-20');
  await expect(summary.locator('.summary-match-score')).toContainText('640');
  await expect(summary.locator('.summary-match-score')).toContainText('510');
  await expect(summary.getByRole('button')).toHaveText('Graj następną rundę');
});

test('match end has an explicit outcome, final score and rematch action',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{
    Object.assign(window.tichu.game.state,{phase:'match-end',winnerTeam:0,scores:[1030,780]});
    window.tichu.game.emit();
  });
  const summary=page.locator('#round-summary');
  await expect(summary).toBeVisible();
  await expect(summary.locator('.summary-outcome')).toHaveText('ZWYCIĘSTWO');
  await expect(summary.getByRole('heading',{level:2})).toHaveText('Wygrywacie mecz!');
  await expect(summary.locator('.summary-match-score')).toContainText('1030');
  await expect(summary.locator('.summary-match-score')).toContainText('780');
  await expect(summary.getByRole('button')).toHaveText('Zagraj ponownie');
});

test('multiplayer match end lets only the host start a rematch',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{
    const mp=window.tichu.mp;
    mp.active=true;
    mp.isHost=false;
    mp.room={id:'ABCD-EFGH',status:'finished',ownerSessionId:'p1',game:'tichu',players:[]};
    Object.assign(window.tichu.game.state,{
      phase:'match-end',winnerTeam:0,scores:[1030,780],multiplayer:true,multiplayerIsHost:false,
    });
    window.tichu.game.emit();
  });

  const summary=page.locator('#round-summary');
  await expect(summary.getByRole('button',{name:'Zagraj ponownie'})).toHaveCount(0);
  await expect(summary).toContainText('Czekamy, aż host rozpocznie rewanż');
});

test('multiplayer host rematch uses game.rematch instead of game.action new-match',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{
    const mp=window.tichu.mp;
    mp.active=true;
    mp.isHost=true;
    mp.room={id:'ABCD-EFGH',status:'finished',ownerSessionId:'p0',game:'tichu',players:[]};
    mp.sentForTest=[];
    mp.send=message=>mp.sentForTest.push(message);
    Object.assign(window.tichu.game.state,{
      phase:'match-end',winnerTeam:0,scores:[1030,780],multiplayer:true,multiplayerIsHost:true,
    });
    window.tichu.game.emit();
  });

  await page.locator('#round-summary').getByRole('button',{name:'Zagraj ponownie'}).click();
  const sent=await page.evaluate(()=>window.tichu.mp.sentForTest);
  expect(sent).toContainEqual({type:'game.rematch',roomId:'ABCD-EFGH'});
  expect(sent.some(message=>message.type==='game.action'&&message.action==='new-match')).toBe(false);
});
