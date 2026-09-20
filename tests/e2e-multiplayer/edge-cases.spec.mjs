import {test,expect} from '@playwright/test';
import {possibleSelections} from '../../src/rules.js';
import {
  assertPrivateHands,
  attachDiagnostics,
  bridgeState,
  bridgeStatus,
  canonicalPublicSummary,
  cleanupClients,
  createPrivateRoom,
  joinPrivateRoom,
  openE2EClient,
  runTag,
  sendAndWait,
  startWithoutBots,
  waitForSameRevision,
} from './helpers.mjs';

const actualSeat=(local,viewer)=>(viewer+local)%4;
const localSeat=(actual,viewer)=>(actual-viewer+4)%4;

async function createFourHumanTable(browser,baseURL,testInfo,suffix){
  const tag=runTag(testInfo);
  const nicknames=[1,2,3,4].map(index=>`E2E-${tag}-${suffix}${index}`);
  const clients=[];
  for(let index=0;index<4;index+=1)clients.push(await openE2EClient(browser,baseURL,`${suffix}${index+1}`));
  const roomId=await createPrivateRoom(clients[0],nicknames[0]);
  for(let index=1;index<4;index+=1)await joinPrivateRoom(clients[index],nicknames[index],roomId);
  await startWithoutBots(clients[0]);
  for(const client of clients)await expect.poll(()=>bridgeStatus(client).then(status=>status.active)).toBe(true);
  return {clients,roomId,nicknames};
}

async function seatEntries(clients){
  const rows=await Promise.all(clients.map(async client=>({
    client,
    status:await bridgeStatus(client),
    state:await bridgeState(client),
  })));
  for(const row of rows){
    if(!Number.isInteger(row.status.seat))throw new Error('missing_seat');
    assertPrivateHands(row.state);
  }
  return rows.sort((a,b)=>a.status.seat-b.status.seat);
}

async function finishGrand(clients,{grandSeat=null}={}){
  const entries=await seatEntries(clients);
  for(const {client,status} of entries){
    await sendAndWait(client,'grand',{call:status.seat===grandSeat});
  }
  for(const client of clients)await expect.poll(()=>bridgeState(client).then(state=>state.phase)).toBe('exchange');
}

function ownSpecial(entry,special){
  return entry.state.hands[0].find(card=>card.special===special)||null;
}

function ownerOfSpecial(entries,special){
  const owner=entries.find(entry=>ownSpecial(entry,special));
  if(!owner)throw new Error(`missing_${special}`);
  return owner;
}

function buildExchangeMaps(entries,{forcedTransfers=[],protectedIds=[]}={}){
  const forcedBySeat=new Map();
  for(const transfer of forcedTransfers){
    const donorMap=forcedBySeat.get(transfer.from)??new Map();
    donorMap.set(transfer.to,transfer.cardId);
    forcedBySeat.set(transfer.from,donorMap);
  }
  const protectedBySeat=new Map();
  for(const item of protectedIds){
    const set=protectedBySeat.get(item.seat)??new Set();
    set.add(item.cardId);
    protectedBySeat.set(item.seat,set);
  }

  const result=new Map();
  for(const entry of entries){
    const viewer=entry.status.seat;
    const hand=entry.state.hands[0];
    const forced=forcedBySeat.get(viewer)??new Map();
    const protectedSet=protectedBySeat.get(viewer)??new Set();
    const used=new Set();
    const map={};

    for(const [actualTarget,cardId] of forced){
      if(actualTarget===viewer)throw new Error('forced_exchange_to_self');
      if(!hand.some(card=>card.id===cardId))throw new Error(`forced_card_missing:${cardId}`);
      const localTarget=localSeat(actualTarget,viewer);
      map[localTarget]=cardId;
      used.add(cardId);
    }

    for(const actualTarget of [0,1,2,3]){
      if(actualTarget===viewer)continue;
      const localTarget=localSeat(actualTarget,viewer);
      if(map[localTarget])continue;
      let card=hand.find(candidate=>!used.has(candidate.id)&&!protectedSet.has(candidate.id));
      if(!card)card=hand.find(candidate=>!used.has(candidate.id));
      if(!card)throw new Error('insufficient_exchange_cards');
      map[localTarget]=card.id;
      used.add(card.id);
    }
    result.set(viewer,map);
  }
  return result;
}

