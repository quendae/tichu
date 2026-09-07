import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUiState,
  assignExchangeCard,
  unassignExchangeTarget,
  exchangeMap,
  exchangeComplete,
  setCoachEnabled,
  syncUiState,
} from '../src/ui-state.js';

function memoryStorage(initial={}){
  const data=new Map(Object.entries(initial));
  return {
    getItem:key=>data.has(key)?data.get(key):null,
    setItem:(key,value)=>data.set(key,String(value)),
    snapshot:()=>Object.fromEntries(data),
  };
}

test('ui state defaults to Coach enabled and empty exchange staging',()=>{
  const ui=createUiState(memoryStorage());
  assert.equal(ui.coachEnabled,true);
  assert.deepEqual(ui.exchangeAssignments,{});
  assert.equal(ui.exchangeTarget,1);
  assert.equal(exchangeComplete(ui),false);
});

test('exchange staging assigns one unique card per target and supports undo',()=>{
  const ui=createUiState(memoryStorage());
  assignExchangeCard(ui,1,'jade-2');
  assignExchangeCard(ui,2,'dragon');
  assignExchangeCard(ui,3,'star-8');
  assert.equal(exchangeComplete(ui),true);
  assert.deepEqual(exchangeMap(ui),{1:'jade-2',2:'dragon',3:'star-8'});

  assignExchangeCard(ui,3,'jade-2');
  assert.equal(ui.exchangeAssignments[1],undefined);
  assert.equal(ui.exchangeAssignments[3],'jade-2');
  assert.equal(exchangeComplete(ui),false);

  unassignExchangeTarget(ui,3);
  assert.equal(ui.exchangeAssignments[3],undefined);
});

test('Coach preference persists without requiring browser localStorage',()=>{
  const storage=memoryStorage();
  const ui=createUiState(storage);
  setCoachEnabled(ui,false,storage);
  assert.equal(ui.coachEnabled,false);
  assert.equal(storage.snapshot()['tichu.qqnd.coach.v1'],'off');
  assert.equal(createUiState(storage).coachEnabled,false);
});

test('sync resets exchange staging only when entering a fresh exchange phase',()=>{
  const ui=createUiState(memoryStorage());
  ui.lastPhase='grand';
  assignExchangeCard(ui,1,'jade-2');
  syncUiState(ui,{phase:'exchange',round:1,dragonRecipient:null});
  assert.deepEqual(ui.exchangeAssignments,{});
  assignExchangeCard(ui,1,'jade-3');
  syncUiState(ui,{phase:'exchange',round:1,dragonRecipient:null});
  assert.equal(ui.exchangeAssignments[1],'jade-3');
  syncUiState(ui,{phase:'play',round:1,dragonRecipient:null});
  assert.equal(ui.wishPicker,false);
  assert.equal(ui.dragonChoice,false);
});
