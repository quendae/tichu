import {test,expect} from '@playwright/test';
import {
  assertPrivateHands,
  attachDiagnostics,
  bridgeState,
  bridgeStatus,
  canonicalPublicSummary,
  cleanupClients,
  createPrivateRoom,
  driveHumanDecision,
  joinPrivateRoom,
  openE2EClient,
  runTag,
  sendAndWait,
  startWithoutBots,
  waitForSameRevision,
} from './helpers.mjs';

const MATCH_TIMEOUT=12*60_000;
const MAX_ACTIONS=6000;

test('production QQND: four humans complete a full match to 1000 points',async({browser},testInfo)=>{
  test.setTimeout(MATCH_TIMEOUT);
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  const tag=runTag(testInfo);
  const nicknames=[1,2,3,4].map(index=>`E2E-${tag}-FM${index}`);
  const clients=[];
  let roomId=null;
  let failed=false;
  let actions=0;
  let completedRounds=0;

  try{
    for(let index=0;index<4;index+=1)clients.push(await openE2EClient(browser,baseURL,`FM${index+1}`));
    roomId=await createPrivateRoom(clients[0],nicknames[0]);
    for(let index=1;index<4;index+=1)await joinPrivateRoom(clients[index],nicknames[index],roomId);
    await startWithoutBots(clients[0]);
    for(const client of clients)await expect.poll(()=>bridgeStatus(client).then(status=>status.active)).toBe(true);
    for(const client of clients)assertPrivateHands(await bridgeState(client));

    while(actions<MAX_ACTIONS){
      const hostState=await bridgeState(clients[0]);
      if(hostState.phase==='match-end')break;

      if(hostState.phase==='round-end'){
        completedRounds+=1;
        await sendAndWait(clients[0],'next-round',{});
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

    const finalStates=await Promise.all(clients.map(bridgeState));
    const finalHost=finalStates[0];
    expect(actions).toBeLessThan(MAX_ACTIONS);
    expect(completedRounds).toBeGreaterThan(0);
    expect(finalHost.phase).toBe('match-end');
    expect(Math.max(...finalHost.scores)).toBeGreaterThanOrEqual(1000);
    expect(finalHost.scores[0]).not.toBe(finalHost.scores[1]);

    await waitForSameRevision(clients);
    const summaries=await Promise.all(clients.map(async client=>canonicalPublicSummary(await bridgeState(client),await bridgeStatus(client))));
    for(const summary of summaries.slice(1))expect(summary).toEqual(summaries[0]);
    for(const state of finalStates)assertPrivateHands(state);
    for(const client of clients)expect(client.errors).toEqual([]);

    await testInfo.attach('full-match-summary',{
      body:JSON.stringify({roomId,actions,completedRounds,scores:finalHost.scores,winnerTeam:finalHost.winnerTeam},null,2),
      contentType:'application/json',
    });
  }catch(error){
    failed=true;
    throw error;
  }finally{
    if(failed)await attachDiagnostics(testInfo,clients,roomId,nicknames);
    const cleanupErrors=await cleanupClients(clients);
    if(cleanupErrors.length)await testInfo.attach('cleanup-errors',{body:cleanupErrors.join('\n'),contentType:'text/plain'});
  }
});
