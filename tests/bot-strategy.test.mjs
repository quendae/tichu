import test from 'node:test';
import assert from 'node:assert/strict';
import {TichuGame} from '../src/game.js';
import {possibleSelections} from '../src/rules.js';
import {
  BOT_POLICY_BASELINE,
  BOT_POLICY_STRATEGIC,
  DEFAULT_BOT_POLICY,
  buildBotView,
  decideGrand,
  decideTichu,
  chooseExchange,
  choosePlay,
} from '../src/bot-strategy.js';

const card=(suit,rank)=>({id:`${suit}-${rank}`,suit,rank,special:null});
const special=(name,rank=null)=>({id:name,suit:null,rank,special:name});

function baseState(){
  const game=new TichuGame({autoSchedule:false});
  const s=game.state;
  s.phase='play';
  s.round=1;
  s.currentPlayer=1;
  s.trickLeader=0;
  s.hands=[
    [card('jade',9),card('star',11)],
    [card('jade',6),card('sword',10),special('dragon',15)],
    [card('pagoda',4),card('star',8)],
    [card('sword',7),card('pagoda',13)],
  ];
  s.captured=[[],[],[],[]];
  s.discarded=[];
  s.finished=[];
  s.table=[{seat:0,cards:[card('jade',5)],play:{type:'single',length:1,value:5,cards:[card('jade',5)]}}];
  s.lastPlay=s.table[0].play;
  s.passes=0;
  s.wish=null;
  s.passSelections={
    0:{1:'jade-9',2:'star-11',3:'jade-5'},
    1:{0:'jade-6',2:'sword-10',3:'dragon'},
    2:{0:'pagoda-4',1:'star-8',3:'pagoda-13'},
    3:{0:'sword-7',1:'pagoda-13',2:'star-8'},
  };
  s.exchangeDone=[true,true,true,true];
  s.declarations=['none','none','none','none'];
  s.scores=[0,0];
  s.roundScore=[0,0];
  return s;
}

test('policy constants expose baseline and strategic while default stays baseline',()=>{
  assert.equal(BOT_POLICY_BASELINE,'baseline');
  assert.equal(BOT_POLICY_STRATEGIC,'strategic');
  assert.equal(DEFAULT_BOT_POLICY,'baseline');
});

test('baseline Grand keeps the legacy four-high-card threshold',()=>{
  const state=baseState();
  state.phase='grand';
  state.hands[1]=[
    card('jade',12),card('sword',12),card('pagoda',13),card('star',14),
    card('jade',2),card('sword',3),card('pagoda',4),card('star',5),
  ];
  const view=buildBotView(state,1,{legalPlays:[]});
  assert.equal(decideGrand(view,BOT_POLICY_BASELINE),true);
});

test('baseline Tichu keeps the legacy five-control-card threshold',()=>{
  const state=baseState();
  state.hands[1]=[
    special('dragon',15),special('phoenix'),card('jade',12),card('sword',13),card('pagoda',14),
    card('star',2),card('jade',3),card('sword',4),card('pagoda',5),card('star',6),
    card('jade',7),card('sword',8),card('pagoda',9),card('star',10),
  ];
  const view=buildBotView(state,1,{legalPlays:[]});
  assert.equal(decideTichu(view,BOT_POLICY_BASELINE),true);
});

test('BotView exposes own hand, public counts and own sent exchange only',()=>{
  const state=baseState();
  const legalPlays=possibleSelections(state.hands[1],state.lastPlay,state.wish);
  const view=buildBotView(state,1,{legalPlays});
  assert.deepEqual(view.hand,state.hands[1]);
  assert.deepEqual(view.handCounts,[2,3,2,2]);
  assert.deepEqual(new Set(view.exchangeKnown.sent),new Set(['jade-6','sword-10','dragon']));
  assert.equal('received' in view.exchangeKnown,false);
  assert.equal('hands' in view,false);
  const serialized=JSON.stringify(view);
  assert.equal(serialized.includes('jade-9'),false);
  assert.equal(serialized.includes('pagoda-4'),false);
  assert.equal(serialized.includes('sword-7'),false);
});

test('baseline exchange preserves the current client mapping',()=>{
  const state=baseState();
  state.phase='exchange';
  state.hands[1]=[
    special('dragon',15),card('star',14),card('jade',2),card('sword',3),
    special('mahjong',1),special('dog',0),special('phoenix'),
  ];
  state.passSelections={};
  const view=buildBotView(state,1,{legalPlays:[]});
  assert.deepEqual(chooseExchange(view,BOT_POLICY_BASELINE),{
    3:'dragon',
    0:'mahjong',
    2:'jade-2',
  });
});

test('baseline play keeps the cheapest legal non-bomb response',()=>{
  const state=baseState();
  const legalPlays=possibleSelections(state.hands[1],state.lastPlay,state.wish);
  const view=buildBotView(state,1,{legalPlays});
  assert.deepEqual(choosePlay(view,BOT_POLICY_BASELINE),{
    type:'play',
    ids:['jade-6'],
    wishRank:null,
  });
});
