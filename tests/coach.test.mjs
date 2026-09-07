import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck, classify } from '../src/rules.js';
import { buildCoachModel, specialCardHelp } from '../src/coach.js';

const deck=makeDeck(), by=id=>deck.find(c=>c.id===id), r=(suit,n)=>by(`${suit}-${n}`);
const baseUi={coachEnabled:true,exchangeTarget:1,hintCardIds:new Set()};

function state(overrides={}){
  return {
    phase:'play',
    round:1,
    currentPlayer:0,
    hands:[[],[],[],[]],
    selected:new Set(),
    lastPlay:null,
    wish:null,
    declarations:['none','none','none','none'],
    names:['You','Mei','Wei','Lin'],
    ...overrides,
  };
}

test('Coach explains an opening lead and returns legal cards without hidden-hand leakage',()=>{
  const s=state({hands:[
    [r('jade',3),r('sword',3),r('star',8),by('dog')],
    [r('jade',14),r('sword',14)],
    [by('dragon')],
    [by('phoenix')],
  ]});
  const model=buildCoachModel(s,{...baseUi});
  assert.match(model.body,/lead|start/i);
  assert.ok(model.legalCardIds.has('jade-3'));
  assert.ok(model.optionCount>0);
  const combined=`${model.title} ${model.body} ${model.selectedLabel||''}`;
  assert.doesNotMatch(combined,/ace|dragon|phoenix/i);
});

test('Coach explains how to answer a pair and validates a selected higher pair',()=>{
  const previous=classify([r('jade',7),r('sword',7)]);
  const s=state({
    hands:[[r('jade',9),r('sword',9),r('star',4)],[],[],[]],
    lastPlay:previous,
    selected:new Set(['jade-9','sword-9']),
  });
  const model=buildCoachModel(s,{...baseUi});
  assert.match(model.body,/higher pair|bomb/i);
  assert.equal(model.selectedValid,true);
  assert.match(model.selectedLabel,/pair/i);
});

test('Coach explains that an active wish must be fulfilled when possible',()=>{
  const previous=classify([r('jade',6),r('sword',6)]);
  const s=state({
    hands:[[r('jade',7),r('sword',7),r('jade',8),r('sword',8)],[],[],[]],
    lastPlay:previous,
    wish:8,
  });
  const model=buildCoachModel(s,{...baseUi});
  assert.match(model.body,/must.*8|wish.*8/i);
  assert.deepEqual([...model.legalCardIds].sort(),['jade-8','sword-8']);
});

test('Coach explains the current exchange recipient',()=>{
  const s=state({phase:'exchange',hands:[[r('jade',2)],[],[],[]]});
  const model=buildCoachModel(s,{...baseUi,exchangeTarget:1});
  assert.equal(model.title,'Pass a card to Mei');
  assert.match(model.body,/opponent|left/i);
});

test('Coach can be switched off cleanly',()=>{
  const model=buildCoachModel(state(),{...baseUi,coachEnabled:false});
  assert.equal(model,null);
});

test('special card help is concise and unique for all four specials',()=>{
  for(const id of ['mahjong','dog','phoenix','dragon']){
    const help=specialCardHelp(by(id));
    assert.ok(help.title.length>0);
    assert.ok(help.body.length>20);
  }
  assert.match(specialCardHelp(by('dog')).body,/partner/i);
  assert.match(specialCardHelp(by('phoenix')).body,/-25|wildcard/i);
  assert.match(specialCardHelp(by('dragon')).body,/opponent/i);
});
