import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_POLICY_STRATEGIC,
  buildBotView,
  choosePlay,
  decideTichu,
} from '../src/bot-strategy.js';

const card=(suit,rank)=>({id:`${suit}-${rank}`,suit,rank,special:null});
const special=(name,rank=null)=>({id:name,suit:null,rank,special:name});

function option(cards,type='single',value=null){
  return{
    cards,
    play:{type,length:cards.length,value:value??(cards[0]?.rank??0),cards,phoenixAs:null},
    fulfills:false,
  };
}

function tableEntry(seat,cards,type='single',value=null){
  return{seat,cards,play:{type,length:cards.length,value:value??(cards[0]?.rank??0),cards,phoenixAs:null}};
}

function playView({
  hand,
  legalPlays,
  handCounts,
  declarations=['none','none','none','none'],
}){
  const lead=card('jade',10);
  const table=[tableEntry(2,[lead])];
  return{
    seat:0,
    partner:2,
    phase:'play',
    round:1,
    hand:structuredClone(hand),
    handCounts:[...handCounts],
    table,
    lastPlay:table[0].play,
    legalPlays,
    declarations:[...declarations],
    scores:[0,0],
    roundScore:[0,0],
    finished:[],
    wish:null,
    discarded:[],
    currentPlayer:0,
    trickLeader:2,
    exchangeKnown:{sent:[]},
  };
}

test('strategic Tichu rejects a merely decent hand that the first acceptance build overcalled',()=>{
  const hand=[
    special('dragon',15),special('phoenix'),
    card('jade',14),card('sword',13),card('pagoda',12),
    card('jade',5),card('sword',6),card('pagoda',7),card('star',8),
    card('jade',9),card('sword',9),card('pagoda',10),
    card('jade',2),card('sword',3),
  ];
  const state={
    phase:'play',round:1,currentPlayer:0,trickLeader:0,
    hands:[hand,Array(14),Array(14),Array(14)],
    table:[],lastPlay:null,passSelections:{},declarations:['none','none','none','none'],
    scores:[0,0],roundScore:[0,0],finished:[],wish:null,discarded:[],
  };
  const view=buildBotView(state,0,{legalPlays:[]});
  assert.equal(decideTichu(view,BOT_POLICY_STRATEGIC),false);
});

test('strategic bot does not pass behind partner when a legal play empties its hand',()=>{
  const jack=card('sword',11);
  const view=playView({
    hand:[jack],
    legalPlays:[option([jack])],
    handCounts:[1,6,4,7],
  });
  assert.deepEqual(choosePlay(view,BOT_POLICY_STRATEGIC),{type:'play',ids:['sword-11'],wishRank:null});
});

test('strategic bot with its own Tichu declaration does not automatically surrender initiative to partner',()=>{
  const jack=card('sword',11);
  const low=card('pagoda',2);
  const view=playView({
    hand:[jack,low],
    legalPlays:[option([jack])],
    handCounts:[2,6,4,7],
    declarations:['tichu','none','none','none'],
  });
  assert.deepEqual(choosePlay(view,BOT_POLICY_STRATEGIC),{type:'play',ids:['sword-11'],wishRank:null});
});

test('distant opponent Tichu declaration alone does not force overtaking a safely winning partner',()=>{
  const jack=card('sword',11);
  const queen=card('pagoda',12);
  const view=playView({
    hand:[jack,queen],
    legalPlays:[option([jack]),option([queen])],
    handCounts:[2,8,4,7],
    declarations:['none','tichu','none','none'],
  });
  assert.deepEqual(choosePlay(view,BOT_POLICY_STRATEGIC),{type:'pass'});
});
