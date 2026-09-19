import fs from 'node:fs';
import path from 'node:path';
import {BOT_POLICY_BASELINE,BOT_POLICY_STRATEGIC} from '../bot-strategy.js';
import {runDeterministicMatch} from './driver.js';

const STRATEGIC=BOT_POLICY_STRATEGIC;
const BASELINE=BOT_POLICY_BASELINE;
const MATCH_A=[STRATEGIC,BASELINE,STRATEGIC,BASELINE];
const MATCH_B=[BASELINE,STRATEGIC,BASELINE,STRATEGIC];

const winBucket=()=>({strategic:0,baseline:0,ties:0});
const teamPlayBucket=()=>({partnerPasses:0,partnerOvertakes:0,opponentThreatStops:0,goOutPlays:0});
const declarationBucket=()=>({
  tichu:{calls:0,successes:0,failures:0,netPoints:0},
  grand:{calls:0,successes:0,failures:0,netPoints:0},
  netPoints:0,
});

function policyForTeam(botPolicies,team){
  return botPolicies[team]===STRATEGIC?STRATEGIC:BASELINE;
}

function strategicTeam(botPolicies){
  return botPolicies[0]===STRATEGIC?0:1;
}

function scoreDifferential(match,botPolicies){
  const scores=match?.finalState?.scores;
  if(!Array.isArray(scores)||scores.length!==2||scores.some(value=>!Number.isFinite(value)))return null;
  const team=strategicTeam(botPolicies);
  return scores[team]-scores[1-team];
}

function fullFinishOrder(finished=[]){
  const order=[...finished];
  for(let seat=0;seat<4;seat++)if(!order.includes(seat))order.push(seat);
  return order.slice(0,4);
}

function accumulateMatchTelemetry(summary,match,botPolicies){
  const telemetry=match?.telemetry||{};
  const actionCount=Number.isFinite(telemetry.actionCount)?telemetry.actionCount:(Number.isFinite(match?.steps)?match.steps:0);
  summary.actionCounts.total+=actionCount;
  summary.actionCounts.matches+=1;
  summary.rejectedDecisions+=Number.isFinite(telemetry.rejectedDecisions)?telemetry.rejectedDecisions:0;

  const timing=telemetry.decisionTiming||{};
  const timingCount=Number.isFinite(timing.count)?timing.count:0;
  const timingTotal=Number.isFinite(timing.totalMs)?timing.totalMs:0;
  const timingMax=Number.isFinite(timing.maxMs)?timing.maxMs:0;
  summary.timing.count+=timingCount;
  summary.timing.totalMs+=timingTotal;
  summary.timing.maxMs=Math.max(summary.timing.maxMs,timingMax);

  const teamPlay=telemetry.teamPlay||{};
  for(const policy of[STRATEGIC,BASELINE]){
    const source=teamPlay[policy]||{};
    const target=summary.teamPlay[policy];
    for(const metric of Object.keys(target)){
      if(Number.isFinite(source[metric]))target[metric]+=source[metric];
    }
  }

  if(!Array.isArray(telemetry.rounds))return;
  for(const round of telemetry.rounds){
    summary.rounds+=1;
    const declarations=Array.isArray(round?.declarations)?round.declarations:[];
    const first=round?.finished?.[0];
    for(let seat=0;seat<4;seat++){
      const call=declarations[seat];
      if(call!=='tichu'&&call!=='grand')continue;
      const policy=botPolicies[seat]===STRATEGIC?STRATEGIC:BASELINE;
      const bucket=summary.declarations[policy][call];
      const success=first===seat;
      const points=call==='grand'?200:100;
      bucket.calls+=1;
      bucket[success?'successes':'failures']+=1;
      bucket.netPoints+=success?points:-points;
      summary.declarations[policy].netPoints+=success?points:-points;
    }

    if(round?.doubleVictory&&Number.isInteger(first)){
      summary.doubles[policyForTeam(botPolicies,first%2)]+=1;
    }

    const order=fullFinishOrder(round?.finished||[]);
    order.forEach((seat,index)=>{
      const policy=botPolicies[seat]===STRATEGIC?STRATEGIC:BASELINE;
      summary.finishPosition[policy].total+=index+1;
      summary.finishPosition[policy].count+=1;
    });
  }
}

