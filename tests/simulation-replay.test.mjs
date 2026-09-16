import test from 'node:test';
import assert from 'node:assert/strict';
import { TichuGame } from '../src/game.js';
import { createSeededRng } from '../src/simulation/rng.js';
import {
  REPLAY_FORMAT,normalizeState,stateSummary,createReplay,
  recordReplayAction,recordReplayCheckpoint,validateReplayDocument,
} from '../src/simulation/replay.js';

const makeGame=()=>{
  const game=new TichuGame({rng:createSeededRng(7),autoSchedule:false});
  game.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  return game;
};

test('normalizeState converts Set and remains JSON-safe',()=>{
  const game=makeGame();
  const id=game.state.hands[0][0].id;
  game.state.selected.add(id);
  const normalized=normalizeState(game.state);
  assert.deepEqual(normalized.selected,[id]);
  assert.doesNotThrow(()=>JSON.stringify(normalized));
  assert.equal(normalized.hands.length,4);
});

test('stateSummary ignores log UUID and timestamp noise',()=>{
  const game=makeGame();
  const before=stateSummary(game.state);
  game.state.log.unshift({id:'noise',text:'diagnostic only',time:999999});
  assert.equal(stateSummary(game.state),before);
});

test('replay records summaries and checkpoints',()=>{
  const game=makeGame();
  const replay=createReplay({seed:7,engineVersion:'0.2.0',config:{targetScore:1000,stepLimit:10000},initialState:game.state});
  const before=normalizeState(game.state);
  game.declareGrand(0,false);
  recordReplayAction(replay,{step:1,round:1,seat:0,type:'declareGrand',payload:{yes:false},beforeState:before,afterState:game.state});
  recordReplayCheckpoint(replay,1,game.state);
  assert.equal(replay.format,REPLAY_FORMAT);
  assert.equal(replay.actions[0].summaryBefore.length,8);
  assert.equal(replay.actions[0].summaryAfter.length,8);
  assert.equal(replay.checkpoints[0].step,1);
  assert.equal(validateReplayDocument(replay),true);
});
