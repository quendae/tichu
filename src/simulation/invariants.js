export class SimulationInvariantError extends Error{
  constructor(code,message,details={}){
    super(message);
    this.name='SimulationInvariantError';
    this.code=code;
    this.details=details;
  }
}

const fail=(code,message,details={})=>{throw new SimulationInvariantError(code,message,details)};
const unique=array=>new Set(array).size===array.length;
const validPhases=new Set(['menu','grand','exchange','play','round-end','match-end']);
const isSeat=value=>Number.isInteger(value)&&value>=0&&value<4;
const idsOf=cards=>(cards||[]).map(card=>card?.id);

function assertPileIds(cards,expectedSet,location){
  const ids=idsOf(cards);
  if(ids.some(id=>typeof id!=='string'||!expectedSet.has(id))){
    fail('CARD_CONSERVATION',`Unknown card ID in ${location}`,{location,ids});
  }
  if(!unique(ids))fail('CARD_CONSERVATION',`Duplicate card ID inside ${location}`,{location,ids});
  return ids;
}

function collectLiveCardIds(state,expectedSet){
  const observed=[];
  (state.hands||[]).forEach((hand,seat)=>{
    for(const id of assertPileIds(hand,expectedSet,`hand:${seat}`))observed.push({id,location:`hand:${seat}`});
  });
  (state.table||[]).forEach((entry,index)=>{
    for(const id of assertPileIds(entry.cards,expectedSet,`table:${index}`))observed.push({id,location:`table:${index}`});
  });
  (state.captured||[]).forEach((pile,seat)=>{
    for(const id of assertPileIds(pile,expectedSet,`captured:${seat}`))observed.push({id,location:`captured:${seat}`});
  });
  for(const id of assertPileIds(state.remainingDeck||[],expectedSet,'remainingDeck'))observed.push({id,location:'remainingDeck'});
  return observed;
}

function assertCardConservation(state,expectedDeckIds){
  if(!Array.isArray(expectedDeckIds)||expectedDeckIds.length!==56||!unique(expectedDeckIds)){
    fail('CARD_CONSERVATION','Expected deck IDs must contain 56 unique cards',{count:expectedDeckIds?.length});
  }
  const expectedSet=new Set(expectedDeckIds);
  const observed=collectLiveCardIds(state,expectedSet);

  if(['grand','exchange','play'].includes(state.phase)){
    const ids=observed.map(item=>item.id);
    if(ids.length!==expectedDeckIds.length||!unique(ids)){
      fail('CARD_CONSERVATION','Live card locations must contain each card exactly once',{observed});
    }
    const sortedObserved=[...ids].sort();
    const sortedExpected=[...expectedDeckIds].sort();
    if(sortedObserved.some((id,index)=>id!==sortedExpected[index])){
      fail('CARD_CONSERVATION','Live card set differs from the expected deck',{observed:sortedObserved,expected:sortedExpected});
    }
  }
}

