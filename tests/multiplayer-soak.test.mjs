import test from 'node:test';
import assert from 'node:assert/strict';
import {readSoakConfig,summarizeSoakResults,validateSoakSummary} from './e2e-multiplayer/soak-support.mjs';

test('soak config applies safe defaults and bounded integer overrides',()=>{
  assert.deepEqual(readSoakConfig({}),{
    rooms:4,
    churnRooms:8,
    reconnectAfterActions:60,
    maxActions:6000,
  });
  assert.deepEqual(readSoakConfig({SOAK_ROOMS:'6',SOAK_CHURN_ROOMS:'12',SOAK_RECONNECT_AFTER_ACTIONS:'90',SOAK_MAX_ACTIONS:'7000'}),{
    rooms:6,
    churnRooms:12,
    reconnectAfterActions:90,
    maxActions:7000,
  });
  assert.equal(readSoakConfig({SOAK_ROOMS:'99'}).rooms,8);
  assert.equal(readSoakConfig({SOAK_ROOMS:'0'}).rooms,1);
  assert.equal(readSoakConfig({SOAK_MAX_ACTIONS:'nope'}).maxActions,6000);
});

test('soak summary aggregates full-match and reconnect metrics',()=>{
  const summary=summarizeSoakResults([
    {roomId:'AAAA-BBBB',actions:520,completedRounds:11,durationMs:210000,reconnects:1,scores:[1020,880],errors:[]},
    {roomId:'CCCC-DDDD',actions:610,completedRounds:13,durationMs:245000,reconnects:1,scores:[930,1015],errors:[]},
  ]);
  assert.equal(summary.rooms,2);
  assert.equal(summary.completedMatches,2);
  assert.equal(summary.totalActions,1130);
  assert.equal(summary.totalRounds,24);
  assert.equal(summary.reconnects,2);
  assert.equal(summary.maxDurationMs,245000);
  assert.equal(summary.clientErrors,0);
});

test('soak validation requires every room to finish, reconnect and stay error-free',()=>{
  const good=summarizeSoakResults([
    {roomId:'AAAA-BBBB',actions:500,completedRounds:10,durationMs:200000,reconnects:1,scores:[1000,700],errors:[]},
    {roomId:'CCCC-DDDD',actions:550,completedRounds:11,durationMs:220000,reconnects:1,scores:[800,1020],errors:[]},
  ]);
  assert.deepEqual(validateSoakSummary(good,{expectedRooms:2}),[]);

  const bad={...good,completedMatches:1,reconnects:1,clientErrors:2};
  assert.deepEqual(validateSoakSummary(bad,{expectedRooms:2}),[
    'completed_matches:1/2',
    'reconnects:1/2',
    'client_errors:2',
  ]);
});