function finalizeSummary(summary){
  summary.averageScoreDifferential=summary.matches?summary.totalScoreDifferential/summary.matches:0;
  summary.actionCounts.averagePerMatch=summary.actionCounts.matches?summary.actionCounts.total/summary.actionCounts.matches:0;
  summary.actionCounts.averageRoundsPerMatch=summary.matches?summary.rounds/summary.matches:0;
  summary.timing.averageMs=summary.timing.count?summary.timing.totalMs/summary.timing.count:0;
  for(const policy of[STRATEGIC,BASELINE]){
    const finish=summary.finishPosition[policy];
    finish.average=finish.count?finish.total/finish.count:null;
    for(const declaration of['tichu','grand']){
      const bucket=summary.declarations[policy][declaration];
      bucket.successRate=bucket.calls?bucket.successes/bucket.calls:null;
      bucket.inconclusive=bucket.calls<20;
    }
  }
  return summary;
}

function evaluateBenchmark(summary,{validate}){
  const correctness=[];
  if(summary.failedMatches.length)correctness.push(`${summary.failedMatches.length} match(es) failed`);
  if(summary.malformedMatches>0)correctness.push(`${summary.malformedMatches} malformed match result(s)`);
  if(summary.rejectedDecisions>0)correctness.push(`${summary.rejectedDecisions} rejected decision(s)`);
  if(summary.timing.maxMs>250)correctness.push(`decision timing ${summary.timing.maxMs.toFixed(2)} ms exceeds 250 ms`);

  const quality=[];
  if(validate){
    if(summary.matchWins.strategic<=summary.matchWins.baseline)quality.push('strategic must win more matches than baseline');
    if(summary.averageScoreDifferential<=0)quality.push('average strategic score differential must be positive');
    if(summary.aggregatePairDifferential<=0)quality.push('aggregate pair differential must be positive');
    const strategicDeclaration=summary.declarations.strategic.netPoints/Math.max(1,summary.matches);
    const baselineDeclaration=summary.declarations.baseline.netPoints/Math.max(1,summary.matches);
    if(strategicDeclaration<baselineDeclaration-5)quality.push('strategic declaration net points trail baseline by more than 5 points/match');
  }

  summary.validation={validate,correctness,quality};
  summary.ok=correctness.length===0&&quality.length===0;
  return summary;
}

export function formatBotBenchmarkReport(summary){
  const lines=[
    `Tichu Bot Benchmark`,
    `pairs: ${summary.pairs}  matches: ${summary.matches}  baseSeed: ${summary.baseSeed}`,
    `gitSha: ${summary.gitSha||'unknown'}  engine: ${summary.engineVersion}`,
    `match wins strategic/baseline/ties: ${summary.matchWins.strategic}/${summary.matchWins.baseline}/${summary.matchWins.ties}`,
    `pair wins strategic/baseline/ties: ${summary.pairWins.strategic}/${summary.pairWins.baseline}/${summary.pairWins.ties}`,
    `average score differential: ${summary.averageScoreDifferential.toFixed(2)}`,
    `aggregate pair differential: ${summary.aggregatePairDifferential}`,
    `declaration net strategic/baseline: ${summary.declarations.strategic.netPoints}/${summary.declarations.baseline.netPoints}`,
    `double victories strategic/baseline: ${summary.doubles.strategic}/${summary.doubles.baseline}`,
    `partner passes strategic/baseline: ${summary.teamPlay.strategic.partnerPasses}/${summary.teamPlay.baseline.partnerPasses}`,
    `partner overtakes strategic/baseline: ${summary.teamPlay.strategic.partnerOvertakes}/${summary.teamPlay.baseline.partnerOvertakes}`,
    `opponent threat stops strategic/baseline: ${summary.teamPlay.strategic.opponentThreatStops}/${summary.teamPlay.baseline.opponentThreatStops}`,
    `go-out plays strategic/baseline: ${summary.teamPlay.strategic.goOutPlays}/${summary.teamPlay.baseline.goOutPlays}`,
    `average finish strategic/baseline: ${summary.finishPosition.strategic.average?.toFixed(3)??'n/a'}/${summary.finishPosition.baseline.average?.toFixed(3)??'n/a'}`,
    `actions total/avg: ${summary.actionCounts.total}/${summary.actionCounts.averagePerMatch.toFixed(2)}`,
    `decision timing avg/max ms: ${summary.timing.averageMs.toFixed(3)}/${summary.timing.maxMs.toFixed(3)}`,
    `rejected decisions: ${summary.rejectedDecisions}`,
    `status: ${summary.ok?'PASS':'FAIL'}`,
  ];
  for(const message of summary.validation.correctness)lines.push(`correctness: ${message}`);
  for(const message of summary.validation.quality)lines.push(`quality: ${message}`);
  return`${lines.join('\n')}\n`;
}

