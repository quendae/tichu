import test from 'node:test';
import assert from 'node:assert/strict';
import { runDeterministicMatch,runSimulationBatch,replayDeterministicMatch } from '../src/simulation/driver.js';
import { parseSimulationArgs } from '../scripts/simulate.mjs';

const failureMessage=result=>JSON.stringify(result?.replay?.failure||result,null,2);

test('same seed produces identical action summaries',()=>{
  const a=runDeterministicMatch({seed:738,stepLimit:10000,checkpointEvery:25});
  const b=runDeterministicMatch({seed:738,stepLimit:10000,checkpointEvery:25});
  assert.equal(a.ok,true,failureMessage(a));
  assert.equal(b.ok,true,failureMessage(b));
  assert.deepEqual(
    a.replay.actions.map(action=>[action.type,action.summaryBefore,action.summaryAfter]),
    b.replay.actions.map(action=>[action.type,action.summaryBefore,action.summaryAfter]),
  );
  assert.equal(a.finalState.phase,'match-end');
});

test('recorded action stream replays to the same final summary',()=>{
  const result=runDeterministicMatch({seed:99,stepLimit:10000,checkpointEvery:20});
  assert.equal(result.ok,true,failureMessage(result));
  const replayed=replayDeterministicMatch(result.replay);
  assert.equal(replayed.ok,true,JSON.stringify(replayed,null,2));
  assert.equal(replayed.finalSummary,result.replay.actions.at(-1).summaryAfter);
});

test('failure replay reproduces the recorded failure boundary',()=>{
  const result=runDeterministicMatch({seed:17,stepLimit:1,checkpointEvery:0});
  assert.equal(result.ok,false);
  assert.equal(result.replay.failure?.code,'STEP_LIMIT');
  const replayed=replayDeterministicMatch(result.replay);
  assert.equal(replayed.ok,true,JSON.stringify(replayed,null,2));
  assert.equal(replayed.reproducedFailure,true);
  assert.equal(replayed.failureCode,'STEP_LIMIT');
  assert.equal(replayed.step,1);
});

test('batch runner completes ten deterministic matches',()=>{
  const result=runSimulationBatch({matches:10,baseSeed:1000,stepLimit:10000});
  assert.equal(result.ok,true,failureMessage(result?.result||result));
  assert.equal(result.matches,10);
  assert.ok(result.steps>0);
});

test('mixed-policy matches accept and record exact per-seat assignments',()=>{
  const mixed=['strategic','baseline','strategic','baseline'];
  const swapped=['baseline','strategic','baseline','strategic'];
  const a=runDeterministicMatch({seed:311,stepLimit:10000,checkpointEvery:0,botPolicies:mixed});
  const b=runDeterministicMatch({seed:311,stepLimit:10000,checkpointEvery:0,botPolicies:swapped});
  assert.equal(a.ok,true,failureMessage(a));
  assert.equal(b.ok,true,failureMessage(b));
  assert.deepEqual(a.metadata?.botPolicies,mixed);
  assert.deepEqual(b.metadata?.botPolicies,swapped);
  assert.deepEqual(a.replay.config?.botPolicies,mixed);
  assert.deepEqual(b.replay.config?.botPolicies,swapped);
  assert.throws(
    ()=>runDeterministicMatch({seed:1,botPolicies:['strategic','baseline']}),
    /botPolicies.*four|four.*botPolicies/i,
  );
});

test('simulation CLI parses deterministic batch options',()=>{
  assert.deepEqual(
    parseSimulationArgs(['--matches','250','--seed','500','--out','tmp/replays','--quiet']),
    {matches:250,baseSeed:500,stepLimit:10000,outDir:'tmp/replays',quiet:true},
  );
});
