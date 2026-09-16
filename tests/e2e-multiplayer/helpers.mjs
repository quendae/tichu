import {expect} from '@playwright/test';
import {possibleSelections} from '../../src/rules.js';

export function runTag(testInfo){
  return `${process.env.GITHUB_RUN_ID||process.pid}-${testInfo.retry}-${Math.random().toString(36).slice(2,7)}`;
}

export const bridgeState=client=>client.page.evaluate(()=>window.__tichuE2E.getState());
export const bridgeStatus=client=>client.page.evaluate(()=>window.__tichuE2E.getMultiplayerStatus());

export async function openE2EClient(browser,baseURL,label){
  const context=await browser.newContext();
  const page=await context.newPage();
  const errors=[];
  page.on('console',message=>{if(message.type()==='error')errors.push(`console:${message.text()}`)});
  page.on('pageerror',error=>errors.push(`page:${error.message}`));
  page.on('websocket',ws=>{
    ws.on('socketerror',error=>errors.push(`websocket:${String(error)}`));
    ws.on('framereceived',payload=>{
      try{
        const message=JSON.parse(String(payload));
        if(message?.type==='error')errors.push(`server:${message.code||message.message||'error'}`);
      }catch{}
    });
  });
  await page.goto(`${baseURL}/?e2e=1`);
  await expect.poll(()=>page.evaluate(()=>typeof window.__tichuE2E)).toBe('object');
  return {context,page,label,errors};
}

export async function openMultiplayer(client){
  await client.page.locator('#game-menu-button').click();
  await client.page.locator('[data-action="open-multiplayer"]').click();
  await expect(client.page.locator('#mp-modal')).toBeVisible();
}

export async function createPrivateRoom(client,nickname){
  await openMultiplayer(client);
  await client.page.locator('#mp-nick').fill(nickname);
  await client.page.locator('#mp-vis').selectOption('private');
  await client.page.locator('#mp-create').click();
  await expect(client.page.locator('#mp-room')).toBeVisible();
  return (await client.page.locator('#mp-room-code').textContent()).trim();
}

export async function joinPrivateRoom(client,nickname,roomId){
  await openMultiplayer(client);
  await client.page.locator('#mp-nick').fill(nickname);
  await client.page.locator('#mp-code').fill(roomId);
  await client.page.locator('#mp-join').click();
  await expect(client.page.locator('#mp-room-code')).toHaveText(roomId);
}

export async function startWithBots(host){
  await host.page.locator('#mp-bots').check();
  await expect(host.page.locator('#mp-start')).toBeEnabled();
  await host.page.locator('#mp-start').click();
  await expect.poll(()=>bridgeStatus(host).then(status=>status.active)).toBe(true);
}

const actualSeat=(local,viewer)=>(viewer+local)%4;

export const canonicalBotSeats=status=>(status.botSeats||[]).map(local=>actualSeat(local,status.seat));

export function canonicalPublicSummary(state,status){
  if(!Number.isInteger(status.seat))throw new Error('missing_viewer_seat');
  return {
    phase:state.phase,
    round:state.round,
    scores:status.seat%2===1?[state.scores[1],state.scores[0]]:[...state.scores],
    currentPlayer:actualSeat(state.currentPlayer,status.seat),
    trickLeader:actualSeat(state.trickLeader,status.seat),
    finished:(state.finished||[]).map(seat=>actualSeat(seat,status.seat)),
    wish:state.wish,
    table:(state.table||[]).map(entry=>({
      seat:actualSeat(entry.seat,status.seat),
      cards:entry.cards.map(card=>card.id),
    })),
    discarded:(state.discarded||[]).map(card=>card.id),
  };
}

export function assertPrivateHands(state){
  expect(state.hands[0].some(card=>card.hidden)).toBe(false);
  for(let seat=1;seat<4;seat+=1)expect(state.hands[seat].every(card=>card.hidden===true)).toBe(true);
}

export async function sendAndWait(client,type,payload={}){
  const before=(await bridgeStatus(client)).stateSeq;
  const sent=await client.page.evaluate(({type,payload})=>window.__tichuE2E.action(type,payload),{type,payload});
  if(!sent)throw new Error(`action_not_sent:${type}`);
  await client.page.evaluate(minimum=>window.__tichuE2E.waitForRevision(minimum,15_000),before+1);
  return bridgeState(client);
}

export async function driveHumanDecision(client){
  const state=await bridgeState(client);
  if(state.phase==='grand'&&!state.declarations[0]){
    await sendAndWait(client,'grand',{call:false});
    return {acted:true,type:'grand'};
  }
  if(state.phase==='exchange'&&!state.exchangeDone[0]){
    const ids=state.hands[0].slice(0,3).map(card=>card.id);
    if(ids.length!==3||new Set(ids).size!==3)throw new Error('insufficient_exchange_cards');
    await sendAndWait(client,'exchange',{map:{1:ids[0],2:ids[1],3:ids[2]}});
    return {acted:true,type:'exchange'};
  }
  if(state.phase==='play'&&state.dragonRecipient==='needed'){
    if(state.table.at(-1)?.seat===0){
      await sendAndWait(client,'dragon',{seat:1});
      return {acted:true,type:'dragon'};
    }
    return {acted:false,type:null};
  }
  if(state.phase!=='play'||state.currentPlayer!==0)return {acted:false,type:null};
  let options=possibleSelections(state.hands[0],state.lastPlay,state.wish);
  if(state.wish&&options.some(option=>option.fulfills))options=options.filter(option=>option.fulfills);
  const chosen=options.find(option=>option.play.type!=='bomb')||options[0];
  if(!chosen){
    if(!state.lastPlay)return {acted:false,type:null};
    await sendAndWait(client,'pass',{});
    return {acted:true,type:'pass'};
  }
  await sendAndWait(client,'play',{
    ids:chosen.cards.map(card=>card.id),
    wishRank:chosen.cards.some(card=>card.special==='mahjong')?14:null,
  });
  return {acted:true,type:'play'};
}

export async function waitForSameRevision(clients,minimum=1){
  let agreed=0;
  await expect.poll(async()=>{
    const revisions=(await Promise.all(clients.map(bridgeStatus))).map(status=>status.stateSeq);
    if(revisions.every(value=>value>=minimum)&&new Set(revisions).size===1)agreed=revisions[0];
    return agreed;
  },{timeout:15_000}).toBeGreaterThanOrEqual(minimum);
  return agreed;
}

export async function attachDiagnostics(testInfo,clients,roomId,nicknames){
  const rows=[];
  for(const client of clients){
    try{
      const status=await bridgeStatus(client);
      const state=await bridgeState(client);
      rows.push({label:client.label,status,public:canonicalPublicSummary(state,status),errors:client.errors});
    }catch(error){
      rows.push({label:client.label,diagnosticError:error.message,errors:client.errors});
    }
  }
  await testInfo.attach('multiplayer-diagnostics',{
    body:JSON.stringify({roomId,nicknames,clients:rows},null,2),
    contentType:'application/json',
  });
}

export async function cleanupClients(clients){
  const errors=[];
  for(const client of clients){
    try{await client.page.evaluate(()=>window.tichu?.mp?.room?window.tichu.mp.leave():null)}
    catch(error){errors.push(`${client.label}:leave:${error.message}`)}
  }
  for(const client of clients){
    try{await client.context.close()}
    catch(error){errors.push(`${client.label}:close:${error.message}`)}
  }
  return errors;
}
