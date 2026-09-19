import test from 'node:test';
import assert from 'node:assert/strict';
import {runBotBenchmark} from '../src/simulation/bot-benchmark.js';
import {parseBenchmarkArgs} from '../scripts/benchmark-bots.mjs';

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
      teamPlay:{
        strategic:{partnerPasses:2,partnerOvertakes:1,opponentThreatStops:3,goOutPlays:1},
        baseline:{partnerPasses:1,partnerOvertakes:4,opponentThreatStops:1,goOutPlays:0},
      },
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

test('benchmark aggregates team-play telemetry by policy',()=>{
  const result=runBotBenchmark({pairs:1,baseSeed:51,matchRunner:fakeMatch,writeReports:false});
  assert.deepEqual(result.teamPlay.strategic,{partnerPasses:4,partnerOvertakes:2,opponentThreatStops:6,goOutPlays:2});
  assert.deepEqual(result.teamPlay.baseline,{partnerPasses:2,partnerOvertakes:8,opponentThreatStops:2,goOutPlays:0});
  const report=result.reportText;
  assert.match(report,/partner passes strategic\/baseline: 4\/2/);
  assert.match(report,/partner overtakes strategic\/baseline: 2\/8/);
  assert.match(report,/opponent threat stops strategic\/baseline: 6\/2/);
});

test('paired benchmark ties a seed pair when swapped score differentials cancel',()=>{
  const matchRunner=input=>{
    const scores=[1050,950];
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

test('benchmark CLI parses documented defaults and validation flags',()=>{
  assert.deepEqual(parseBenchmarkArgs([]),{
    pairs:50,
    baseSeed:1,
    validate:false,
    quiet:false,
    gitSha:null,
  });
  assert.deepEqual(
    parseBenchmarkArgs(['--pairs','200','--seed','10001','--validate','--quiet','--git-sha','abc123']),
    {pairs:200,baseSeed:10001,validate:true,quiet:true,gitSha:'abc123'},
  );
  assert.throws(()=>parseBenchmarkArgs(['--pairs','0']),/positive integer/i);
  assert.throws(()=>parseBenchmarkArgs(['--unknown']),/unknown option/i);
});
