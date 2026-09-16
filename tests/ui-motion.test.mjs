import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotVisualState, deriveVisualTransitions, visualStreamContinues } from '../src/ui-motion.js';

const card = id => ({ id });

function visualState({ hands=[[],[],[],[]], table=[], captured=[[],[],[],[]], phase='play', dragonRecipient=null }={}){
  return { hands, table, captured, phase, dragonRecipient };
}

function snap(value){
  return snapshotVisualState(visualState(value));
}

test('visual snapshots copy card IDs without retaining mutable game arrays',()=>{
  const state=visualState({
    hands:[[card('jade-2')],[],[],[]],
    table:[{seat:3,cards:[card('star-9')]}],
    captured:[[],[card('dragon')],[],[]],
    dragonRecipient:'needed',
  });
  const snapshot=snapshotVisualState(state);

  state.hands[0].push(card('sword-4'));
  state.table[0].cards[0].id='changed';
  state.captured[1].length=0;

  assert.deepEqual(snapshot,{
    hands:[['jade-2'],[],[],[]],
    handCounts:[1,0,0,0],
    table:[{seat:3,cardIds:['star-9']}],
    captured:[[],['dragon'],[],[]],
    phase:'play',
    dragonRecipient:'needed',
  });
});

test('derives a local play from hand loss and a new table entry',()=>{
  const previous=snap({hands:[[card('jade-2'),card('sword-7')],[],[],[]]});
  const next=snap({
    hands:[[card('sword-7')],[],[],[]],
    table:[{seat:0,cards:[card('jade-2')]}],
  });

  assert.deepEqual(deriveVisualTransitions(previous,next),[
    {kind:'play',seat:0,cardIds:['jade-2']},
  ]);
});

test('derives plays for every opponent seat',()=>{
  for(const seat of [1,2,3]){
    const hands=[[],[],[],[]];
    hands[seat]=[card(`seat-${seat}-card`)];
    const previous=snap({hands});
    const nextHands=hands.map(hand=>[...hand]);
    nextHands[seat]=[];
    const next=snap({hands:nextHands,table:[{seat,cards:[card(`seat-${seat}-card`)]}]});

    assert.deepEqual(deriveVisualTransitions(previous,next),[
      {kind:'play',seat,cardIds:[`seat-${seat}-card`]},
    ]);
  }
});

test('keeps every card ID in a multi-card play',()=>{
  const ids=['jade-6','sword-6','star-6'];
  const previous=snap({hands:[ids.map(card),[],[],[]]});
  const next=snap({table:[{seat:0,cards:ids.map(card)}]});

  assert.deepEqual(deriveVisualTransitions(previous,next),[
    {kind:'play',seat:0,cardIds:ids},
  ]);
});

test('derives normal trick collection from table loss and captured growth',()=>{
  const table=[
    {seat:1,cards:[card('jade-4')]},
    {seat:3,cards:[card('sword-8')]},
  ];
  const previous=snap({table});
  const next=snap({captured:[[],[],[],[card('jade-4'),card('sword-8')]]});

  assert.deepEqual(deriveVisualTransitions(previous,next),[
    {kind:'collect',recipient:3,cardIds:['jade-4','sword-8']},
  ]);
});

test('uses captured growth as the Dragon trick recipient',()=>{
  const previous=snap({
    table:[{seat:0,cards:[card('jade-10')]},{seat:0,cards:[card('dragon')]}],
    dragonRecipient:'needed',
  });
  const next=snap({captured:[[],[],[],[card('dragon'),card('jade-10')]]});

  assert.deepEqual(deriveVisualTransitions(previous,next),[
    {kind:'collect',recipient:3,cardIds:['jade-10','dragon']},
  ]);
});

test('derives a Dog play from hand loss without collection',()=>{
  const previous=snap({hands:[[],[card('dog')],[],[]]});
  const next=snap({hands:[[],[],[],[]]});

  assert.deepEqual(deriveVisualTransitions(previous,next),[
    {kind:'play',seat:1,cardIds:['dog']},
  ]);
});

test('derives a hidden opponent Dog play from hand counts',()=>{
  const previous=snap({hands:[[],[{hidden:true},{hidden:true}],[],[]]});
  const next=snap({hands:[[],[{hidden:true}],[],[]]});

  assert.deepEqual(deriveVisualTransitions(previous,next),[
    {kind:'play',seat:1,cardIds:['hidden-dog-seat-1']},
  ]);
});

test('ignores selection-only renders',()=>{
  const state=snap({
    hands:[[card('jade-3')],[],[],[]],
    table:[{seat:2,cards:[card('star-5')]}],
  });

  assert.deepEqual(deriveVisualTransitions(state,snapshotVisualState({...state,selected:['jade-3']})),[]);
});

test('combines a final play collected before an intermediate render',()=>{
  const previous=snap({
    hands:[[],[],[card('phoenix'),card('jade-9')],[]],
    table:[{seat:1,cards:[card('pagoda-5')]},{seat:3,cards:[card('sword-8')]}],
    captured:[[],[],[card('star-10')],[]],
  });
  const next=snap({
    captured:[[],[],[card('star-10'),card('pagoda-5'),card('sword-8'),card('phoenix'),card('jade-9')],[]],
    phase:'round-end',
  });

  assert.deepEqual(deriveVisualTransitions(previous,next),[
    {
      kind:'play-and-collect',seat:2,recipient:2,
      cardIds:['phoenix','jade-9'],tableCardIds:['pagoda-5','sword-8'],
    },
  ]);
});

test('round-end redistribution does not replace the last-trick recipient',()=>{
  const previous=snap({
    hands:[[],[card('jade-A')],[],[]],
    table:[{seat:3,cards:[card('star-10')]}],
    captured:[[card('old-last-card')],[],[],[]],
  });
  const next=snap({
    captured:[[],[card('star-10')],[],[card('old-last-card')]],
    phase:'round-end',
  });

  assert.deepEqual(deriveVisualTransitions(previous,next),[
    {kind:'collect',recipient:1,cardIds:['star-10']},
  ]);
});

test('authoritative visual streams animate only contiguous non-rebase revisions',()=>{
  assert.equal(visualStreamContinues(null,{streamId:'room-a',revision:7,rebase:true}),false);
  assert.equal(visualStreamContinues({streamId:'room-a',revision:7},{streamId:'room-a',revision:8,rebase:false}),true);
  assert.equal(visualStreamContinues({streamId:'room-a',revision:8},{streamId:'room-a',revision:10,rebase:false}),false);
  assert.equal(visualStreamContinues({streamId:'room-a',revision:10},{streamId:'room-b',revision:11,rebase:false}),false);
  assert.equal(visualStreamContinues({streamId:'room-a',revision:10},{streamId:'room-a',revision:11,rebase:true}),false);
});