async function submitExchangeMaps(entries,maps){
  for(const entry of entries){
    await sendAndWait(entry.client,'exchange',{map:maps.get(entry.status.seat)});
  }
  for(const entry of entries)await expect.poll(()=>bridgeState(entry.client).then(state=>state.phase)).toBe('play');
}

function specialProtection(entries){
  const out=[];
  for(const entry of entries){
    for(const card of entry.state.hands[0])if(card.special)out.push({seat:entry.status.seat,cardId:card.id});
  }
  return out;
}

async function moveSpecialToMahjongStarter(clients,special){
  await finishGrand(clients);
  const entries=await seatEntries(clients);
  const starter=ownerOfSpecial(entries,'mahjong');
  const specialOwner=ownerOfSpecial(entries,special);
  const forcedTransfers=[];
  const protectedIds=specialProtection(entries).filter(item=>item.cardId!==special);
  if(specialOwner.status.seat!==starter.status.seat){
    forcedTransfers.push({from:specialOwner.status.seat,to:starter.status.seat,cardId:special});
  }else{
    protectedIds.push({seat:starter.status.seat,cardId:special});
  }
  const maps=buildExchangeMaps(entries,{forcedTransfers,protectedIds});
  await submitExchangeMaps(entries,maps);
  const refreshed=await seatEntries(clients);
  const starterNow=refreshed.find(entry=>entry.status.seat===starter.status.seat);
  if(!starterNow)throw new Error('starter_missing_after_exchange');
  expect(starterNow.state.currentPlayer).toBe(0);
  expect(starterNow.state.hands[0].some(card=>card.special===special)).toBe(true);
  return {entries:refreshed,starter:starterNow};
}

async function reconnect(client,{roomId,seat}){
  const before=await bridgeStatus(client);
  await client.page.evaluate(()=>window.__tichuE2E.closeSocket());
  await expect.poll(()=>bridgeStatus(client).then(status=>status.connected),{timeout:10_000}).toBe(false);
  await expect.poll(()=>bridgeStatus(client).then(status=>status.connected),{timeout:20_000}).toBe(true);
  await expect.poll(()=>bridgeStatus(client).then(status=>status.active),{timeout:20_000}).toBe(true);
  const after=await bridgeStatus(client);
  expect(after.roomId).toBe(roomId);
  expect(after.seat).toBe(seat);
  expect(after.stateSeq).toBeGreaterThanOrEqual(before.stateSeq);
  return after;
}

async function cleanupEdge(testInfo,ctx,failed){
  if(!ctx)return;
  if(failed)await attachDiagnostics(testInfo,ctx.clients,ctx.roomId,ctx.nicknames);
  const cleanupErrors=await cleanupClients(ctx.clients);
  if(cleanupErrors.length)await testInfo.attach('cleanup-errors',{body:cleanupErrors.join('\n'),contentType:'text/plain'});
}

test('production QQND edge: Grand/Tichu and reconnect preserve exchange state',async({browser},testInfo)=>{
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  let ctx=null,failed=false;
  try{
    ctx=await createFourHumanTable(browser,baseURL,testInfo,'EX');
    await finishGrand(ctx.clients,{grandSeat:0});
    let entries=await seatEntries(ctx.clients);
    const grand=entries.find(entry=>entry.status.seat===0);
    const tichu=entries.find(entry=>entry.status.seat===1);
    if(!grand||!tichu)throw new Error('missing_expected_seat');
    expect(grand.state.declarations[0]).toBe('grand');

    await sendAndWait(tichu.client,'tichu',{});
    const before=await bridgeState(tichu.client);
    expect(before.declarations[0]).toBe('tichu');
    expect(before.phase).toBe('exchange');
    const handBefore=before.hands[0].map(card=>card.id).sort();

    await reconnect(tichu.client,{roomId:ctx.roomId,seat:1});
    const after=await bridgeState(tichu.client);
    expect(after.phase).toBe('exchange');
    expect(after.declarations[0]).toBe('tichu');
    expect(after.hands[0].map(card=>card.id).sort()).toEqual(handBefore);
    expect((await bridgeStatus(tichu.client)).botSeats).toEqual([]);
  }catch(error){failed=true;throw error}finally{await cleanupEdge(testInfo,ctx,failed)}
});

