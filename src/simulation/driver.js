import { TichuGame } from '../game.js';
import { makeDeck } from '../rules.js';
import { createSeededRng } from './rng.js';
import { SimulationInvariantError,assertSimulationInvariants } from './invariants.js';
import {
  createReplay,normalizeState,recordReplayAction,recordReplayCheckpoint,
  recordReplayFailure,stateSummary,validateReplayDocument,
} from './replay.js';

const DEFAULT_NAMES=['Bot A','Bot B','Bot C','Bot D'];
const ALL_BOTS=[0,1,2,3];
const expectedDeckIds=makeDeck().map(card=>card.id);

export function nextSimulationAction(game){
  const s=game.state;
  if(s.phase==='grand'){
    const seat=s.declarations.findIndex(value=>!value);
    if(seat<0)throw new Error('Grand Tichu phase has no undecided seat');
    return{type:'declareGrand',seat,payload:{yes:game.botWantsGrand(seat)}};
  }
  if(s.phase==='exchange'){
    const seat=s.exchangeDone.findIndex(done=>!done);
    if(seat<0)throw new Error('Exchange phase has no pending seat');
    return{type:'submitExchange',seat,payload:{map:game.botExchangeMap(seat)}};
  }
  if(s.phase==='play'){
    if(s.dragonRecipient==='needed'){
      const winner=s.table.at(-1)?.seat;
      const recipient=[0,1,2,3].find(seat=>seat%2!==winner%2);
      return{type:'chooseDragonRecipient',seat:winner,payload:{recipient}};
    }
    const seat=s.currentPlayer;
    if(s.hands[seat].length===14&&s.declarations[seat]==='none'&&game.botShouldTichu(seat)){
      return{type:'declareTichu',seat,payload:{}};
    }
    const choice=game.botPlayChoice(seat);
    if(choice?.type==='pass')return{type:'pass',seat,payload:{}};
    if(choice?.type==='play')return{type:'playCards',seat,payload:{ids:choice.ids,wishRank:choice.wishRank}};
    throw new Error(`No simulation action for play seat ${seat}`);
  }
  if(s.phase==='round-end')return{type:'nextRound',seat:null,payload:{}};
  if(s.phase==='match-end')return null;
  throw new Error(`Unsupported simulation phase ${s.phase}`);
}

export function applySimulationAction(game,action){
  let accepted=false;
  switch(action.type){
    case'declareGrand': accepted=game.declareGrand(action.seat,action.payload.yes); break;
    case'submitExchange': accepted=game.submitExchange(action.seat,action.payload.map); break;
    case'declareTichu': accepted=game.declareTichu(action.seat); break;
    case'pass': accepted=game.pass(action.seat); break;
    case'playCards': accepted=game.playCards(action.seat,action.payload.ids,action.payload.wishRank).ok; break;
    case'chooseDragonRecipient': {
      game.chooseDragonRecipient(action.payload.recipient);
      accepted=game.state.dragonRecipient!=='needed';
      break;
    }
    case'nextRound': {
      game.nextRound();
      accepted=game.state.phase==='grand';
      break;
    }
    default: throw new Error(`Unknown simulation action ${action.type}`);
  }
  if(!accepted)throw new Error(`Simulation action rejected: ${action.type} seat=${action.seat}`);
}

export function runDeterministicMatch({seed,stepLimit=10000,checkpointEvery=100,engineVersion='0.2.0',gitSha=null}={}){
  const game=new TichuGame({rng:createSeededRng(seed),autoSchedule:false,botDelay:0});
  game.resetMatch({names:DEFAULT_NAMES,botSeats:ALL_BOTS});
  const replay=createReplay({
    seed,engineVersion,gitSha,
    config:{targetScore:1000,stepLimit,checkpointEvery},
    initialState:game.state,
  });
  let step=0;
  let action=null;
  let beforeState=null;
  const recentSummaries=[];

  try{
    assertSimulationInvariants(game.state,{expectedDeckIds});
    while(game.state.phase!=='match-end'){
      if(step>=stepLimit)throw new SimulationInvariantError('STEP_LIMIT',`Step limit ${stepLimit} reached`,{step});
      action=nextSimulationAction(game);
      beforeState=normalizeState(game.state);
      applySimulationAction(game,action);
      step+=1;

      assertSimulationInvariants(game.state,{
        expectedDeckIds,
        previousState:beforeState,
        lastAction:action,
      });

      const recorded=recordReplayAction(replay,{
        step,
        round:beforeState.round,
        seat:action.seat,
        type:action.type,
        payload:action.payload,
        beforeState,
        afterState:game.state,
      });

      if(checkpointEvery>0&&step%checkpointEvery===0)recordReplayCheckpoint(replay,step,game.state);
      recentSummaries.push(recorded.summaryAfter);
      if(recentSummaries.length>3)recentSummaries.shift();
      if(recentSummaries.length===3&&recentSummaries.every(summary=>summary===recentSummaries[0])){
        throw new SimulationInvariantError('DEADLOCK','State did not advance for three transitions',{step,summary:recorded.summaryAfter});
      }
    }
    return{ok:true,seed,steps:step,replay,finalState:normalizeState(game.state)};
  }catch(error){
    const code=error instanceof SimulationInvariantError?error.code:'SIMULATION_ERROR';
    recordReplayFailure(replay,{
      code,
      message:error.message,
      step,
      round:game.state.round,
      action,
      beforeState,
      afterState:game.state,
    });
    return{ok:false,seed,steps:step,replay,error};
  }
}

