import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_POLICY_STRATEGIC,
  analyzeHand,
  chooseDragonRecipient,
  chooseExchange,
  chooseWish,
} from '../src/bot-strategy.js';

const card=(suit,rank)=>({id:`${suit}-${rank}`,suit,rank,special:null});
const special=(name,rank=null)=>({id:name,suit:null,rank,special:name});

function view(hand,{seat=0,declarations=['none','none','none','none'],handCounts=[14,14,14,14],scores=[0,0],sent=[]}={}){
  return{
    seat,
    partner:(seat+2)%4,
    phase:'exchange',
    round:1,
    hand:structuredClone(hand),
    handCounts:[...handCounts],
    table:[],
    lastPlay:null,
    legalPlays:[],
    declarations:[...declarations],
    scores:[...scores],
    roundScore:[0,0],
    finished:[],
    wish:null,
    discarded:[],
    currentPlayer:seat,
    trickLeader:seat,
    exchangeKnown:{sent:[...sent]},
  };
}

function selectedIds(map){return new Set(Object.values(map));}

test('strategic exchange does not break a four-of-a-kind bomb when junk is available',()=>{
  const bomb=[card('jade',9),card('sword',9),card('pagoda',9),card('star',9)];
  const hand=[...bomb,card('jade',2),card('sword',3),card('pagoda',4),card('star',6),card('jade',8),card('sword',10),card('pagoda',11),card('star',12),special('dragon',15),special('phoenix')];
  const map=chooseExchange(view(hand),BOT_POLICY_STRATEGIC);
  const selected=selectedIds(map);
  assert.equal(Object.keys(map).length,3);
  assert.equal(selected.size,3);
  assert.ok(bomb.every(c=>!selected.has(c.id)));
});

test('strategic exchange preserves a long pair sequence when alternatives exist',()=>{
  const steps=[
    card('jade',10),card('sword',10),
    card('jade',11),card('sword',11),
    card('jade',12),card('sword',12),
    card('jade',13),card('sword',13),
  ];
  const hand=[...steps,card('pagoda',2),card('star',3),card('pagoda',5),card('star',7),special('dragon',15),special('dog',0)];
  const before=analyzeHand(hand);
  const map=chooseExchange(view(hand),BOT_POLICY_STRATEGIC);
  const selected=selectedIds(map);
  assert.ok(steps.every(c=>!selected.has(c.id)));
  const remaining=hand.filter(c=>!selected.has(c.id));
  assert.ok(analyzeHand(remaining).longestPairRun>=before.longestPairRun);
});

test('strategic exchange sends control to a partner who declared Tichu',()=>{
  const hand=[
    special('dragon',15),card('jade',14),card('sword',8),card('pagoda',7),card('star',6),
    card('jade',5),card('sword',4),card('pagoda',3),card('star',2),
  ];
  const declarations=['none','none','tichu','none'];
  const map=chooseExchange(view(hand,{declarations}),BOT_POLICY_STRATEGIC);
  assert.equal(map[2],'dragon');
});

test('strategic exchange returns three unique owned cards with stable output',()=>{
  const hand=[special('dragon',15),special('phoenix'),special('dog',0),special('mahjong',1),card('jade',14),card('sword',13),card('pagoda',8),card('star',7)];
  const first=chooseExchange(view(hand),BOT_POLICY_STRATEGIC);
  const second=chooseExchange(view(structuredClone(hand)),BOT_POLICY_STRATEGIC);
  assert.deepEqual(first,second);
  const ids=Object.values(first);
  assert.equal(ids.length,3);
  assert.equal(new Set(ids).size,3);
  assert.ok(ids.every(id=>hand.some(c=>c.id===id)));
});

test('strategic wish prefers a known sent rank that the bot no longer holds',()=>{
  const hand=[special('mahjong',1),card('jade',3),card('sword',5),card('pagoda',9),card('star',12)];
  const botView=view(hand,{sent:['jade-7','sword-2','pagoda-4']});
  botView.phase='play';
  assert.equal(chooseWish(botView,[special('mahjong',1)],BOT_POLICY_STRATEGIC),7);
});

test('strategic wish avoids a rank concentrated in its own remaining hand',()=>{
  const hand=[special('mahjong',1),card('jade',8),card('sword',8),card('pagoda',8),card('star',6),card('jade',11)];
  const botView=view(hand,{sent:['jade-7']});
  botView.phase='play';
  const wish=chooseWish(botView,[special('mahjong',1)],BOT_POLICY_STRATEGIC);
  assert.notEqual(wish,8);
  assert.equal(wish,7);
});

test('strategic Dragon recipient prefers the opponent with more cards remaining',()=>{
  const botView=view([special('dragon',15)],{seat:0,handCounts:[5,2,6,9]});
  botView.phase='play';
  assert.equal(chooseDragonRecipient(botView,BOT_POLICY_STRATEGIC),3);
});

test('strategic Dragon recipient avoids an opponent with active Tichu when the alternative is reasonable',()=>{
  const botView=view([special('dragon',15)],{
    seat:0,
    handCounts:[5,8,6,7],
    declarations:['none','tichu','none','none'],
  });
  botView.phase='play';
  assert.equal(chooseDragonRecipient(botView,BOT_POLICY_STRATEGIC),3);
});