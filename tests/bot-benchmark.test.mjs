import test from 'node:test';
import assert from 'node:assert/strict';
import {runBotBenchmark} from '../src/simulation/bot-benchmark.js';

const STRATEGIC='strategic';
const BASELINE='baseline';

function fakeMatch({seed,botPolicies}){
  const strategicTeam=botPolicies[0]===STRATEGIC?0:1;
  const scores=strategicTeam===0?[1100,900]:[800,1000];
  return{
    ok:true,
    seed,
    steps:12,
    metadata:{botPolicies:[...botPolicies]},
    finalState:{scores,winnerTeam:strategicTeam},
    telemetry:{
      rounds:2,
      declarations:[],
      doubleVictories:0,
      finishPositions:{0:[1,3],1:[2,4]},
      actionCount:12,
      rejectedDecisions:0,
      decisionTiming:{count:4,totalMs:8,maxMs:3},
    },
  };
}

test('paired benchmark orients strategic score differential after team policy swap',()=>{
  const calls=[];
  const matchRunner=input=>{
    calls.push([...input.botPolicies]);
    return fakeMatch(input);
  };
  const result=runBotBenchmark({pairs:1,baseSeed:50,matchRunner,writeReports:false,gitSha:'test-sha'});
  assert.equal(result.ok,true);
  assert.deepEqual(calls,[
    [STRATEGIC,BASELINE,STRATEGIC,BASELINE],
    [BASELINE,STRATEGIC,BASELINE,STRATEGIC],
  ]);
  assert.equal(result.matches,2);
  assert.deepEqual(result.matchWins,{strategic:2,baseline:0,ties:0});
  assert.deepEqual(result.pairWins,{strategic:1,baseline:0,ties:0});
  assert.equal(result.averageScoreDifferential,200);
  assert.equal(result.aggregatePairDifferential,400);
  assert.equal(result.rejectedDecisions,0);
  assert.equal(result.timing.maxMs,3);
  assert.equal(result.gitSha,'test-sha');
});

test('paired benchmark ties a seed pair when swapped score differentials cancel',()=>{
  let call=0;
  const matchRunner=input=>{
    call+=1;
    const strategicTeam=input.botPolicies[0]===STRATEGIC?0:1;
    const scores=call===1?[1050,950]:[1050,950];
    return{
      ...fakeMatch(input),
      finalState:{scores,winnerTeam:0},
      metadata:{botPolicies:[...input.botPolicies]},
      telemetry:{...fakeMatch(input).telemetry,rejectedDecisions:0},
    };
  };
  const result=runBotBenchmark({pairs:1,baseSeed:75,matchRunner,writeReports:false});
  assert.equal(result.ok,true);
  assert.equal(result.aggregatePairDifferential,0);
  assert.deepEqual(result.pairWins,{strategic:0,baseline:0,ties:1});
});

test('benchmark smoke rejects invalid strategic decisions independently of quality validation',()=>{
  const matchRunner=input=>({
    ...fakeMatch(input),
    telemetry:{...fakeMatch(input).telemetry,rejectedDecisions:1},
  });
  const result=runBotBenchmark({pairs:1,baseSeed:90,matchRunner,writeReports:false,validate:false});
  assert.equal(result.ok,false);
  assert.equal(result.rejectedDecisions,2);
});
