import test from 'node:test';
import assert from 'node:assert/strict';
import {createTichuE2EBridge,isE2EMode} from '../src/e2e-bridge.js';

test('isE2EMode requires e2e=1 exactly',()=>{
  assert.equal(isE2EMode('?e2e=1'),true);
  assert.equal(isE2EMode('?e2e=true'),false);
  assert.equal(isE2EMode(''),false);
});

test('bridge omits credentials and converts Sets',()=>{
  const game={state:{selected:new Set(['a']),hands:[[{id:'a'}],[{id:'hidden-1',hidden:true}],[],[]]}};
  const mp={
    active:true,authoritative:true,room:{id:'ROOM'},seat:2,stateSeq:7,botSeats:[1,3],socket:{readyState:1},
    presence:[{sessionId:'secret',seat:2,nickname:'P2',connected:true,graceDeadline:null,botActive:false}],
    session:{id:'secret'},resumeToken:'token',action:async()=>true,
  };
  const bridge=createTichuE2EBridge(game,mp);
  const status=bridge.getMultiplayerStatus();
  assert.equal(status.connected,true);
  assert.equal('resumeToken' in status,false);
  assert.equal('session' in status,false);
  assert.equal('sessionId' in status.presence[0],false);
  assert.deepEqual(bridge.getState().selected,['a']);
});

test('bridge delegates actions',async()=>{
  const calls=[];
  const mp={active:true,authoritative:true,room:null,seat:0,stateSeq:0,botSeats:[],presence:[],socket:null,
    action:async(...args)=>{calls.push(args);return true}};
  await createTichuE2EBridge({state:{}},mp).action('grand',{call:false});
  assert.deepEqual(calls,[['grand',{call:false}]]);
});
