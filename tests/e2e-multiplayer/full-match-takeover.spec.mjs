import {test,expect} from '@playwright/test';
import {
  assertPrivateHands,
  attachDiagnostics,
  bridgeState,
  bridgeStatus,
  canonicalBotSeats,
  cleanupClients,
  createPrivateRoom,
  driveHumanDecision,
  joinPrivateRoom,
  openE2EClient,
  runTag,
  sendAndWait,
  startWithBots,
} from './helpers.mjs';

const MATCH_TIMEOUT=15*60_000;
const MAX_ACTIONS=6000;

test('production QQND: disconnected human is taken over and the match completes',async({browser},testInfo)=>{
  test.setTimeout(MATCH_TIMEOUT);
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  const tag=runTag(testInfo);
  const nicknames=[`E2E-${tag}-H1`,`E2E-${tag}-H2`];
  const clients=[];
  let roomId=null;
  let failed=false;
  let actions=0;
  let playActions=0;
  let completedRounds=0;
  let disconnectedSeat=null;

  try{
    const h1=await openE2EClient(browser,baseURL,'H1');clients.push(h1);
    const h2=await openE2EClient(browser,baseURL,'H2');clients.push(h2);
    roomId=await createPrivateRoom(h1,nicknames[0]);
    await joinPrivateRoom(h2,nicknames[1],roomId);
    await startWithBots(h1);
    await expect.poll(()=>bridgeStatus(h2).then(status=>status.active)).toBe(true);

    while(playActions<6&&actions<MAX_ACTIONS){
      const state=await bridgeState(h1);
      if(state.phase==='round-end'){
        completedRounds+=1;
        await sendAndWait(h1,'next-round',{});
        actions+=1;
        continue;
      }
      if(state.phase==='match-end')throw new Error('match_ended_before_disconnect');

      let acted=false;
      for(const client of [h1,h2]){
        const result=await driveHumanDecision(client);
        if(result.acted){
          actions+=1;
          if(['play','pass','dragon'].includes(result.type))playActions+=1;
          acted=true;
          break;
        }
      }
      if(!acted)await new Promise(resolve=>setTimeout(resolve,100));
    }

    expect(playActions).toBeGreaterThanOrEqual(6);
    expect((await bridgeState(h1)).phase).toBe('play');
    disconnectedSeat=(await bridgeStatus(h2)).seat;
    expect(Number.isInteger(disconnectedSeat)).toBe(true);

    await h2.context.close();
    clients.splice(clients.indexOf(h2),1);

    await expect.poll(async()=>{
      const status=await bridgeStatus(h1);
      return status.presence.some(presence=>presence.seat===disconnectedSeat&&presence.botActive===true);
    },{timeout:80_000,interval:1_000}).toBe(true);

    const takeoverStatus=await bridgeStatus(h1);
    const takeoverBots=canonicalBotSeats(takeoverStatus).sort((a,b)=>a-b);
    expect(takeoverBots).toHaveLength(3);
    expect(takeoverBots).toContain(disconnectedSeat);

    while(actions<MAX_ACTIONS){
      const state=await bridgeState(h1);
      if(state.phase==='match-end')break;
      if(state.phase==='round-end'){
        completedRounds+=1;
        await sendAndWait(h1,'next-round',{});
        actions+=1;
        continue;
      }
      const result=await driveHumanDecision(h1);
      if(result.acted)actions+=1;
      else await new Promise(resolve=>setTimeout(resolve,100));
    }

    const finalState=await bridgeState(h1);
    const finalStatus=await bridgeStatus(h1);
    const finalBots=canonicalBotSeats(finalStatus).sort((a,b)=>a-b);

    expect(actions).toBeLessThan(MAX_ACTIONS);
    expect(finalState.phase).toBe('match-end');
    expect(Math.max(...finalState.scores)).toBeGreaterThanOrEqual(1000);
    expect(finalState.scores[0]).not.toBe(finalState.scores[1]);
    expect(finalBots).toHaveLength(3);
    expect(finalBots).toContain(disconnectedSeat);
    assertPrivateHands(finalState);
    expect(h1.errors).toEqual([]);

    console.log('FULL_MATCH_TAKEOVER',JSON.stringify({roomId,actions,playActionsBeforeDisconnect:playActions,completedRounds,scores:finalState.scores,winnerTeam:finalState.winnerTeam,disconnectedSeat,botSeats:finalBots}));
  }catch(error){
    failed=true;
    throw error;
  }finally{
    if(failed)await attachDiagnostics(testInfo,clients,roomId,nicknames);
    const cleanupErrors=await cleanupClients(clients);
    if(cleanupErrors.length)await testInfo.attach('cleanup-errors',{body:cleanupErrors.join('\n'),contentType:'text/plain'});
  }
});
