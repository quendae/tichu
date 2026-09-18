import {test,expect} from '@playwright/test';
import {
  attachDiagnostics,
  bridgeStatus,
  canonicalBotSeats,
  cleanupClients,
  createPrivateRoom,
  driveHumanDecision,
  joinPrivateRoom,
  openE2EClient,
  runTag,
  startWithBots,
} from './helpers.mjs';

test('production QQND: disconnected human becomes substitute bot after grace',async({browser},testInfo)=>{
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

    const disconnectedSeat=(await bridgeStatus(h2)).seat;
    const revisionBefore=(await bridgeStatus(h1)).stateSeq;
    await h2.context.close();
    clients.splice(clients.indexOf(h2),1);

    await expect.poll(async()=>{
      const status=await bridgeStatus(h1);
      return status.presence.some(presence=>presence.seat===disconnectedSeat&&presence.botActive===true);
    },{timeout:75_000,interval:1_000}).toBe(true);

    await expect.poll(async()=>canonicalBotSeats(await bridgeStatus(h1)).includes(disconnectedSeat),{timeout:5_000}).toBe(true);

    const deadline=Date.now()+15_000;
    while(Date.now()<deadline&&(await bridgeStatus(h1)).stateSeq<=revisionBefore){
      const result=await driveHumanDecision(h1);
      if(!result.acted)await new Promise(resolve=>setTimeout(resolve,200));
    }
    expect((await bridgeStatus(h1)).stateSeq).toBeGreaterThan(revisionBefore);
  }catch(error){
    failed=true;
    throw error;
  }finally{
    if(failed)await attachDiagnostics(testInfo,clients,roomId,nicknames);
    const cleanupErrors=await cleanupClients(clients);
    if(cleanupErrors.length)await testInfo.attach('cleanup-errors',{body:cleanupErrors.join('\n'),contentType:'text/plain'});
  }
});
