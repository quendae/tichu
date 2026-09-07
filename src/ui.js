import { TichuGame } from './game.js';
import { MultiplayerClient } from './multiplayer.js';
import { buildCoachModel } from './coach.js';
import {
  createUiState,setCoachEnabled,syncUiState,assignExchangeCard,unassignExchangeTarget,
  exchangeMap,exchangeComplete,nextExchangeTarget,
} from './ui-state.js';
import { renderAll } from './ui-render.js';
import { animateCardTravel,animatePlayToPile,flashSeat,targetElementForSeat } from './ui-interactions.js';

const game=new TichuGame();
const mp=new MultiplayerClient(game);
const uiState=createUiState();
const $=selector=>document.querySelector(selector);
let toastTimer=null;
let lastLogId=null;

function toast(text){
  const node=$('#toast');if(!node)return;
  node.textContent=text;node.classList.remove('hidden');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.add('hidden'),2800);
}

function modal(html){
  $('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal">${html}</section></div>`;
}
function closeModal(){$('#modal-root').innerHTML=''}

function showRules(){
  modal(`<h2>Tichu · quick rules</h2>
    <div class="rule-columns">
      <h3>Goal</h3><p>Four players form two partnerships: you play with the player opposite you. Get rid of your cards and collect scoring cards. The first team to at least 1000 points wins.</p>
      <h3>How a trick works</h3><p>The leader plays a combination. Each next player must play the same kind of combination with a higher value, play a bomb, or pass. After everyone else passes, the last player who played cards takes the trick and leads again.</p>
      <h3>Combinations</h3><ul><li>single, pair, triple</li><li>full house</li><li>straight of 5+ cards</li><li>consecutive pairs</li><li>bomb: four of a kind or a 5+ straight flush</li></ul>
      <h3>Special cards</h3><p><b>Mah Jong</b> is rank 1 and may make a wish. <b>Dog</b> is led alone and gives the lead to your partner. <b>Phoenix</b> is a flexible wildcard and −25 points. <b>Dragon</b> is the highest single and +25 points, but a Dragon-won trick must be given to an opponent.</p>
      <h3>Card points</h3><p>5 = 5 points. 10 and K = 10. Dragon = +25. Phoenix = −25. If one partnership finishes first and second, it scores a 200–0 double victory.</p>
      <h3>Tichu calls</h3><p><b>Tichu</b>: call before playing your first card while you still hold all 14 cards, worth ±100. <b>Grand Tichu</b>: decide after seeing only the first 8 cards, worth ±200. The bet succeeds only if you personally go out first.</p>
      <h3>Beginner Coach</h3><p>Coach highlights cards that belong to legal moves, explains the current combination, and can suggest a move with Hint. It never sees hidden opponent cards and never plays for you.</p>
    </div><div class="modal-actions"><button data-modal="close" class="primary">Close</button></div>`);
}

function runAction(type,payload={},localFn=null){
  if(mp.active){mp.action(type,payload);return {ok:true};}
  return localFn?localFn():{ok:false};
}

function logFeedback(state){
  const newest=state.log?.[0];
  if(!newest){lastLogId=null;return;}
  if(lastLogId&&newest.id!==lastLogId){
    const pass=newest.text.match(/^(.+?) passes\.$/);
    const tichu=newest.text.match(/^(.+?) calls Tichu!$/);
    if(pass){const seat=state.names?.findIndex(name=>name===pass[1]);if(seat>=0)setTimeout(()=>flashSeat(seat,'PASS'),0);}
    if(tichu){const seat=state.names?.findIndex(name=>name===tichu[1]);if(seat>=0)setTimeout(()=>flashSeat(seat,'TICHU!'),0);}
  }
  lastLogId=newest.id;
}

function render(state=game.state){
  syncUiState(uiState,state);
  const coachModel=buildCoachModel(state,uiState);
  renderAll(state,uiState,coachModel);
  logFeedback(state);
}

function selectedCards(){
  const selected=game.state.selected instanceof Set?game.state.selected:new Set(game.state.selected||[]);
  return (game.state.hands?.[0]||[]).filter(card=>selected.has(card.id));
}

function animateSelectedToPile(){
  const selected=game.state.selected instanceof Set?[...game.state.selected]:[...(game.state.selected||[])];
  const source=selected.length?document.querySelector(`[data-card="${CSS.escape(selected[0])}"]`):null;
  if(source)animatePlayToPile(source,$('#table-pile'));
}

function playHuman(){
  const state=game.state,cards=selectedCards();
  if(!cards.length)return;
  if(cards.some(card=>card.special==='mahjong')){
    uiState.wishPicker=true;uiState.hintCardIds.clear();render();return;
  }
  animateSelectedToPile();
  const play=game.selectedPlay?.();
  const bomb=play?.type==='bomb'&&state.currentPlayer!==0;
  const result=runAction('play',{ids:[...(state.selected instanceof Set?state.selected:new Set(state.selected||[]))],wishRank:null,bomb},()=>game.playSelected());
  uiState.hintCardIds.clear();
  if(result&&!result.ok)toast(result.error);
}

function submitWish(value){
  const rank=value==='none'?null:Number(value);
  uiState.wishPicker=false;
  animateSelectedToPile();
  const state=game.state;
  const selected=state.selected instanceof Set?[...state.selected]:[...(state.selected||[])];
  const play=game.selectedPlay?.();
  const bomb=play?.type==='bomb'&&state.currentPlayer!==0;
  const result=runAction('play',{ids:selected,wishRank:rank,bomb},()=>game.playSelected(rank));
  uiState.hintCardIds.clear();
  if(result&&!result.ok)toast(result.error);
}

function handleExchangeCard(cardElement){
  const state=game.state;
  if(state.phase!=='exchange'||state.exchangeDone?.[0])return;
  const target=Number(uiState.exchangeTarget||1);
  animateCardTravel(cardElement,targetElementForSeat(target));
  assignExchangeCard(uiState,target,cardElement.dataset.card);
  const next=[1,2,3].find(seat=>!uiState.exchangeAssignments[seat]);
  if(next)uiState.exchangeTarget=next;
  uiState.hintCardIds.clear();
  render();
}

function submitExchange(){
  if(!exchangeComplete(uiState)){toast('Choose one different card for each other player.');return;}
  const map=exchangeMap(uiState);
  if(mp.active){mp.action('exchange',{map});toast('Exchange sent.');return;}
  if(!game.submitExchange(0,map))toast('Invalid exchange.');
}

function coachHint(){
  const model=buildCoachModel(game.state,uiState);
  if(!model?.hintCardIds?.size){toast('No hint is needed here.');return;}
  uiState.hintCardIds=new Set(model.hintCardIds);
  render();
}

function handleInline(action){
  if(action==='grand-call'||action==='grand-pass'){
    runAction('grand',{call:action==='grand-call'},()=>game.declareGrand(0,action==='grand-call'));return;
  }
  if(action==='exchange-confirm'){submitExchange();return;}
  if(action==='next-round'){runAction('next-round',{},()=>game.nextRound());return;}
  if(action==='new-match'){runAction('new-match',{},()=>game.resetMatch());return;}
}

document.addEventListener('click',event=>{
  const undo=event.target.closest('[data-exchange-undo]');
  if(undo){
    event.stopPropagation();
    const seat=Number(undo.dataset.exchangeUndo);unassignExchangeTarget(uiState,seat);uiState.exchangeTarget=seat;render();return;
  }

  const card=event.target.closest('[data-card]');
  if(card){
    if(game.state.phase==='exchange'){handleExchangeCard(card);return;}
    if(game.state.phase==='play'){game.select(card.dataset.card);uiState.hintCardIds.clear();return;}
  }

  const exchangeTarget=event.target.closest('[data-exchange-target]');
  if(exchangeTarget&&game.state.phase==='exchange'){
    uiState.exchangeTarget=Number(exchangeTarget.dataset.exchangeTarget);uiState.hintCardIds.clear();render();return;
  }

  const dragonTarget=event.target.closest('[data-dragon-target]');
  if(dragonTarget){
    const seat=Number(dragonTarget.dataset.dragonTarget);
    runAction('dragon',{seat},()=>game.chooseDragonRecipient(seat));return;
  }

  const wish=event.target.closest('[data-wish]')?.dataset.wish;
  if(wish){submitWish(wish);return;}

  const inline=event.target.closest('[data-inline]')?.dataset.inline;
  if(inline){handleInline(inline);return;}

  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='play'){playHuman();return;}
  if(action==='pass'){
    uiState.hintCardIds.clear();
    if(mp.active)mp.action('pass');else if(!game.pass(0))toast(game.state.wish?'You must fulfill the wish if possible.':'Cannot pass.');
    return;
  }
  if(action==='call-tichu'){runAction('tichu',{},()=>game.declareTichu(0));return;}
  if(action==='new-match'){runAction('new-match',{},()=>game.resetMatch());return;}
  if(action==='open-log'){$('#log-panel').classList.remove('hidden');return;}
  if(action==='close-drawer'){$('#log-panel').classList.add('hidden');return;}
  if(action==='open-rules'){showRules();return;}
  if(action==='open-multiplayer'){mp.openLobby();return;}
  if(action==='coach-toggle'){setCoachEnabled(uiState,!uiState.coachEnabled);render();return;}
  if(action==='coach-hint'){coachHint();return;}

  const modalAction=event.target.closest('[data-modal]')?.dataset.modal;
  if(modalAction==='close')closeModal();
});

document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(uiState.wishPicker){uiState.wishPicker=false;render();return;}
  if(uiState.hintCardIds.size){uiState.hintCardIds.clear();render();return;}
  $('#log-panel')?.classList.add('hidden');
});

game.addEventListener('change',event=>render(event.detail));
window.tichu={game,mp,uiState};
game.resetMatch();