test('production QQND edge: Mah Jong wish survives reconnect',async({browser},testInfo)=>{
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  let ctx=null,failed=false;
  try{
    ctx=await createFourHumanTable(browser,baseURL,testInfo,'WISH');
    await finishGrand(ctx.clients);
    const exchangeEntries=await seatEntries(ctx.clients);
    const starter=ownerOfSpecial(exchangeEntries,'mahjong');
    const maps=buildExchangeMaps(exchangeEntries,{protectedIds:specialProtection(exchangeEntries)});
    await submitExchangeMaps(exchangeEntries,maps);

    let entries=await seatEntries(ctx.clients);
    const lead=entries.find(entry=>entry.status.seat===starter.status.seat);
    if(!lead)throw new Error('mahjong_starter_missing');
    expect(lead.state.currentPlayer).toBe(0);
    await sendAndWait(lead.client,'play',{ids:['mahjong'],wishRank:14});
    expect((await bridgeState(lead.client)).wish).toBe(14);

    const leadState=await bridgeState(lead.client);
    const currentActual=actualSeat(leadState.currentPlayer,lead.status.seat);
    const current=entries.find(entry=>entry.status.seat===currentActual);
    if(!current)throw new Error('wish_current_player_missing');
    await reconnect(current.client,{roomId:ctx.roomId,seat:currentActual});
    const resumed=await bridgeState(current.client);
    expect(resumed.wish).toBe(14);
    expect(resumed.phase).toBe('play');
    await waitForSameRevision(ctx.clients);
  }catch(error){failed=true;throw error}finally{await cleanupEdge(testInfo,ctx,failed)}
});

test('production QQND edge: Dog transfers the lead to the partner',async({browser},testInfo)=>{
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  let ctx=null,failed=false;
  try{
    ctx=await createFourHumanTable(browser,baseURL,testInfo,'DOG');
    const {starter}=await moveSpecialToMahjongStarter(ctx.clients,'dog');
    await sendAndWait(starter.client,'play',{ids:['dog']});
    const state=await bridgeState(starter.client);
    expect(state.table).toEqual([]);
    expect(state.lastPlay).toBeNull();
    expect(state.currentPlayer).toBe(2);
    expect(state.trickLeader).toBe(2);
    expect(state.discarded.some(card=>card.id==='dog')).toBe(true);
  }catch(error){failed=true;throw error}finally{await cleanupEdge(testInfo,ctx,failed)}
});

test('production QQND edge: Phoenix can lead as a 1.5 single',async({browser},testInfo)=>{
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  let ctx=null,failed=false;
  try{
    ctx=await createFourHumanTable(browser,baseURL,testInfo,'PHX');
    const {starter}=await moveSpecialToMahjongStarter(ctx.clients,'phoenix');
    await sendAndWait(starter.client,'play',{ids:['phoenix']});
    const state=await bridgeState(starter.client);
    expect(state.lastPlay?.type).toBe('single');
    expect(state.lastPlay?.value).toBe(1.5);
    expect(state.table.at(-1)?.cards?.[0]?.special).toBe('phoenix');
  }catch(error){failed=true;throw error}finally{await cleanupEdge(testInfo,ctx,failed)}
});

