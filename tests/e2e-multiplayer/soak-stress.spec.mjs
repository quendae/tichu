import {test,expect} from '@playwright/test';
import {
  assertPrivateHands,
  attachDiagnostics,
  bridgeState,
  bridgeStatus,
  canonicalBotSeats,
  canonicalPublicSummary,
  cleanupClients,
  createPrivateRoom,
  driveHumanDecision,
  joinPrivateRoom,
  openE2EClient,
  openMultiplayer,
  runTag,
  sendAndWait,
  startWithBots,
  waitForSameRevision,
} from './helpers.mjs';
import {readSoakConfig,summarizeSoakResults,validateSoakSummary} from './soak-support.mjs';

const MATCH_TIMEOUT=20*60_000;
const CHURN_TIMEOUT=4*60_000;
const RECONNECT_TIMEOUT=25_000;
const config=readSoakConfig();

async function forceReconnect(client,roomId){
  const before=await bridgeStatus(client);
  const closed=await client.page.evaluate(()=>window.__tichuE2E.closeSocket());
  expect(closed).toBe(true);
  await expect.poll(()=>bridgeStatus(client).then(status=>status.connected),{timeout:5_000,interval:100}).toBe(false);
  await expect.poll(async()=>{
    const status=await bridgeStatus(client);
    return status.connected&&status.active&&status.roomId===roomId&&status.seat===before.seat;
  },{timeout:RECONNECT_TIMEOUT,interval:250}).toBe(true);
  await expect.poll(()=>bridgeStatus(client).then(status=>status.stateSeq),{timeout:RECONNECT_TIMEOUT,interval:250}).toBeGreaterThanOrEqual(before.stateSeq);
}

async function runFullMatchRoom({browser,baseURL,tag,index,testInfo}){
  const nicknames=[`SOAK-${tag}-${index}-H1`,`SOAK-${tag}-${index}-H2`];
  const clients=[];
  let roomId=null;
  let failure=null;
  let cleanupErrors=[];
  let actions=0;
  let completedRounds=0;
  let reconnects=0;
  const startedAt=Date.now();
  let result=null;

  try{
    const h1=await openE2EClient(browser,baseURL,`R${index}-H1`);clients.push(h1);
    const h2=await openE2EClient(browser,baseURL,`R${index}-H2`);clients.push(h2);
    roomId=await createPrivateRoom(h1,nicknames[0]);
    await joinPrivateRoom(h2,nicknames[1],roomId);
    await startWithBots(h1);
    await expect.poll(()=>bridgeStatus(h2).then(status=>status.active)).toBe(true);

    for(const client of clients){
      const status=await bridgeStatus(client);
      expect(canonicalBotSeats(status)).toHaveLength(2);
      assertPrivateHands(await bridgeState(client));
    }

    while(actions<config.maxActions){
      const hostState=await bridgeState(h1);
      if(hostState.phase==='match-end')break;

      if(reconnects===0&&actions>=config.reconnectAfterActions){
        await forceReconnect(h2,roomId);
        reconnects=1;
        assertPrivateHands(await bridgeState(h2));
        continue;
      }

      if(hostState.phase==='round-end'){
        completedRounds+=1;
        await sendAndWait(h1,'next-round',{});
        actions+=1;
        continue;
      }

      let acted=false;
      for(const client of clients){
        const decision=await driveHumanDecision(client);
        if(decision.acted){
          actions+=1;
          acted=true;
          break;
        }
      }
      if(!acted)await new Promise(resolve=>setTimeout(resolve,75));
    }

    await waitForSameRevision(clients);
    const states=await Promise.all(clients.map(bridgeState));
    const statuses=await Promise.all(clients.map(bridgeStatus));
    const finalState=states[0];

    expect(actions).toBeLessThan(config.maxActions);
    expect(reconnects).toBe(1);
    expect(completedRounds).toBeGreaterThan(0);
    expect(finalState.phase).toBe('match-end');
    expect(Math.max(...finalState.scores)).toBeGreaterThanOrEqual(1000);
    expect(finalState.scores[0]).not.toBe(finalState.scores[1]);

    const bots=canonicalBotSeats(statuses[0]).sort((a,b)=>a-b);
    expect(bots).toHaveLength(2);
    for(const status of statuses)expect(canonicalBotSeats(status).sort((a,b)=>a-b)).toEqual(bots);
    const summaries=states.map((state,viewer)=>canonicalPublicSummary(state,statuses[viewer]));
    expect(summaries[1]).toEqual(summaries[0]);
    for(const state of states)assertPrivateHands(state);
    for(const client of clients)expect(client.errors).toEqual([]);

    result={
      roomId,
      actions,
      completedRounds,
      reconnects,
      durationMs:Date.now()-startedAt,
      scores:[...finalState.scores],
      errors:clients.flatMap(client=>client.errors),
    };
  }catch(error){
    failure=error;
    await attachDiagnostics(testInfo,clients,roomId,nicknames);
  }finally{
    cleanupErrors=await cleanupClients(clients);
  }

  if(failure)throw failure;
  if(cleanupErrors.length)result.errors.push(...cleanupErrors);
  return result;
}

