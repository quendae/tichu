const COACH_KEY='tichu.qqnd.coach.v1';

export function createUiState(storage=globalThis.localStorage){
  const stored=storage?.getItem?.(COACH_KEY);
  return {
    coachEnabled: stored===null ? true : stored!=='off',
    hintCardIds:new Set(),
    exchangeAssignments:{},
    exchangeTarget:1,
    wishPicker:false,
    dragonChoice:false,
    transientSeatFeedback:{},
    lastPhase:null,
    lastRound:null,
  };
}

export function setCoachEnabled(ui,enabled,storage=globalThis.localStorage){
  ui.coachEnabled=!!enabled;
  storage?.setItem?.(COACH_KEY,ui.coachEnabled?'on':'off');
  if(!ui.coachEnabled) ui.hintCardIds.clear();
  return ui.coachEnabled;
}

export function assignExchangeCard(ui,targetSeat,cardId){
  if(![1,2,3].includes(Number(targetSeat)) || !cardId) return false;
  for(const [seat,id] of Object.entries(ui.exchangeAssignments)){
    if(id===cardId) delete ui.exchangeAssignments[seat];
  }
  ui.exchangeAssignments[Number(targetSeat)]=cardId;
  return true;
}

export function unassignExchangeTarget(ui,targetSeat){
  delete ui.exchangeAssignments[Number(targetSeat)];
  return true;
}

export function exchangeMap(ui){
  return Object.fromEntries(Object.entries(ui.exchangeAssignments).map(([seat,id])=>[Number(seat),id]));
}

export function exchangeComplete(ui){
  return [1,2,3].every(seat=>!!ui.exchangeAssignments[seat]) && new Set(Object.values(ui.exchangeAssignments)).size===3;
}

export function nextExchangeTarget(ui){
  return [1,2,3].find(seat=>!ui.exchangeAssignments[seat]) ?? 1;
}

export function syncUiState(ui,state){
  const enteringExchange=state.phase==='exchange' && (ui.lastPhase!=='exchange' || ui.lastRound!==state.round);
  if(enteringExchange){
    ui.exchangeAssignments={};
    ui.exchangeTarget=1;
    ui.hintCardIds.clear();
  }
  if(state.phase!=='play') ui.hintCardIds.clear();
  if(state.phase!=='play') ui.wishPicker=false;
  ui.dragonChoice=state.dragonRecipient==='needed';
  ui.lastPhase=state.phase;
  ui.lastRound=state.round;
  return ui;
}
