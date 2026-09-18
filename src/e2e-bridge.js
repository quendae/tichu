const cloneForTest=value=>JSON.parse(JSON.stringify(value,(_key,item)=>item instanceof Set?[...item]:item));
const safePresence=presence=>(presence||[]).map(({seat,nickname,connected,graceDeadline,botActive})=>({seat,nickname,connected,graceDeadline,botActive}));

export function isE2EMode(search=globalThis.location?.search||''){
  return new URLSearchParams(search).get('e2e')==='1';
}

export function createTichuE2EBridge(game,mp){
  return Object.freeze({
    getState:()=>cloneForTest(game.state),
    getMultiplayerStatus:()=>cloneForTest({
      active:!!mp.active,
      authoritative:!!mp.authoritative,
      connected:mp.socket?.readyState===1,
      roomId:mp.room?.id||null,
      seat:Number.isInteger(mp.seat)?mp.seat:null,
      stateSeq:Number(mp.stateSeq||0),
      botSeats:[...(mp.botSeats||[])],
      presence:safePresence(mp.presence),
    }),
    action:(type,payload={})=>mp.action(type,payload),
    closeSocket:()=>{
      if(!mp.socket)return false;
      mp.socket.close(4000,'e2e_disconnect');
      return true;
    },
    waitForRevision:(minimum,timeoutMs=12_000)=>new Promise((resolve,reject)=>{
      const deadline=Date.now()+timeoutMs;
      const poll=()=>{
        if(Number(mp.stateSeq||0)>=minimum)return resolve(Number(mp.stateSeq||0));
        if(Date.now()>=deadline)return reject(new Error(`revision_timeout:${minimum}`));
        setTimeout(poll,25);
      };
      poll();
    }),
  });
}

export function installTichuE2EBridge({game,mp,target=globalThis}){
  if(!target||target.__tichuE2E)return target?.__tichuE2E;
  const bridge=createTichuE2EBridge(game,mp);
  Object.defineProperty(target,'__tichuE2E',{value:bridge,configurable:true});
  return bridge;
}
