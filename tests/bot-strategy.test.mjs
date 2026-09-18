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

test('policy constants expose baseline and strategic while default is strategic after rollout acceptance',()=>{
  assert.equal(BOT_POLICY_BASELINE,'baseline');
  assert.equal(BOT_POLICY_STRATEGIC,'strategic');
  assert.equal(DEFAULT_BOT_POLICY,'strategic');
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
  const hand=[
    card('jade',10),card('sword',11),card('pagoda',12),card('star',13),card('jade',14),
    card('sword',2),card('pagoda',3),card('star',4),card('jade',5),card('sword',6),
    card('pagoda',7),card('star',8),card('jade',9),special('mahjong',1),
  ];
  const view=viewWithHand(hand);
  assert.equal(decideTichu(view,BOT_POLICY_BASELINE),true);
});

test('BotView carries only own/private-known and public information',()=>{
  const state=baseState();
  const legal=possibleSelections(state.hands[1],state.lastPlay,state.wish);
  const view=buildBotView(state,1,{legalPlays:legal});
  assert.deepEqual(view.hand.map(c=>c.id),state.hands[1].map(c=>c.id));
  assert.deepEqual(view.handCounts,state.hands.map(h=>h.length));
  assert.deepEqual(view.exchangeKnown.sent.sort(),['dragon','jade-6','sword-10'].sort());
  assert.deepEqual(view.discarded,[]);
  assert.equal(view.legalPlays,legal);
  assert.equal('hands' in view,false);
  assert.equal('captured' in view,false);
  assert.equal('received' in view.exchangeKnown,false);
});

test('BotView hands the rules engine legal-play array through read-only by identity',()=>{
  const state=baseState();
  const legal=possibleSelections(state.hands[1],state.lastPlay,state.wish);
  const view=buildBotView(state,1,{legalPlays:legal});
  assert.equal(view.legalPlays,legal);
  const before=JSON.stringify(legal);
  choosePlay(view,BOT_POLICY_BASELINE);
  assert.equal(JSON.stringify(legal),before);
});

test('TichuGame defaults bots to baseline policy before rollout override',()=>{
  const game=new TichuGame({autoSchedule:false});
  assert.equal(game.botPolicy(1),DEFAULT_BOT_POLICY);
});

test('per-seat bot policies are normalized without changing baseline fallback',()=>{
  const game=new TichuGame({autoSchedule:false,botPolicies:{1:BOT_POLICY_STRATEGIC,2:'unknown'}});
  assert.equal(game.botPolicy(1),BOT_POLICY_STRATEGIC);
  assert.equal(game.botPolicy(2),BOT_POLICY_BASELINE);
  assert.equal(game.botPolicy(3),DEFAULT_BOT_POLICY);
});

test('strategic hand analysis rewards coherent control and structure',()=>{
  const coherent=[
    card('jade',7),card('sword',7),card('jade',8),card('sword',8),card('jade',9),card('sword',9),
    card('jade',10),card('sword',10),card('jade',11),card('sword',11),card('jade',12),card('sword',12),
    special('dragon',15),special('phoenix'),
  ];
  const scattered=[
    card('jade',2),card('sword',3),card('pagoda',4),card('star',6),card('jade',8),card('sword',10),
    card('pagoda',11),card('star',12),card('jade',13),card('sword',14),card('pagoda',5),card('star',7),
    card('jade',9),special('dog',0),
  ];
  const a=analyzeHand(coherent);
  const b=analyzeHand(scattered);
  assert.ok(a.estimatedExits<b.estimatedExits);
  assert.ok(a.structureScore>b.structureScore);
  assert.ok(a.controlScore>b.controlScore);
});

test('strategic Grand rejects disconnected face cards and calls with elite eight-card structure',()=>{
  const weak=[
    card('jade',12),card('sword',12),card('pagoda',13),card('star',14),
    card('jade',2),card('sword',4),card('pagoda',6),card('star',8),
  ];
  const elite=[
    card('jade',10),card('sword',10),card('jade',11),card('sword',11),
    card('jade',12),card('sword',12),special('dragon',15),special('phoenix'),
  ];
  assert.equal(decideGrand(viewWithHand(weak,{phase:'grand'}),BOT_POLICY_STRATEGIC),false);
  assert.equal(decideGrand(viewWithHand(elite,{phase:'grand'}),BOT_POLICY_STRATEGIC),true);
});

test('strategic Tichu uses a lower threshold than Grand',()=>{
  const hand=[
    card('jade',8),card('sword',8),card('jade',9),card('sword',9),card('jade',10),card('sword',10),
    card('jade',11),card('sword',11),card('jade',12),card('sword',12),card('jade',13),card('sword',13),
    special('dragon',15),card('star',2),
  ];
  const firstEight=hand.slice(0,8);
  assert.equal(decideGrand(viewWithHand(firstEight,{phase:'grand'}),BOT_POLICY_STRATEGIC),false);
  assert.equal(decideTichu(viewWithHand(hand,{phase:'play'}),BOT_POLICY_STRATEGIC),true);
});

test('strategic declaration scoring is deterministic and score context is bounded',()=>{
  const hand=[
    card('jade',9),card('sword',9),card('jade',10),card('sword',10),card('jade',11),card('sword',11),
    card('jade',12),card('sword',12),card('jade',13),card('sword',13),special('dragon',15),
    card('star',3),card('pagoda',5),card('star',7),
  ];
  const even=decideTichu(viewWithHand(hand,{scores:[0,0]}),BOT_POLICY_STRATEGIC);
  const behind=decideTichu(viewWithHand(hand,{scores:[0,600]}),BOT_POLICY_STRATEGIC);
  const ahead=decideTichu(viewWithHand(hand,{scores:[600,0]}),BOT_POLICY_STRATEGIC);
  assert.equal(even,decideTichu(viewWithHand(hand,{scores:[0,0]}),BOT_POLICY_STRATEGIC));
  assert.ok(Number(behind)>=Number(even));
  assert.ok(Number(even)>=Number(ahead));
});

test('strategic analyzer stays well below the 250 ms per-decision guardrail',()=>{
  const hand=[
    card('jade',2),card('sword',2),card('pagoda',2),card('jade',3),card('sword',3),card('pagoda',3),
    card('jade',4),card('sword',4),card('jade',5),card('sword',5),card('jade',6),card('sword',6),
    special('dragon',15),special('phoenix'),
  ];
  const started=performance.now();
  for(let i=0;i<100;i++)analyzeHand(hand);
  const elapsed=performance.now()-started;
  assert.ok(elapsed/100<250,`analyzeHand averaged ${elapsed/100} ms`);
});
