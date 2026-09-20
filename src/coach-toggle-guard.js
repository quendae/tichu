import {setCoachEnabled} from './ui-state.js';

const activePointers=new Set();
let suppressClickUntil=0;

function coachToggleTarget(event){
  return event.target?.closest?.('#coach-panel [data-action="coach-toggle"]')||null;
}

function toggleCoach(){
  const app=window.tichu;
  if(!app?.game||!app?.uiState)return false;
  setCoachEnabled(app.uiState,!app.uiState.coachEnabled);
  app.game.dispatchEvent(new CustomEvent('change',{detail:app.game.state}));
  return true;
}

document.addEventListener('pointerdown',event=>{
  if(!coachToggleTarget(event))return;
  activePointers.add(event.pointerId);
},true);

document.addEventListener('pointerup',event=>{
  if(!activePointers.delete(event.pointerId))return;
  if(!toggleCoach())return;
  suppressClickUntil=performance.now()+500;
  event.preventDefault();
},true);

document.addEventListener('pointercancel',event=>{
  activePointers.delete(event.pointerId);
},true);

document.addEventListener('click',event=>{
  if(performance.now()>suppressClickUntil||!coachToggleTarget(event))return;
  suppressClickUntil=0;
  event.preventDefault();
  event.stopImmediatePropagation();
},true);