test('production QQND edge: Dragon recipient wait survives reconnect',async({browser},testInfo)=>{
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  let ctx=null,failed=false;
  try{
    ctx=await createFourHumanTable(browser,baseURL,testInfo,'DRG');
    const moved=await moveSpecialToMahjongStarter(ctx.clients,'dragon');
    const starter=moved.starter;
    const byActual=new Map(moved.entries.map(entry=>[entry.status.seat,entry.client]));
    await sendAndWait(starter.client,'play',{ids:['dragon']});

    for(let count=0;count<3;count+=1){
      const state=await bridgeState(starter.client);
      if(state.dragonRecipient==='needed')break;
      const currentActual=actualSeat(state.currentPlayer,starter.status.seat);
      const actor=byActual.get(currentActual);
      if(!actor)throw new Error('dragon_pass_actor_missing');
      await sendAndWait(actor,'pass',{});
    }
    expect((await bridgeState(starter.client)).dragonRecipient).toBe('needed');

    await reconnect(starter.client,{roomId:ctx.roomId,seat:starter.status.seat});
    expect((await bridgeState(starter.client)).dragonRecipient).toBe('needed');
    await sendAndWait(starter.client,'dragon',{seat:1});
    const after=await bridgeState(starter.client);
    expect(after.dragonRecipient).toBeNull();
    expect(after.table).toEqual([]);
    expect(after.captured[1].some(card=>card.id==='dragon')).toBe(true);
  }catch(error){failed=true;throw error}finally{await cleanupEdge(testInfo,ctx,failed)}
});

function engineerBomb(entries){
  const protectedIds=specialProtection(entries);
  const mahjongOwner=ownerOfSpecial(entries,'mahjong').status.seat;
  for(let rank=2;rank<=14;rank+=1){
    const cardsBySeat=new Map(entries.map(entry=>[
      entry.status.seat,
      entry.state.hands[0].filter(card=>!card.special&&card.rank===rank),
    ]));
    for(const target of [0,1,2,3]){
      const own=cardsBySeat.get(target)??[];
      const needed=4-own.length;
      if(needed<0)continue;
      const donors=[0,1,2,3].filter(seat=>seat!==target&&(cardsBySeat.get(seat)?.length||0)>0);
      if(donors.length<needed)continue;
      const forcedTransfers=[];
      for(const donor of donors.slice(0,needed)){
        const card=cardsBySeat.get(donor)?.[0];
        if(!card)throw new Error('bomb_donor_card_missing');
        forcedTransfers.push({from:donor,to:target,cardId:card.id});
      }
      for(const card of own)protectedIds.push({seat:target,cardId:card.id});
      return {target,rank,mahjongOwner,forcedTransfers,protectedIds};
    }
  }
  throw new Error('no_engineerable_four_kind');
}

test('production QQND edge: a human can interrupt out of turn with a bomb',async({browser},testInfo)=>{
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  let ctx=null,failed=false;
  try{
    ctx=await createFourHumanTable(browser,baseURL,testInfo,'BOMB');
    await finishGrand(ctx.clients);
    const exchangeEntries=await seatEntries(ctx.clients);
    const plan=engineerBomb(exchangeEntries);
    const maps=buildExchangeMaps(exchangeEntries,plan);
    await submitExchangeMaps(exchangeEntries,maps);

    let entries=await seatEntries(ctx.clients);
    const starter=entries.find(entry=>entry.status.seat===plan.mahjongOwner);
    const bomber=entries.find(entry=>entry.status.seat===plan.target);
    if(!starter||!bomber)throw new Error('bomb_actor_missing');
    expect(starter.state.currentPlayer).toBe(0);
    expect(bomber.state.hands[0].filter(card=>!card.special&&card.rank===plan.rank)).toHaveLength(4);

    await sendAndWait(starter.client,'play',{ids:['mahjong']});
    let bomberState=await bridgeState(bomber.client);
    if(bomberState.currentPlayer===0)await sendAndWait(bomber.client,'pass',{});
    bomberState=await bridgeState(bomber.client);
    expect(bomberState.currentPlayer).not.toBe(0);
    const bomb=possibleSelections(bomberState.hands[0],bomberState.lastPlay,bomberState.wish)
      .find(option=>option.play.type==='bomb'&&option.cards.length===4&&option.cards.every(card=>card.rank===plan.rank));
    if(!bomb)throw new Error('engineered_bomb_not_legal');

    await sendAndWait(bomber.client,'play',{ids:bomb.cards.map(card=>card.id)});
    const after=await bridgeState(bomber.client);
    expect(after.lastPlay?.type).toBe('bomb');
    expect(after.table.at(-1)?.seat).toBe(0);
    expect(after.table.at(-1)?.cards).toHaveLength(4);
  }catch(error){failed=true;throw error}finally{await cleanupEdge(testInfo,ctx,failed)}
});
