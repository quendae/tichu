import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {possibleSelections} from '../src/rules.js';
import {
  buildBotView,
  decideGrand,
  decideTichu,
  chooseExchange,
  choosePlay,
  chooseWish,
  chooseDragonRecipient,
} from '../src/bot-strategy.js';

const fixtureUrl=new URL('./fixtures/bot-strategy-v1.json',import.meta.url);
const fixtures=JSON.parse(fs.readFileSync(fixtureUrl,'utf8'));

function normalizeDecision(value){
  if(Array.isArray(value)){
    const normalized=value.map(normalizeDecision);
    return normalized.every(item=>typeof item==='string')?[...normalized].sort():normalized;
  }
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalizeDecision(value[key])]));
  }
  return value;
}

const decisionFns={
  grand:scenario=>decideGrand(scenario.view,scenario.profile),
  tichu:scenario=>decideTichu(scenario.view,scenario.profile),
  exchange:scenario=>chooseExchange(scenario.view,scenario.profile),
  play:scenario=>choosePlay(scenario.view,scenario.profile),
  wish:scenario=>chooseWish(scenario.view,scenario.selectedCards||[],scenario.profile),
  dragon:scenario=>chooseDragonRecipient(scenario.view,scenario.profile),
};

test('canonical bot strategy fixture metadata is stable',()=>{
  assert.equal(fixtures.fixtureVersion,1);
  assert.equal(fixtures.scenarios.length,15);
  assert.equal(new Set(fixtures.scenarios.map(scenario=>scenario.id)).size,15);
  const digest=crypto.createHash('sha256').update(JSON.stringify(fixtures.scenarios)).digest('hex');
  assert.equal(fixtures.scenarioHash,digest);
});

for(const scenario of fixtures.scenarios){
  test(`fixture: ${scenario.id}`,()=>{
    const decide=decisionFns[scenario.decision];
    assert.equal(typeof decide,'function',`unknown fixture decision: ${scenario.decision}`);
    const actual=normalizeDecision(decide(scenario));
    assert.deepEqual(actual,normalizeDecision(scenario.expected));
  });
}

const card=(suit,rank)=>({id:`${suit}-${rank}`,suit,rank,special:null});
const special=(name,rank=null)=>({id:name,suit:null,rank,special:name});

function hiddenPermutationState(otherHands){
  const lead=card('star',5);
  return{
    phase:'play',
    round:1,
    currentPlayer:0,
    trickLeader:1,
    hands:[
      [card('jade',6),card('sword',10),special('dragon',15)],
      structuredClone(otherHands[0]),
      structuredClone(otherHands[1]),
      structuredClone(otherHands[2]),
    ],
    captured:[[],[],[],[]],
    discarded:[],
    finished:[],
    table:[{seat:1,cards:[lead],play:{type:'single',length:1,value:5,cards:[lead],phoenixAs:null}}],
    lastPlay:{type:'single',length:1,value:5,cards:[lead],phoenixAs:null},
    passes:0,
    wish:null,
    passSelections:{},
    exchangeDone:[true,true,true,true],
    declarations:['none','none','none','none'],
    scores:[0,0],
    roundScore:[0,0],
  };
}

test('permuting hidden opponent cards cannot change BotView or strategic decisions',()=>{
  const hidden=[
    [card('jade',2),card('sword',3)],
    [card('pagoda',7),card('star',8)],
    [card('jade',12),card('sword',13)],
  ];
  const stateA=hiddenPermutationState(hidden);
  const stateB=hiddenPermutationState([hidden[2],hidden[0],hidden[1]]);
  const legalA=possibleSelections(stateA.hands[0],stateA.lastPlay,stateA.wish);
  const legalB=possibleSelections(stateB.hands[0],stateB.lastPlay,stateB.wish);
  const viewA=buildBotView(stateA,0,{legalPlays:legalA});
  const viewB=buildBotView(stateB,0,{legalPlays:legalB});

  assert.deepEqual(viewA,viewB);
  assert.equal(JSON.stringify(viewA).includes('jade-2'),false);
  assert.equal(JSON.stringify(viewA).includes('pagoda-7'),false);
  assert.equal(JSON.stringify(viewA).includes('sword-13'),false);

  const decisions=view=>({
    grand:decideGrand(view,'strategic'),
    tichu:decideTichu(view,'strategic'),
    exchange:normalizeDecision(chooseExchange(view,'strategic')),
    play:normalizeDecision(choosePlay(view,'strategic')),
    wish:chooseWish(view,[],'strategic'),
    dragon:chooseDragonRecipient(view,'strategic'),
  });
  assert.deepEqual(decisions(viewA),decisions(viewB));
});
