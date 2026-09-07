import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck, classify, beats, cardPoints, describePlay, legalCardIds } from '../src/rules.js';

const deck=makeDeck(), by=id=>deck.find(c=>c.id===id), r=(suit,n)=>by(`${suit}-${n}`);

test('deck has 56 unique cards',()=>{
  assert.equal(deck.length,56);assert.equal(new Set(deck.map(c=>c.id)).size,56);
});
test('basic combinations classify correctly',()=>{
  assert.equal(classify([r('jade',7)]).type,'single');
  assert.equal(classify([r('jade',7),r('sword',7)]).type,'pair');
  assert.equal(classify([r('jade',7),r('sword',7),r('star',7)]).type,'triple');
  assert.equal(classify([r('jade',7),r('sword',7),r('star',7),r('jade',9),r('sword',9)]).type,'full-house');
  assert.equal(classify([r('jade',3),r('sword',4),r('star',5),r('jade',6),r('sword',7)]).type,'straight');
  assert.equal(classify([r('jade',3),r('sword',3),r('star',4),r('jade',4)]).type,'steps');
});
test('phoenix works in legal non-bomb combinations',()=>{
  const p=by('phoenix');
  assert.equal(classify([r('jade',9),p]).type,'pair');
  assert.equal(classify([r('jade',3),r('sword',4),p,r('jade',6),r('sword',7)]).type,'straight');
  assert.equal(classify([r('jade',8),r('sword',8),p,r('jade',5),r('sword',5)]).type,'full-house');
});
test('mah jong cannot form pairs, full houses or steps and phoenix cannot replace rank one',()=>{
  const m=by('mahjong'), p=by('phoenix');
  assert.equal(classify([m,p]),null);
  assert.equal(classify([m,p,r('jade',2),r('sword',2)]),null);
  assert.equal(classify([m,p,r('jade',2),r('sword',2),r('star',2)]),null);
  const allNormalRanks=[2,3,4,5,6,7,8,9,10,11,12,13,14].map((rank,index)=>r(['jade','sword','pagoda','star'][index%4],rank));
  assert.equal(classify([...allNormalRanks,p]),null);
});
test('bomb hierarchy works',()=>{
  const four=classify(['jade','sword','pagoda','star'].map(s=>r(s,8)));
  const sf=classify([4,5,6,7,8].map(n=>r('jade',n)));
  assert.equal(four.type,'bomb');assert.equal(sf.type,'bomb');assert.equal(beats(sf,four),true);
});
test('dragon and phoenix scoring',()=>{
  assert.equal(cardPoints(by('dragon')),25);assert.equal(cardPoints(by('phoenix')),-25);
  assert.equal(cardPoints(r('jade',5)),5);assert.equal(cardPoints(r('jade',10)),10);assert.equal(cardPoints(r('jade',13)),10);
});
test('phoenix as a single is half rank higher and cannot beat dragon',()=>{
  const eight=classify([r('jade',8)]), p=classify([by('phoenix')],8), nine=classify([r('jade',9)]), dragon=classify([by('dragon')]);
  assert.equal(p.value,8.5);assert.equal(beats(p,eight),true);assert.equal(beats(nine,p),true);assert.equal(beats(p,dragon),false);
});
test('coach helpers describe combinations and expose only cards from legal wish moves',()=>{
  const pair=classify([r('jade',12),r('sword',12)]);
  const straight=classify([r('jade',6),r('sword',7),r('star',8),r('pagoda',9),r('jade',10)]);
  const bomb=classify(['jade','sword','pagoda','star'].map(s=>r(s,9)));
  assert.match(describePlay(pair),/pair/i);
  assert.match(describePlay(straight),/straight/i);
  assert.match(describePlay(bomb),/bomb/i);

  const previous=classify([r('jade',6),r('sword',6)]);
  const hand=[r('jade',7),r('sword',7),r('jade',8),r('sword',8),r('star',9)];
  const ids=legalCardIds(hand,previous,8);
  assert.deepEqual([...ids].sort(),['jade-8','sword-8']);
});