async function assertRoomsGone(browser,baseURL,roomIds,tag){
  const probe=await openE2EClient(browser,baseURL,'cleanup-probe');
  try{
    await openMultiplayer(probe);
    await probe.page.locator('#mp-nick').fill(`SOAK-${tag}-PROBE`);
    for(const roomId of roomIds){
      await probe.page.locator('#mp-code').fill(roomId);
      await probe.page.evaluate(()=>{const status=document.getElementById('mp-status');if(status){status.textContent='';status.classList.remove('error')}});
      await probe.page.locator('#mp-join').click();
      const status=probe.page.locator('#mp-status');
      await expect(status).toHaveClass(/error/,{timeout:10_000});
      await expect(status).toHaveText('Nie znaleziono pokoju.');
      expect((await bridgeStatus(probe)).roomId).toBeNull();
    }
  }finally{
    await cleanupClients([probe]);
  }
}

test('production QQND soak: concurrent 2H2B rooms survive reconnects and finish full matches',async({browser},testInfo)=>{
  test.setTimeout(MATCH_TIMEOUT);
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  const tag=runTag(testInfo);

  const settled=await Promise.allSettled(Array.from({length:config.rooms},(_,index)=>runFullMatchRoom({
    browser,
    baseURL,
    tag,
    index:index+1,
    testInfo,
  })));
  const failures=settled.filter(item=>item.status==='rejected');
  if(failures.length){
    await testInfo.attach('soak-failures',{
      body:failures.map(item=>item.reason?.stack||String(item.reason)).join('\n\n'),
      contentType:'text/plain',
    });
  }
  expect(failures).toHaveLength(0);

  const results=settled.map(item=>item.value);
  const summary=summarizeSoakResults(results);
  const validation=validateSoakSummary(summary,{expectedRooms:config.rooms});
  await testInfo.attach('soak-summary',{body:JSON.stringify(summary,null,2),contentType:'application/json'});
  console.log('SOAK_SUMMARY',JSON.stringify(summary));
  expect(validation).toEqual([]);

  await assertRoomsGone(browser,baseURL,results.map(result=>result.roomId),tag);
});

test('production QQND soak: private-room churn leaves unique codes and no stale rooms',async({browser},testInfo)=>{
  test.setTimeout(CHURN_TIMEOUT);
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  const tag=runTag(testInfo);
  const clients=[];
  let roomIds=[];

  try{
    const hosts=await Promise.all(Array.from({length:config.churnRooms},async(_,index)=>{
      const client=await openE2EClient(browser,baseURL,`CHURN-${index+1}`);
      clients.push(client);
      const roomId=await createPrivateRoom(client,`CHURN-${tag}-${index+1}`);
      return {client,roomId};
    }));
    roomIds=hosts.map(row=>row.roomId);
    expect(new Set(roomIds).size).toBe(config.churnRooms);
    for(const {client} of hosts)expect(client.errors).toEqual([]);
  }finally{
    const cleanupErrors=await cleanupClients(clients);
    expect(cleanupErrors).toEqual([]);
  }

  await assertRoomsGone(browser,baseURL,roomIds,tag);
  const churnSummary={roomsCreated:roomIds.length,uniqueCodes:new Set(roomIds).size,roomsRejectedAfterCleanup:roomIds.length};
  await testInfo.attach('churn-summary',{body:JSON.stringify(churnSummary,null,2),contentType:'application/json'});
  console.log('SOAK_CHURN',JSON.stringify(churnSummary));
});
