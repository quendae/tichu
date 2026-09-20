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

test('production QQND: two humans and two bots complete a full match to 1000 points',async({browser},testInfo)=>{
  test.setTimeout(MATCH_TIMEOUT);
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  const tag=runTag(testInfo);
  const nicknames=[`E2E-${tag}-H1`,`E2E-${tag}-H2`];
  const clients=[];
  let roomId=null;
  let failed=false;
  let actions=0;
  let completedRounds=0;

  try{
    const h1=await openE2EClient(browser,baseURL,'H1');clients.push(h1);
    const h2=await openE2EClient(browser,baseURL,'H2');clients.push(h2);
    roomId=await createPrivateRoom(h1,nicknames[0]);
    await joinPrivateRoom(h2,nicknames[1],roomId);
    await startWithBots(h1);
    await expect.poll(()=>bridgeStatus(h2).then(status=>status.active)).toBe(true);

    for(const client of clients){
      const status=await bridgeStatus(client);
      expect(canonicalBotSeats(status)).toHaveLength(2);
      assertPrivateHands(await bridgeState(client));
    }

    while(actions<MAX_ACTIONS){
      const hostState=await bridgeState(h1);
      if(hostState.phase==='match-end')break;

      if(hostState.phase==='round-end'){
        completedRounds+=1;
        await sendAndWait(h1,'next-round',{});
        actions+=1;
        continue;
      }

      let acted=false;
      for(const client of clients){
        const result=await driveHumanDecision(client);
        if(result.acted){
          actions+=1;
          acted=true;
          break;
        }
      }
      if(!acted)await new Promise(resolve=>setTimeout(resolve,100));
    }

    await waitForSameRevision(clients);
    const finalStates=await Promise.all(clients.map(bridgeState));
    const finalStatuses=await Promise.all(clients.map(bridgeStatus));
    const finalHost=finalStates[0];

    expect(actions).toBeLessThan(MAX_ACTIONS);
    expect(completedRounds).toBeGreaterThan(0);
    expect(finalHost.phase).toBe('match-end');
    expect(Math.max(...finalHost.scores)).toBeGreaterThanOrEqual(1000);
    expect(finalHost.scores[0]).not.toBe(finalHost.scores[1]);

    const expectedBots=canonicalBotSeats(finalStatuses[0]).sort((a,b)=>a-b);
    expect(expectedBots).toHaveLength(2);
    for(const status of finalStatuses)expect(canonicalBotSeats(status).sort((a,b)=>a-b)).toEqual(expectedBots);

    const summaries=finalStates.map((state,index)=>canonicalPublicSummary(state,finalStatuses[index]));
    expect(summaries[1]).toEqual(summaries[0]);
    for(const state of finalStates)assertPrivateHands(state);
    for(const client of clients)expect(client.errors).toEqual([]);

    console.log('FULL_MATCH_2H2B',JSON.stringify({roomId,actions,completedRounds,scores:finalHost.scores,winnerTeam:finalHost.winnerTeam,botSeats:expectedBots}));
  }catch(error){
    failed=true;
    throw error;
  }finally{
    if(failed)await attachDiagnostics(testInfo,clients,roomId,nicknames);
    const cleanupErrors=await cleanupClients(clients);
    if(cleanupErrors.length)await testInfo.attach('cleanup-errors',{body:cleanupErrors.join('\n'),contentType:'text/plain'});
  }
});
