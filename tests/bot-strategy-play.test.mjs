import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_POLICY_BASELINE,
  BOT_POLICY_STRATEGIC,
  choosePlay,
} from '../src/bot-strategy.js';

const card=(suit,rank)=>({id:`${suit}-${rank}`,suit,rank,special:null});
const special=(name,rank=null)=>({id:name,suit:null,rank,special:name});

function option(cards,type='single',value=null){
  return{
    cards,
    play:{
      type,
      length:cards.length,
      value:value??(cards[0]?.rank??0),
      cards,
      phoenixAs:null,
    },
    fulfills:false,
  };
}

function view({
  seat=0,
  hand=[],
  legalPlays=[],
  table=[],
  lastPlay=null,
  handCounts=[5,5,5,5],
  declarations=['none','none','none','none'],
  currentPlayer=seat,
  finished=[],
}={}){
  return{
    seat,
    partner:(seat+2)%4,
    phase:'play',
    round:1,
    hand:structuredClone(hand),
    handCounts:[...handCounts],
    table:structuredClone(table),
    lastPlay:structuredClone(lastPlay),
    legalPlays,
    declarations:[...declarations],
    scores:[0,0],
    roundScore:[0,0],
    finished:[...finished],
    wish:null,
    discarded:[],
    currentPlayer,
    trickLeader:table[0]?.seat??seat,
    exchangeKnown:{sent:[]},
  };
}

function tableEntry(seat,cards,type='single',value=null){
  return{seat,cards,play:{type,length:cards.length,value:value??(cards[0]?.rank??0),cards,phoenixAs:null}};
}

test('strategic policy passes instead of overtaking a safely winning partner',()=>{
  const lead=card('jade',10);
  const jack=card('sword',11);
  const queen=card('pagoda',12);
  const botView=view({
    hand:[jack,queen],
    table:[tableEntry(2,[lead])],
    lastPlay:tableEntry(2,[lead]).play,
    legalPlays:[option([jack]),option([queen])],
    handCounts:[2,6,4,7],
  });
  assert.deepEqual(choosePlay(botView,BOT_POLICY_STRATEGIC),{type:'pass'});
  assert.notDeepEqual(choosePlay(botView,BOT_POLICY_BASELINE),{type:'pass'});
});

test('strategic policy spends Dragon to stop a one-card opponent with active Tichu',()=>{
  const lead=card('jade',10);
  const jack=card('sword',11);
  const ace=card('pagoda',14);
  const dragon=special('dragon',15);
  const botView=view({
    hand:[jack,ace,dragon],
    table:[tableEntry(1,[lead])],
    lastPlay:tableEntry(1,[lead]).play,
    legalPlays:[option([jack]),option([ace]),option([dragon],'single',15)],
    handCounts:[3,1,6,7],
    declarations:['none','tichu','none','none'],
  });
  assert.deepEqual(choosePlay(botView,BOT_POLICY_STRATEGIC),{type:'play',ids:['dragon'],wishRank:null});
});

test('strategic policy preserves Dragon when a cheap response is enough',()=>{
  const lead=card('jade',5);
  const six=card('sword',6);
  const dragon=special('dragon',15);
  const botView=view({
    hand:[six,dragon],
    table:[tableEntry(1,[lead])],
    lastPlay:tableEntry(1,[lead]).play,
    legalPlays:[option([six]),option([dragon],'single',15)],
    handCounts:[2,7,6,8],
  });
  assert.deepEqual(choosePlay(botView,BOT_POLICY_STRATEGIC),{type:'play',ids:['sword-6'],wishRank:null});
});

test('strategic policy plays a bomb when it empties the hand',()=>{
  const bomb=[card('jade',9),card('sword',9),card('pagoda',9),card('star',9)];
  const botView=view({hand:bomb,legalPlays:[option(bomb,'bomb',9)]});
  assert.deepEqual(choosePlay(botView,BOT_POLICY_STRATEGIC),{
    type:'play',
    ids:['jade-9','sword-9','pagoda-9','star-9'],
    wishRank:null,
  });
});

test('strategic policy spends its only legal bomb to stop a one-card opponent with active Tichu',()=>{
  const lead=card('jade',14);
  const bomb=[card('jade',9),card('sword',9),card('pagoda',9),card('star',9)];
  const botView=view({
    hand:[...bomb,card('jade',3)],
    table:[tableEntry(1,[lead])],
    lastPlay:tableEntry(1,[lead]).play,
    legalPlays:[option(bomb,'bomb',9)],
    handCounts:[5,1,6,7],
    declarations:['none','tichu','none','none'],
  });
  assert.deepEqual(choosePlay(botView,BOT_POLICY_STRATEGIC),{
    type:'play',
    ids:['jade-9','sword-9','pagoda-9','star-9'],
    wishRank:null,
  });
});

test('strategic policy preserves a bomb when there is no urgent reason to spend it',()=>{
  const lead=card('jade',5);
  const eight=card('jade',8);
  const bomb=[card('jade',9),card('sword',9),card('pagoda',9),card('star',9)];
  const botView=view({
    hand:[eight,...bomb],
    table:[tableEntry(1,[lead])],
    lastPlay:tableEntry(1,[lead]).play,
    legalPlays:[option(bomb,'bomb',9),option([eight])],
    handCounts:[5,6,7,8],
  });
  assert.deepEqual(choosePlay(botView,BOT_POLICY_STRATEGIC),{type:'play',ids:['jade-8'],wishRank:null});
});

test('strategic opening lead prefers efficient multi-card shedding',()=>{
  const threeA=card('jade',3);
  const threeB=card('sword',3);
  const ace=card('pagoda',14);
  const botView=view({
    hand:[threeA,threeB,ace],
    legalPlays:[option([threeA]),option([ace]),option([threeA,threeB],'pair',3)],
  });
  assert.deepEqual(choosePlay(botView,BOT_POLICY_STRATEGIC),{
    type:'play',
    ids:['jade-3','sword-3'],
    wishRank:null,
  });
});

test('strategic scheduled-turn policy never returns an out-of-turn interrupt play',()=>{
  const six=card('jade',6);
  const botView=view({hand:[six],legalPlays:[option([six])],currentPlayer:1});
  assert.deepEqual(choosePlay(botView,BOT_POLICY_STRATEGIC),{type:'pass'});
});
