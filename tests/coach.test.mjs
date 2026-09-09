import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck, classify } from '../src/rules.js';
import { buildCoachModel, specialCardHelp } from '../src/coach.js';

const deck=makeDeck(),by=id=>deck.find(c=>c.id===id),r=(suit,n)=>by(`${suit}-${n}`);
const baseUi={coachEnabled:true,exchangeTarget:1,hintCardIds:new Set()};
function state(overrides={}){return {phase:'play',round:1,currentPlayer:0,hands:[[],[],[],[]],selected:new Set(),lastPlay:null,wish:null,declarations:['none','none','none','none'],names:['Ty','Mei','Wei','Lin'],...overrides}}

test('Coach explains an opening lead and returns legal cards without hidden-hand leakage',()=>{
  const s=state({hands:[[r('jade',3),r('sword',3),r('star',8),by('dog')],[r('jade',14),r('sword',14)],[by('dragon')],[by('phoenix')]]});
  const model=buildCoachModel(s,{...baseUi});
  assert.match(model.goal,/lew|kart/i);assert.match(model.action,/zagraj|wybierz/i);assert.match(model.reason,/typ|tempo|kontrol/i);
  assert.ok(model.legalCardIds.has('jade-3'));assert.ok(model.optionCount>0);
  const combined=`${model.goal} ${model.action} ${model.reason} ${model.selectedLabel||''}`;assert.doesNotMatch(combined,/\bAs\b|Smok|Feniks/i);
});

test('Coach explains how to answer a pair and validates a selected higher pair',()=>{
  const previous=classify([r('jade',7),r('sword',7)]);
  const s=state({hands:[[r('jade',9),r('sword',9),r('star',4)],[],[],[]],lastPlay:previous,selected:new Set(['jade-9','sword-9'])});
  const model=buildCoachModel(s,{...baseUi});
  assert.match(model.action,/wyższą parę|bomb/i);assert.match(model.reason,/lew|prowad/i);assert.equal(model.selectedValid,true);assert.match(model.selectedLabel,/para/i);
});

test('Coach explains that an active wish must be fulfilled when possible',()=>{
  const previous=classify([r('jade',6),r('sword',6)]);
  const s=state({hands:[[r('jade',7),r('sword',7),r('jade',8),r('sword',8)],[],[],[]],lastPlay:previous,wish:8});
  const model=buildCoachModel(s,{...baseUi});
  assert.match(model.goal,/8/);assert.match(model.action,/musisz/i);assert.match(model.reason,/życzenie/i);assert.deepEqual([...model.legalCardIds].sort(),['jade-8','sword-8']);
});

test('Coach explains the current exchange recipient',()=>{
  const s=state({phase:'exchange',hands:[[r('jade',2)],[],[],[]]});
  const model=buildCoachModel(s,{...baseUi,exchangeTarget:2});
  assert.match(model.action,/Wei/);assert.match(model.reason,/partner|drużyn/i);assert.ok(model.legalCardIds.has('jade-2'));
});

test('Coach explains why an opponent receives a different kind of exchange card',()=>{
  const s=state({phase:'exchange',hands:[[r('jade',2)],[],[],[]]});
  const model=buildCoachModel(s,{...baseUi,exchangeTarget:1});
  assert.match(model.goal,/wymian|ręk/i);assert.match(model.action,/Mei/);assert.match(model.reason,/rywal|przydat/i);
});

test('Coach explains the waiting step after the player locks the exchange',()=>{
  const s=state({phase:'exchange',exchangeDone:[true,false,false,false],hands:[[r('jade',2)],[],[],[]]});
  const model=buildCoachModel(s,{...baseUi,exchangeTarget:1});
  assert.match(model.goal,/rozpoc|wymian/i);assert.match(model.action,/poczekaj/i);assert.match(model.reason,/każd|wszyscy/i);
});

test('every active tutorial state states a goal, an action and a reason',()=>{
  const states=[
    state({phase:'grand',hands:[[r('jade',2)],[],[],[]]}),
    state({phase:'play',hands:[[r('jade',2)],[],[],[]]}),
    state({phase:'play',currentPlayer:1,hands:[[r('jade',2)],[],[],[]]}),
    state({phase:'round-end'}),
  ];
  for(const current of states){
    const model=buildCoachModel(current,{...baseUi});
    for(const field of ['goal','action','reason'])assert.ok(model[field]?.trim(),`${current.phase} needs ${field}`);
  }
});

test('Coach can be switched off cleanly',()=>{assert.equal(buildCoachModel(state(),{...baseUi,coachEnabled:false}),null)});

test('special card help is concise and unique for all four specials',()=>{
  for(const id of ['mahjong','dog','phoenix','dragon']){const help=specialCardHelp(by(id));assert.ok(help.title.length>0);assert.ok(help.body.length>20)}
  assert.match(specialCardHelp(by('dog')).body,/partner/i);assert.match(specialCardHelp(by('phoenix')).body,/-25|joker/i);assert.match(specialCardHelp(by('dragon')).body,/rywali/i);
});
