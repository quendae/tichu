import test from 'node:test';
import assert from 'node:assert/strict';
import { runDeterministicMatch,runSimulationBatch,replayDeterministicMatch } from '../src/simulation/driver.js';

test('same seed produces identical action summaries',()=>{
  const a=runDeterministicMatch({seed:738,stepLimit:10000,checkpointEvery:25});
  const b=runDeterministicMatch({seed:738,stepLimit:10000,checkpointEvery:25});
  assert.equal(a.ok,true);
  assert.equal(b.ok,true);
  assert.deepEqual(
    a.replay.actions.map(action=>[action.type,action.summaryBefore,action.summaryAfter]),
    b.replay.actions.map(action=>[action.type,action.summaryBefore,action.summaryAfter]),
  );
  assert.equal(a.finalState.phase,'match-end');
});

test('recorded action stream replays to the same final summary',()=>{
  const result=runDeterministicMatch({seed:99,stepLimit:10000,checkpointEvery:20});
  assert.equal(result.ok,true);
  const replayed=replayDeterministicMatch(result.replay);
  assert.equal(replayed.ok,true);
  assert.equal(replayed.finalSummary,result.replay.actions.at(-1).summaryAfter);
});

test('batch runner completes ten deterministic matches',()=>{
  const result=runSimulationBatch({matches:10,baseSeed:1000,stepLimit:10000});
  assert.equal(result.ok,true);
  assert.equal(result.matches,10);
  assert.ok(result.steps>0);
});