function replayRecordedFailure(game,replay){
  const failure=replay.failure;
  if(!failure)return null;

  if(failure.code==='STEP_LIMIT'){
    const limit=replay.config?.stepLimit;
    const reproduced=Number.isInteger(limit)&&replay.actions.length>=limit&&failure.step===replay.actions.length;
    return reproduced
      ?{ok:true,step:failure.step,reproducedFailure:true,failureCode:'STEP_LIMIT',finalSummary:stateSummary(game.state)}
      :{ok:false,step:replay.actions.length,message:'Recorded STEP_LIMIT boundary did not reproduce',expected:failure.step,actual:replay.actions.length};
  }

  if(failure.code==='DEADLOCK'){
    const recent=replay.actions.slice(-3).map(action=>action.summaryAfter);
    const reproduced=recent.length===3&&recent.every(summary=>summary===recent[0])&&failure.step===replay.actions.length;
    return reproduced
      ?{ok:true,step:failure.step,reproducedFailure:true,failureCode:'DEADLOCK',finalSummary:stateSummary(game.state)}
      :{ok:false,step:replay.actions.length,message:'Recorded DEADLOCK boundary did not reproduce'};
  }

  if(!failure.action){
    return{ok:false,step:replay.actions.length,message:`Recorded ${failure.code} failure has no action to reproduce`};
  }

  if(failure.beforeState){
    const expectedBefore=stateSummary(failure.beforeState);
    const actualBefore=stateSummary(game.state);
    if(expectedBefore!==actualBefore){
      return{ok:false,step:failure.step,message:'Failure pre-state diverged',expected:expectedBefore,actual:actualBefore};
    }
  }

  const previousState=normalizeState(game.state);
  try{
    applySimulationAction(game,failure.action);
    assertSimulationInvariants(game.state,{
      expectedDeckIds,
      previousState,
      lastAction:failure.action,
    });
  }catch(error){
    const actualCode=error instanceof SimulationInvariantError?error.code:'SIMULATION_ERROR';
    if(actualCode===failure.code){
      return{
        ok:true,
        step:failure.step,
        reproducedFailure:true,
        failureCode:actualCode,
        finalSummary:stateSummary(game.state),
      };
    }
    return{ok:false,step:failure.step,message:'Failure code diverged',expected:failure.code,actual:actualCode,error};
  }

  return{ok:false,step:failure.step,message:'Expected failure did not reproduce',expected:failure.code,actual:'NO_FAILURE'};
}

export function replayDeterministicMatch(replay){
  try{
    validateReplayDocument(replay);
    const game=new TichuGame({rng:createSeededRng(replay.seed),autoSchedule:false,botDelay:0});
    game.resetMatch({names:DEFAULT_NAMES,botSeats:ALL_BOTS});
    const initialExpected=stateSummary(replay.initial.state);
    const initialActual=stateSummary(game.state);
    if(initialActual!==initialExpected){
      return{ok:false,step:0,message:'Initial state summary diverged',expected:initialExpected,actual:initialActual};
    }
    for(const action of replay.actions){
      const before=stateSummary(game.state);
      if(before!==action.summaryBefore){
        return{ok:false,step:action.step,message:'State summary diverged before action',expected:action.summaryBefore,actual:before};
      }
      applySimulationAction(game,action);
      const actual=stateSummary(game.state);
      if(actual!==action.summaryAfter){
        return{ok:false,step:action.step,message:'State summary diverged',expected:action.summaryAfter,actual};
      }
    }
    const failureResult=replayRecordedFailure(game,replay);
    if(failureResult)return failureResult;
    return{ok:true,step:replay.actions.length,finalSummary:stateSummary(game.state)};
  }catch(error){
    return{ok:false,step:0,message:error.message,error};
  }
}

export function runSimulationBatch({matches=100,baseSeed=1,stepLimit=10000,checkpointEvery=100,engineVersion='0.2.0',gitSha=null,onProgress=null}={}){
  let totalSteps=0;
  for(let index=0;index<matches;index++){
    const seed=baseSeed+index;
    const result=runDeterministicMatch({seed,stepLimit,checkpointEvery,engineVersion,gitSha});
    if(!result.ok)return{ok:false,matchIndex:index,seed,result};
    totalSteps+=result.steps;
    onProgress?.({matchIndex:index,seed,steps:result.steps});
  }
  return{ok:true,matches,steps:totalSteps};
}
