export const REPLAY_FORMAT='tichu-dev-replay-v1';

const cloneCard=card=>card?{...card}:card;
const clonePlay=play=>play?{...play,cards:(play.cards||[]).map(cloneCard)}:null;

export function normalizeState(state){
  return{
    ...state,
    selected:[...(state.selected||[])],
    hands:(state.hands||[]).map(hand=>hand.map(cloneCard)),
    captured:(state.captured||[]).map(pile=>pile.map(cloneCard)),
    remainingDeck:(state.remainingDeck||[]).map(cloneCard),
    table:(state.table||[]).map(entry=>({seat:entry.seat,cards:entry.cards.map(cloneCard),play:clonePlay(entry.play)})),
    lastPlay:clonePlay(state.lastPlay),
    passSelections:JSON.parse(JSON.stringify(state.passSelections||{})),
    log:(state.log||[]).map(entry=>({...entry})),
  };
}

export function deterministicState(state){
  return{
    phase:state.phase,
    round:state.round,
    currentPlayer:state.currentPlayer,
    trickLeader:state.trickLeader,
    hands:state.hands.map(hand=>hand.map(card=>card.id)),
    remainingDeck:(state.remainingDeck||[]).map(card=>card.id),
    captured:state.captured.map(pile=>pile.map(card=>card.id)),
    table:state.table.map(entry=>({seat:entry.seat,cards:entry.cards.map(card=>card.id),playType:entry.play?.type||null,playValue:entry.play?.value??null})),
    lastPlay:state.lastPlay?{type:state.lastPlay.type,value:state.lastPlay.value??null,cards:state.lastPlay.cards.map(card=>card.id)}:null,
    passes:state.passes,
    wish:state.wish,
    finished:[...state.finished],
    passSelections:JSON.parse(JSON.stringify(state.passSelections||{})),
    exchangeDone:[...state.exchangeDone],
    declarations:[...state.declarations],
    scores:[...state.scores],
    roundScore:[...state.roundScore],
    winnerTeam:state.winnerTeam,
    dragonRecipient:state.dragonRecipient,
    pendingRoundEnd:state.pendingRoundEnd,
  };
}

export function stateSummary(state){
  const text=JSON.stringify(deterministicState(state));
  let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return(hash>>>0).toString(16).padStart(8,'0');
}

export function createReplay({seed,engineVersion,gitSha=null,config,initialState}){
  return{
    format:REPLAY_FORMAT,
    createdAt:new Date().toISOString(),
    seed,
    engineVersion,
    gitSha,
    config:{...config},
    initial:{state:normalizeState(initialState)},
    actions:[],
    checkpoints:[],
    failure:null,
  };
}

export function recordReplayAction(replay,{step,round,seat,type,payload,beforeState,afterState}){
  const action={
    step,round,seat,type,payload:JSON.parse(JSON.stringify(payload||{})),
    summaryBefore:stateSummary(beforeState),
    summaryAfter:stateSummary(afterState),
  };
  replay.actions.push(action);
  return action;
}

export function recordReplayCheckpoint(replay,step,state){
  replay.checkpoints.push({step,state:normalizeState(state)});
}

export function recordReplayFailure(replay,{code,message,step,round,action,beforeState,afterState}){
  replay.failure={
    code,message,step,round,
    action:action?JSON.parse(JSON.stringify(action)):null,
    beforeState:beforeState?normalizeState(beforeState):null,
    afterState:afterState?normalizeState(afterState):null,
    recentActions:replay.actions.slice(-20).map(item=>JSON.parse(JSON.stringify(item))),
    seed:replay.seed,
  };
}

export function validateReplayDocument(replay){
  if(!replay||replay.format!==REPLAY_FORMAT)throw new Error(`Unsupported replay format: ${replay?.format}`);
  if(replay.seed===undefined||replay.seed===null)throw new Error('Replay seed is required');
  if(!replay.initial?.state)throw new Error('Replay initial state is required');
  if(!Array.isArray(replay.actions))throw new Error('Replay actions must be an array');
  return true;
}