function assertStateCoherence(state){
  if(!validPhases.has(state.phase))fail('STATE_COHERENCE',`Invalid phase ${state.phase}`);
  if(!isSeat(state.currentPlayer)||!isSeat(state.trickLeader)){
    fail('STATE_COHERENCE','Current player and trick leader must be valid seats',{currentPlayer:state.currentPlayer,trickLeader:state.trickLeader});
  }

  const finished=state.finished||[];
  if(!finished.every(isSeat)||!unique(finished))fail('FINISH_COHERENCE','Finished seats must be unique valid seats',{finished});
  if(state.phase==='play'&&finished.length<3&&finished.includes(state.currentPlayer)){
    fail('TURN_COHERENCE','Finished player cannot be current player',{currentPlayer:state.currentPlayer,finished});
  }

  const maxPasses=Math.max(0,3-finished.length);
  if(!Number.isInteger(state.passes)||state.passes<0||state.passes>maxPasses){
    fail('TURN_COHERENCE','Pass count is outside the active-player range',{passes:state.passes,maxPasses});
  }

  const table=state.table||[];
  if(state.lastPlay===null&&table.length>0)fail('TRICK_COHERENCE','Table cannot be non-empty without lastPlay',{tableLength:table.length});
  if(state.lastPlay!==null&&table.length===0)fail('TRICK_COHERENCE','lastPlay requires a non-empty table');

  if(state.wish!==null&&(!Number.isInteger(state.wish)||state.wish<2||state.wish>14)){
    fail('WISH_COHERENCE','Wish must be null or an integer rank from 2 to 14',{wish:state.wish});
  }

  if(state.dragonRecipient==='needed'){
    const latest=table.at(-1);
    const isDragon=state.phase==='play'&&latest?.cards?.length===1&&latest.cards[0]?.special==='dragon';
    if(!isDragon)fail('DRAGON_COHERENCE','Dragon recipient request requires a winning single Dragon on the table');
  }

  const scores=[...(state.scores||[]),...(state.roundScore||[])];
  if((state.scores||[]).length!==2||(state.roundScore||[]).length!==2||scores.some(value=>!Number.isFinite(value))){
    fail('SCORE_COHERENCE','Scores and round scores must be finite two-team values',{scores:state.scores,roundScore:state.roundScore});
  }
  if(state.phase==='match-end'){
    if(![0,1].includes(state.winnerTeam)||state.scores[0]===state.scores[1]||Math.max(...state.scores)<1000){
      fail('SCORE_COHERENCE','Match end requires a non-tied winner at or above 1000',{winnerTeam:state.winnerTeam,scores:state.scores});
    }
  }
}

function assertExchangeTransition(state,previousState,lastAction){
  if(lastAction?.type!=='submitExchange')return;
  const seat=lastAction.seat;
  const map=lastAction.payload?.map;
  if(!isSeat(seat)||!map||typeof map!=='object')fail('EXCHANGE_COHERENCE','Exchange action requires seat and map',{lastAction});
  const expectedTargets=[0,1,2,3].filter(target=>target!==seat).sort();
  const actualTargets=Object.keys(map).map(Number).sort((a,b)=>a-b);
  if(actualTargets.length!==3||actualTargets.some((target,index)=>target!==expectedTargets[index])){
    fail('EXCHANGE_COHERENCE','Exchange map must target each other player exactly once',{seat,actualTargets,expectedTargets});
  }
  const ids=Object.values(map);
  if(ids.length!==3||!unique(ids))fail('EXCHANGE_COHERENCE','Exchange must use three distinct cards',{seat,ids});
  const owned=new Set(idsOf(previousState?.hands?.[seat]||[]));
  if(ids.some(id=>!owned.has(id)))fail('EXCHANGE_COHERENCE','Exchange card was not owned before the action',{seat,ids});

  if(previousState?.phase==='exchange'&&state.phase==='play'){
    if(!(state.exchangeDone||[]).every(Boolean)||!(state.hands||[]).every(hand=>hand.length===14)){
      fail('EXCHANGE_COHERENCE','Resolved exchange must produce four completed 14-card hands',{exchangeDone:state.exchangeDone,handSizes:state.hands?.map(hand=>hand.length)});
    }
  }
}

function assertScoreTransition(state,previousState){
  if(previousState?.phase!=='play'||!['round-end','match-end'].includes(state.phase))return;
  for(let team=0;team<2;team++){
    const delta=state.scores[team]-previousState.scores[team];
    if(delta!==state.roundScore[team]){
      fail('SCORE_COHERENCE','Round score must equal the match score delta',{team,delta,roundScore:state.roundScore[team]});
    }
  }
}

export function assertSimulationInvariants(state,{expectedDeckIds,previousState=null,lastAction=null}={}){
  if(!state||typeof state!=='object')fail('STATE_COHERENCE','Simulation state is required');
  assertCardConservation(state,expectedDeckIds);
  assertStateCoherence(state);
  assertExchangeTransition(state,previousState,lastAction);
  assertScoreTransition(state,previousState);
  return true;
}
