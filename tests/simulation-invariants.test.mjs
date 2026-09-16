import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck } from '../src/rules.js';
import { TichuGame } from '../src/game.js';
import { createSeededRng } from '../src/simulation/rng.js';
import { SimulationInvariantError,assertSimulationInvariants } from '../src/simulation/invariants.js';

const deckIds=makeDeck().map(card=>card.id);
const gameAtGrand=()=>{
  const game=new TichuGame({rng:createSeededRng(21),autoSchedule:false});
  game.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  return game;
};

test('freshly dealt state satisfies invariants',()=>{
  const game=gameAtGrand();
  assert.equal(assertSimulationInvariants(game.state,{expectedDeckIds:deckIds}),true);
});

test('duplicate live card is CARD_CONSERVATION',()=>{
  const game=gameAtGrand();
  game.state.hands[1].push(game.state.hands[0][0]);
  assert.throws(
    ()=>assertSimulationInvariants(game.state,{expectedDeckIds:deckIds}),
    error=>error instanceof SimulationInvariantError&&error.code==='CARD_CONSERVATION',
  );
});

test('finished current player is TURN_COHERENCE',()=>{
  const game=gameAtGrand();
  for(let seat=0;seat<4;seat++)game.declareGrand(seat,false);
  for(let seat=0;seat<4;seat++)game.botExchange(seat);
  game.state.finished=[game.state.currentPlayer];
  assert.throws(
    ()=>assertSimulationInvariants(game.state,{expectedDeckIds:deckIds}),
    error=>error.code==='TURN_COHERENCE',
  );
});

test('duplicate finisher is FINISH_COHERENCE',()=>{
  const game=gameAtGrand();
  game.state.finished=[1,1];
  assert.throws(
    ()=>assertSimulationInvariants(game.state,{expectedDeckIds:deckIds}),
    error=>error.code==='FINISH_COHERENCE',
  );
});

test('final exchange transition requires four 14-card hands',()=>{
  const game=gameAtGrand();
  for(let seat=0;seat<4;seat++)game.declareGrand(seat,false);
  for(let seat=0;seat<3;seat++)game.botExchange(seat);
  const previous=structuredClone({...game.state,selected:[...game.state.selected]});
  const map=game.botExchangeMap(3);
  game.submitExchange(3,map);
  assert.equal(game.state.phase,'play');
  assert.equal(assertSimulationInvariants(game.state,{
    expectedDeckIds:deckIds,
    previousState:previous,
    lastAction:{type:'submitExchange',seat:3,payload:{map}},
  }),true);
});
