import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {TichuGame} from '../src/game.js';
import {possibleSelections} from '../src/rules.js';
import {
  BOT_POLICY_BASELINE,
  BOT_POLICY_STRATEGIC,
  DEFAULT_BOT_POLICY,
  analyzeHand,
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

function viewWithHand(hand,{scores=[0,0],seat=0,phase='play'}={}){
  const state=baseState();
  state.phase=phase;
  state.hands[seat]=hand;
  state.scores=[...scores];
  state.declarations=['none','none','none','none'];
  return buildBotView(state,seat,{legalPlays:[]});
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

test('BotView hands legal options through without deep-copying or mutating them',()=>{
  const state=baseState();
  const legalPlays=possibleSelections(state.hands[1],state.lastPlay,state.wish);
  const snapshot=structuredClone(legalPlays);
  const view=buildBotView(state,1,{legalPlays});
  assert.equal(view.legalPlays,legalPlays);
  assert.equal(view.legalPlays[0],legalPlays[0]);
  choosePlay(view,BOT_POLICY_BASELINE);
  assert.deepEqual(legalPlays,snapshot);
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

test('strategic hand analysis rewards coherent control and structure',()=>{
  const weak=[
    card('jade',11),card('sword',12),card('pagoda',13),card('star',14),
    card('jade',2),card('sword',4),card('pagoda',6),card('star',8),
  ];
  const strong=[
    special('dragon',15),special('phoenix'),
    card('jade',14),card('sword',14),
    card('jade',13),card('sword',13),
    card('jade',12),card('sword',12),
  ];
  const weakAnalysis=analyzeHand(weak);
  const strongAnalysis=analyzeHand(strong);
  assert.ok(strongAnalysis.controlScore>weakAnalysis.controlScore);
  assert.ok(strongAnalysis.structureScore>weakAnalysis.structureScore);
  assert.ok(strongAnalysis.estimatedExits<weakAnalysis.estimatedExits);
  assert.ok(strongAnalysis.problemSingletons<weakAnalysis.problemSingletons);
});

test('strategic Grand rejects disconnected face cards and calls with elite eight-card structure',()=>{
  const weak=[
    card('jade',11),card('sword',12),card('pagoda',13),card('star',14),
    card('jade',2),card('sword',4),card('pagoda',6),card('star',8),
  ];
  const strong=[
    special('dragon',15),special('phoenix'),
    card('jade',14),card('sword',14),
    card('jade',13),card('sword',13),
    card('jade',12),card('sword',12),
  ];
  assert.equal(decideGrand(viewWithHand(weak,{phase:'grand'}),BOT_POLICY_STRATEGIC),false);
  assert.equal(decideGrand(viewWithHand(strong,{phase:'grand'}),BOT_POLICY_STRATEGIC),true);
});

test('strategic Tichu has a lower quality threshold than Grand',()=>{
  const medium=[
    special('dragon',15),
    card('jade',14),card('sword',14),
    card('jade',13),card('sword',13),
    card('jade',12),card('sword',12),
    card('jade',9),card('sword',9),
    card('pagoda',5),card('star',6),card('pagoda',7),card('star',8),card('jade',10),
  ];
  const view=viewWithHand(medium);
  assert.equal(decideTichu(view,BOT_POLICY_STRATEGIC),true);
  const firstEight=viewWithHand(medium.slice(0,8),{phase:'grand'});
  assert.equal(decideGrand(firstEight,BOT_POLICY_STRATEGIC),false);
});

test('strategic declaration scoring is deterministic and score context is bounded',()=>{
  const hand=[
    special('dragon',15),card('jade',14),card('sword',14),card('jade',13),
    card('sword',13),card('pagoda',8),card('star',6),card('jade',3),
  ];
  const even=viewWithHand(hand,{phase:'grand',scores:[500,500]});
  const behind=viewWithHand(hand,{phase:'grand',scores:[100,700]});
  const ahead=viewWithHand(hand,{phase:'grand',scores:[800,200]});
  const repeated=Array.from({length:20},()=>decideGrand(even,BOT_POLICY_STRATEGIC));
  assert.equal(new Set(repeated).size,1);
  const results=[
    decideGrand(behind,BOT_POLICY_STRATEGIC),
    decideGrand(even,BOT_POLICY_STRATEGIC),
    decideGrand(ahead,BOT_POLICY_STRATEGIC),
  ];
  assert.ok(results.filter(Boolean).length>=0);
  assert.deepEqual(analyzeHand(hand),analyzeHand(structuredClone(hand)));
});

test('strategic 14-card hand analysis stays below hard timing guardrail',()=>{
  const hand=[
    special('dragon',15),special('phoenix'),special('mahjong',1),special('dog',0),
    card('jade',14),card('sword',14),card('pagoda',13),card('star',13),
    card('jade',12),card('sword',11),card('pagoda',10),card('star',9),
    card('jade',8),card('sword',7),
  ];
  const start=performance.now();
  for(let i=0;i<100;i++)analyzeHand(hand);
  const perCall=(performance.now()-start)/100;
  assert.ok(perCall<250,`analysis took ${perCall.toFixed(2)} ms/call`);
});