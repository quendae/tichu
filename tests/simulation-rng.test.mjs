import test from 'node:test';
import assert from 'node:assert/strict';
import { TichuGame } from '../src/game.js';
import { createSeededRng } from '../src/simulation/rng.js';

const handIds=game=>game.state.hands.map(hand=>hand.map(card=>card.id));

test('seeded RNG repeats the same stream',()=>{
  const a=createSeededRng(738);
  const b=createSeededRng(738);
  assert.deepEqual(
    Array.from({length:8},()=>a()),
    Array.from({length:8},()=>b()),
  );
});

test('same seed produces the same first deal without timers',()=>{
  const a=new TichuGame({rng:createSeededRng(738),autoSchedule:false});
  const b=new TichuGame({rng:createSeededRng(738),autoSchedule:false});
  a.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  b.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  assert.deepEqual(handIds(a),handIds(b));
  assert.deepEqual(a.state.remainingDeck.map(card=>card.id),b.state.remainingDeck.map(card=>card.id));
  assert.equal(a.botTimer,null);
  assert.equal(b.botTimer,null);
});

test('different seeds produce different deals',()=>{
  const a=new TichuGame({rng:createSeededRng(1),autoSchedule:false});
  const b=new TichuGame({rng:createSeededRng(2),autoSchedule:false});
  a.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  b.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  assert.notDeepEqual(handIds(a),handIds(b));
});