function writeReports(summary,reportDir){
  fs.mkdirSync(reportDir,{recursive:true});
  const stem=`bot-benchmark-${summary.baseSeed}-${summary.pairs}`;
  const jsonPath=path.join(reportDir,`${stem}.json`);
  const textPath=path.join(reportDir,`${stem}.txt`);
  fs.writeFileSync(jsonPath,`${JSON.stringify(summary,null,2)}\n`);
  fs.writeFileSync(textPath,formatBotBenchmarkReport(summary));
  summary.reportFiles={jsonPath,textPath};
}

export function runBotBenchmark({
  pairs=50,
  baseSeed=1,
  validate=false,
  gitSha=null,
  engineVersion='0.2.0',
  stepLimit=10000,
  matchRunner=runDeterministicMatch,
  writeReports:shouldWriteReports=true,
  reportDir='artifacts/bot-benchmarks',
  onProgress=null,
}={}){
  if(!Number.isInteger(pairs)||pairs<1)throw new TypeError('pairs must be a positive integer');
  if(!Number.isInteger(baseSeed))throw new TypeError('baseSeed must be an integer');

  const summary={
    ok:false,
    pairs,
    matches:0,
    baseSeed,
    engineVersion,
    gitSha,
    matchWins:winBucket(),
    pairWins:winBucket(),
    totalScoreDifferential:0,
    averageScoreDifferential:0,
    aggregatePairDifferential:0,
    rounds:0,
    declarations:{strategic:declarationBucket(),baseline:declarationBucket()},
    doubles:{strategic:0,baseline:0},
    teamPlay:{strategic:teamPlayBucket(),baseline:teamPlayBucket()},
    finishPosition:{strategic:{total:0,count:0,average:null},baseline:{total:0,count:0,average:null}},
    actionCounts:{total:0,matches:0,averagePerMatch:0,averageRoundsPerMatch:0},
    rejectedDecisions:0,
    timing:{count:0,totalMs:0,maxMs:0,averageMs:0},
    failedMatches:[],
    malformedMatches:0,
    pairResults:[],
  };

  const layouts=[MATCH_A,MATCH_B];
  for(let pairIndex=0;pairIndex<pairs;pairIndex++){
    const seed=baseSeed+pairIndex;
    let pairDifferential=0;
    const matches=[];
    for(let layoutIndex=0;layoutIndex<layouts.length;layoutIndex++){
      const botPolicies=[...layouts[layoutIndex]];
      let match;
      try{
        match=matchRunner({seed,botPolicies,stepLimit,checkpointEvery:0,engineVersion,gitSha});
      }catch(error){
        match={ok:false,error,seed,metadata:{botPolicies},telemetry:{rejectedDecisions:0}};
      }
      summary.matches+=1;
      accumulateMatchTelemetry(summary,match,botPolicies);
      if(!match?.ok){
        summary.failedMatches.push({pairIndex,layoutIndex,seed,message:String(match?.error?.message||'match failed')});
        matches.push({layoutIndex,ok:false});
        continue;
      }
      const differential=scoreDifferential(match,botPolicies);
      if(differential==null){
        summary.malformedMatches+=1;
        matches.push({layoutIndex,ok:false,malformed:true});
        continue;
      }
      pairDifferential+=differential;
      summary.totalScoreDifferential+=differential;
      if(differential>0)summary.matchWins.strategic+=1;
      else if(differential<0)summary.matchWins.baseline+=1;
      else summary.matchWins.ties+=1;
      matches.push({layoutIndex,ok:true,differential,scores:[...match.finalState.scores],botPolicies});
    }
    summary.aggregatePairDifferential+=pairDifferential;
    if(pairDifferential>0)summary.pairWins.strategic+=1;
    else if(pairDifferential<0)summary.pairWins.baseline+=1;
    else summary.pairWins.ties+=1;
    summary.pairResults.push({pairIndex,seed,differential:pairDifferential,matches});
    onProgress?.({pairIndex,seed,differential:pairDifferential});
  }

  finalizeSummary(summary);
  evaluateBenchmark(summary,{validate});
  summary.reportText=formatBotBenchmarkReport(summary);
  if(shouldWriteReports)writeReports(summary,reportDir);
  return summary;
}
