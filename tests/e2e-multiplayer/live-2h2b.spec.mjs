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
  startWithBots,
  waitForSameRevision,
} from './helpers.mjs';

test('production QQND: 2 humans + 2 bots synchronize, redact and reconnect',async({browser},testInfo)=>{
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  const tag=runTag(testInfo);
  const nicknames=[`E2E-${tag}-H1`,`E2E-${tag}-H2`];
  const clients=[];
  let roomId=null;
  let failed=false;

  try{
    const h1=await openE2EClient(browser,baseURL,'H1');clients.push(h1);
    const h2=await openE2EClient(browser,baseURL,'H2');clients.push(h2);
    roomId=await createPrivateRoom(h1,nicknames[0]);
    await joinPrivateRoom(h2,nicknames[1],roomId);
    await startWithBots(h1);
    await expect.poll(()=>bridgeStatus(h2).then(status=>status.active)).toBe(true);

    const initial=[await bridgeState(h1),await bridgeState(h2)];
    initial.forEach(state=>expect(Array.isArray(state.discarded)).toBe(true));
    initial.forEach(assertPrivateHands);

    let completedTricks=0;
    let actions=0;
    let previous=initial[0];
    const deadline=Date.now()+45_000;

    while(Date.now()<deadline&&completedTricks<1){
      let acted=false;
      for(const client of [h1,h2]){
        const result=await driveHumanDecision(client);
        if(result.acted){acted=true;actions+=1;break;}
      }
      if(!acted)await new Promise(resolve=>setTimeout(resolve,200));
      const current=await bridgeState(h1);
      if(
        previous.table?.length>0&&
        current.table?.length===0&&
        current.lastPlay===null&&
        (current.discarded?.length||0)===(previous.discarded?.length||0)
      )completedTricks+=1;
      previous=current;
    }

    expect(actions).toBeGreaterThanOrEqual(4);
    expect(completedTricks).toBeGreaterThanOrEqual(1);

    const revision=await waitForSameRevision([h1,h2]);
    await h2.page.evaluate(()=>window.__tichuE2E.closeSocket());
    await expect.poll(()=>bridgeStatus(h2).then(status=>status.connected),{timeout:10_000}).toBe(false);
    await expect.poll(()=>bridgeStatus(h2).then(status=>status.connected),{timeout:20_000}).toBe(true);

    const resumed=await bridgeStatus(h2);
    expect(resumed.roomId).toBe(roomId);
    expect(resumed.stateSeq).toBeGreaterThanOrEqual(revision);

    const [s1,s2]=await Promise.all([bridgeState(h1),bridgeState(h2)]);
    const [m1,m2]=await Promise.all([bridgeStatus(h1),bridgeStatus(h2)]);
    expect(canonicalPublicSummary(s1,m1)).toEqual(canonicalPublicSummary(s2,m2));
    assertPrivateHands(s1);
    assertPrivateHands(s2);
  }catch(error){
    failed=true;
    throw error;
  }finally{
    if(failed)await attachDiagnostics(testInfo,clients,roomId,nicknames);
    const cleanupErrors=await cleanupClients(clients);
    if(cleanupErrors.length){
      await testInfo.attach('cleanup-errors',{body:cleanupErrors.join('\n'),contentType:'text/plain'});
    }
  }
});
