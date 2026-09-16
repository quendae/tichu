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
  startWithoutBots,
  waitForSameRevision,
} from './helpers.mjs';

test('production QQND: four humans play with no bots',async({browser},testInfo)=>{
  const baseURL=testInfo.project.use.baseURL;
  if(typeof baseURL!=='string')throw new Error('missing_base_url');
  const tag=runTag(testInfo);
  const nicknames=[1,2,3,4].map(index=>`E2E-${tag}-H${index}`);
  const clients=[];
  let roomId=null;
  let failed=false;

  try{
    for(let index=0;index<4;index+=1)clients.push(await openE2EClient(browser,baseURL,`H${index+1}`));
    roomId=await createPrivateRoom(clients[0],nicknames[0]);
    for(let index=1;index<4;index+=1)await joinPrivateRoom(clients[index],nicknames[index],roomId);
    await startWithoutBots(clients[0]);
    for(const client of clients)await expect.poll(()=>bridgeStatus(client).then(status=>status.active)).toBe(true);
    for(const client of clients)assertPrivateHands(await bridgeState(client));

    let playActions=0;
    const deadline=Date.now()+60_000;
    while(Date.now()<deadline&&playActions<6){
      let acted=false;
      for(const client of clients){
        const result=await driveHumanDecision(client);
        if(result.acted){
          acted=true;
          if(['play','pass','dragon'].includes(result.type))playActions+=1;
          break;
        }
      }
      if(!acted)await new Promise(resolve=>setTimeout(resolve,200));
    }

    expect(playActions).toBeGreaterThanOrEqual(6);
    await waitForSameRevision(clients);
    const summaries=await Promise.all(clients.map(async client=>canonicalPublicSummary(await bridgeState(client),await bridgeStatus(client))));
    for(const summary of summaries.slice(1))expect(summary).toEqual(summaries[0]);
    for(const client of clients)expect((await bridgeStatus(client)).botSeats).toEqual([]);
  }catch(error){
    failed=true;
    throw error;
  }finally{
    if(failed)await attachDiagnostics(testInfo,clients,roomId,nicknames);
    const cleanupErrors=await cleanupClients(clients);
    if(cleanupErrors.length)await testInfo.attach('cleanup-errors',{body:cleanupErrors.join('\n'),contentType:'text/plain'});
  }
});
