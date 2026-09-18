import test from 'node:test';
import assert from 'node:assert/strict';
import { TichuGame } from '../src/game.js';
import { BOT_POLICY_STRATEGIC } from '../src/bot-strategy.js';
import { createSeededRng } from '../src/simulation/rng.js';

const waitFor = async (predicate, timeout = 200) => {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

test('local exchange continues through bot choices after the human confirms', async t => {
  const game = new TichuGame({ botDelay: 60_000 });
  t.after(() => clearTimeout(game.botTimer));
  game.resetMatch();
  clearTimeout(game.botTimer);

  for (let seat = 0; seat < 4; seat++) game.declareGrand(seat, false);
  clearTimeout(game.botTimer);
  game.botDelay = 0;

  const humanCards = game.state.hands[0].slice(0, 3);
  assert.equal(game.submitExchange(0, {
    1: humanCards[0].id,
    2: humanCards[1].id,
    3: humanCards[2].id,
  }), true);

  await waitFor(() => game.state.phase === 'play');
  assert.equal(game.state.phase, 'play');
  assert.deepEqual(game.state.exchangeDone, [true, true, true, true]);
});

test('bot exchange decision is pure and wrapper applies the same map',()=>{
  const game=new TichuGame({rng:createSeededRng(11),autoSchedule:false});
  game.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  for(let seat=0;seat<4;seat++)game.declareGrand(seat,false);
  const before=game.state.hands[0].map(card=>card.id);
  const map=game.botExchangeMap(0);
  assert.equal(new Set(Object.values(map)).size,3);
  assert.deepEqual(game.state.hands[0].map(card=>card.id),before);
  assert.equal(game.botExchange(0),true);
  assert.deepEqual(game.state.passSelections[0],map);
});

test('bot play decision is pure for the current player',()=>{
  const game=new TichuGame({rng:createSeededRng(12),autoSchedule:false});
  game.resetMatch({names:['A','B','C','D'],botSeats:[0,1,2,3]});
  for(let seat=0;seat<4;seat++)game.declareGrand(seat,false);
  for(let seat=0;seat<4;seat++)game.botExchange(seat);
  const seat=game.state.currentPlayer;
  const before=game.state.hands[seat].map(card=>card.id);
  const choice=game.botPlayChoice(seat);
  assert.ok(choice&&(choice.type==='pass'||choice.type==='play'));
  assert.deepEqual(game.state.hands[seat].map(card=>card.id),before);
});

test('bot turn resolves a Dragon trick with the winning bot strategic policy',()=>{
  const game=new TichuGame({autoSchedule:false,botPolicies:[BOT_POLICY_STRATEGIC]});
  const dragon={id:'dragon',suit:null,rank:15,special:'dragon'};
  game.configurePlayers(['A','B','C','D'],[0,3],[BOT_POLICY_STRATEGIC]);
  Object.assign(game.state,{
    phase:'play',
    currentPlayer:3,
    trickLeader:0,
    hands:[
      [{id:'jade-2',suit:'jade',rank:2,special:null}],
      [{id:'sword-3',suit:'sword',rank:3,special:null},{id:'sword-4',suit:'sword',rank:4,special:null}],
      Array.from({length:5},(_,index)=>({id:`pagoda-${index+2}`,suit:'pagoda',rank:index+2,special:null})),
      [
        {id:'jade-3',suit:'jade',rank:3,special:null},
        {id:'sword-4',suit:'sword',rank:4,special:null},
        {id:'pagoda-5',suit:'pagoda',rank:5,special:null},
        {id:'star-6',suit:'star',rank:6,special:null},
        {id:'jade-7',suit:'jade',rank:7,special:null},
        {id:'sword-8',suit:'sword',rank:8,special:null},
        {id:'pagoda-9',suit:'pagoda',rank:9,special:null},
        {id:'star-10',suit:'star',rank:10,special:null},
      ],
    ],
    captured:[[],[],[],[]],
    discarded:[],
    finished:[],
    table:[{seat:0,cards:[dragon],play:{type:'single',length:1,value:15,cards:[dragon],phoenixAs:null}}],
    lastPlay:{type:'single',length:1,value:15,cards:[dragon],phoenixAs:null},
    passes:2,
    declarations:['none','none','none','none'],
    wish:null,
    selected:new Set(),
    dragonRecipient:null,
    pendingRoundEnd:false,
    botSeats:[0,3],
  });

  assert.equal(game.botTurn(3),true);
  assert.equal(game.state.dragonRecipient,null);
  assert.equal(game.state.table.length,0);
  assert.deepEqual(game.state.captured[3].map(card=>card.id),['dragon']);
});
