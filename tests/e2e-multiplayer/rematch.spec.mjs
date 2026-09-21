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
  runTag,
  sendAndWait,
  startWithBots,
  waitForSameRevision,
} from './helpers.mjs';

const MATCH_TIMEOUT=12*60_000;
const MAX_ACTIONS=6000;

test('production QQND: finished 2H2B match can rematch in the same room',async({browser},testInfo)=>{
  test.setTimeout(MATCH_TIMEOUT);
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  const tag=runTag(testInfo);
  const nicknames=[`REMATCH-${tag}-H1`,`REMATCH-${tag}-H2`];
  const clients=[];
  let roomId=null;
  let failed=false;
  let actions=0;
  let completedRounds=0;

  try{
    const host=await openE2EClient(browser,baseURL,'H1');clients.push(host);
    const guest=await openE2EClient(browser,baseURL,'H2');clients.push(guest);
    roomId=await createPrivateRoom(host,nicknames[0]);
    await joinPrivateRoom(guest,nicknames[1],roomId);
    await startWithBots(host);
    await expect.poll(()=>bridgeStatus(guest).then(status=>status.active)).toBe(true);

    const initialStatuses=await Promise.all(clients.map(bridgeStatus));
    const initialSeats=initialStatuses.map(status=>status.seat);
    const initialBots=canonicalBotSeats(initialStatuses[0]).sort((a,b)=>a-b);
    expect(initialBots).toHaveLength(2);

    while(actions<MAX_ACTIONS){
      const hostState=await bridgeState(host);
      if(hostState.phase==='match-end')break;
      if(hostState.phase==='round-end'){
        completedRounds+=1;
        await sendAndWait(host,'next-round',{});
        actions+=1;
        continue;
      }
      let acted=false;
      for(const client of clients){
        const result=await driveHumanDecision(client);
        if(result.acted){actions+=1;acted=true;break;}
      }
      if(!acted)await new Promise(resolve=>setTimeout(resolve,100));
    }

    await waitForSameRevision(clients);
    const finishedStates=await Promise.all(clients.map(bridgeState));
    const finishedStatuses=await Promise.all(clients.map(bridgeStatus));
    expect(actions).toBeLessThan(MAX_ACTIONS);
    expect(completedRounds).toBeGreaterThan(0);
    expect(finishedStates[0].phase).toBe('match-end');
    expect(Math.max(...finishedStates[0].scores)).toBeGreaterThanOrEqual(1000);
    const finishedSummaries=finishedStates.map((state,index)=>canonicalPublicSummary(state,finishedStatuses[index]));
    expect(finishedSummaries[1]).toEqual(finishedSummaries[0]);

    const guestRejection=await guest.page.evaluate(async roomId=>{
      const mp=window.tichu.mp;
      try{
        await mp.request({type:'game.rematch',roomId},'game.started',message=>message.room?.id===roomId);
        return 'unexpected_success';
      }catch(error){return String(error?.message||error)}
    },roomId);
    expect(guestRejection).toBe('only_room_owner_can_rematch');
    const expectedGuestError='server:only_room_owner_can_rematch';
    expect(guest.errors).toContain(expectedGuestError);
    guest.errors.splice(guest.errors.indexOf(expectedGuestError),1);

    const hostSent=await host.page.evaluate(()=>window.tichu.mp.rematch());
    expect(hostSent).toBe(true);
    await expect.poll(()=>bridgeState(host).then(state=>state.phase),{timeout:15_000}).toBe('grand');
    await expect.poll(()=>bridgeState(guest).then(state=>state.phase),{timeout:15_000}).toBe('grand');
    await waitForSameRevision(clients);

    const rematchStates=await Promise.all(clients.map(bridgeState));
    const rematchStatuses=await Promise.all(clients.map(bridgeStatus));
    expect(rematchStatuses.map(status=>status.seat)).toEqual(initialSeats);
    for(const status of rematchStatuses){
      expect(canonicalBotSeats(status).sort((a,b)=>a-b)).toEqual(initialBots);
      expect(status.roomId).toBe(roomId);
      expect(status.active).toBe(true);
      expect(status.authoritative).toBe(true);
    }
    for(const state of rematchStates){
      expect(state.phase).toBe('grand');
      expect(state.scores).toEqual([0,0]);
      assertPrivateHands(state);
    }
    const rematchSummaries=rematchStates.map((state,index)=>canonicalPublicSummary(state,rematchStatuses[index]));
    expect(rematchSummaries[1]).toEqual(rematchSummaries[0]);
    for(const client of clients)expect(client.errors).toEqual([]);

    console.log('REMATCH_ACCEPTANCE',JSON.stringify({
      roomId,actions,completedRounds,finishedScores:finishedStates[0].scores,
      seats:initialSeats,botSeats:initialBots,rematchPhase:rematchStates[0].phase,rematchScores:rematchStates[0].scores,
    }));
  }catch(error){
    failed=true;
    throw error;
  }finally{
    if(failed)await attachDiagnostics(testInfo,clients,roomId,nicknames);
    const cleanupErrors=await cleanupClients(clients);
    if(cleanupErrors.length)await testInfo.attach('cleanup-errors',{body:cleanupErrors.join('\n'),contentType:'text/plain'});
  }
});
