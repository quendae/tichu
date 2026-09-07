import { TichuGame } from './game.js';
import { MultiplayerClient } from './multiplayer.js';
import { buildCoachModel } from './coach.js';
import {
  createUiState,setCoachEnabled,syncUiState,assignExchangeCard,unassignExchangeTarget,
  exchangeMap,exchangeComplete,
} from './ui-state.js';
import { renderAll } from './ui-render.js';
import { animateCardTravel,animatePlayToPile,flashSeat,targetElementForSeat } from './ui-interactions.js';

const game=new TichuGame();
const mp=new MultiplayerClient(game);
const uiState=createUiState();
const $=selector=>document.querySelector(selector);
let toastTimer=null,lastLogId=null;

function toast(text){const node=$('#toast');if(!node)return;node.textContent=text;node.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.add('hidden'),2800)}
function modal(html){$('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal">${html}</section></div>`}
function closeModal(){$('#modal-root').innerHTML=''}

function showRules(){
  modal(`<h2>Tichu · szybkie zasady</h2>
    <div class="rule-columns">
      <h3>Cel</h3><p>Czterech graczy tworzy dwie drużyny. Twoim partnerem jest gracz naprzeciwko. Pozbądź się kart i zbieraj karty punktowe. Pierwsza drużyna z co najmniej 1000 punktów wygrywa.</p>
      <h3>Jak działa lewa</h3><p>Gracz wychodzący zagrywa kombinację. Kolejni muszą zagrać ten sam typ kombinacji o wyższej wartości, bombę albo spasować. Gdy wszyscy pozostali spasują, ostatni gracz, który zagrał karty, bierze lewę i wychodzi ponownie.</p>
      <h3>Kombinacje</h3><ul><li>pojedyncza karta, para, trójka</li><li>full house</li><li>strit z 5+ kart</li><li>kolejne pary</li><li>bomba: kareta albo poker z 5+ kart</li></ul>
      <h3>Karty specjalne</h3><p><b>Mah Jong</b> ma wartość 1 i pozwala wypowiedzieć życzenie. <b>Pies</b> przekazuje wyjście partnerowi. <b>Feniks</b> działa jak elastyczny joker i jest wart −25 punktów. <b>Smok</b> to najwyższa pojedyncza karta i +25 punktów, ale wygraną nim lewę trzeba oddać rywalowi.</p>
      <h3>Punkty</h3><p>5 = 5 pkt. 10 i K = 10 pkt. Smok = +25. Feniks = −25. Jeśli partnerzy wyjdą jako pierwsi i drudzy, zdobywają 200–0 za rundę.</p>
      <h3>Tichu</h3><p><b>Tichu</b>: deklarujesz, zanim zagrasz pierwszą kartę i nadal masz pełne 14 kart; stawka ±100. <b>Grand Tichu</b>: decyzja po zobaczeniu pierwszych 8 kart; stawka ±200. Zakład wygrywasz tylko wtedy, gdy osobiście wyjdziesz pierwszy.</p>
      <h3>Tryb początkującego</h3><p>Coach podświetla karty należące do legalnych ruchów, wyjaśnia bieżącą sytuację i może wskazać ruch. Nigdy nie widzi ukrytych kart przeciwników i nie gra za Ciebie.</p>
    </div><div class="modal-actions"><button data-modal="close" class="primary">Zamknij</button></div>`);
}

function runAction(type,payload={},localFn=null){if(mp.active){mp.action(type,payload);return {ok:true}}return localFn?localFn():{ok:false}}
function logFeedback(state){
  const newest=state.log?.[0];if(!newest){lastLogId=null;return}
  if(lastLogId&&newest.id!==lastLogId){
    const pass=newest.text.match(/^(.+?) passes\.$/),tichu=newest.text.match(/^(.+?) calls Tichu!$/);
    if(pass){const seat=state.names?.findIndex(name=>name===pass[1]);if(seat>=0)setTimeout(()=>flashSeat(seat,'PASS'),0)}
    if(tichu){const seat=state.names?.findIndex(name=>name===tichu[1]);if(seat>=0)setTimeout(()=>flashSeat(seat,'TICHU!'),0)}
  }
  lastLogId=newest.id;
}
function render(state=game.state){syncUiState(uiState,state);renderAll(state,uiState,buildCoachModel(state,uiState));logFeedback(state)}
function selectedCards(){const selected=game.state.selected instanceof Set?game.state.selected:new Set(game.state.selected||[]);return (game.state.hands?.[0]||[]).filter(card=>selected.has(card.id))}
function animateSelectedToPile(){const selected=game.state.selected instanceof Set?[...game.state.selected]:[...(game.state.selected||[])];const source=selected.length?document.querySelector(`[data-card="${CSS.escape(selected[0])}"]`):null;if(source)animatePlayToPile(source,$('#table-pile'))}

function playHuman(){
  const state=game.state,cards=selectedCards();if(!cards.length)return;
  if(cards.some(card=>card.special==='mahjong')){uiState.wishPicker=true;uiState.hintCardIds.clear();render();return}
  animateSelectedToPile();const play=game.selectedPlay?.(),bomb=play?.type==='bomb'&&state.currentPlayer!==0;
  const result=runAction('play',{ids:[...(state.selected instanceof Set?state.selected:new Set(state.selected||[]))],wishRank:null,bomb},()=>game.playSelected());uiState.hintCardIds.clear();if(result&&!result.ok)toast(result.error);
}
function submitWish(value){
  const rank=value==='none'?null:Number(value);uiState.wishPicker=false;animateSelectedToPile();const state=game.state,selected=state.selected instanceof Set?[...state.selected]:[...(state.selected||[])];const play=game.selectedPlay?.(),bomb=play?.type==='bomb'&&state.currentPlayer!==0;
  const result=runAction('play',{ids:selected,wishRank:rank,bomb},()=>game.playSelected(rank));uiState.hintCardIds.clear();if(result&&!result.ok)toast(result.error);
}
function handleExchangeCard(cardElement){
  const state=game.state;if(state.phase!=='exchange'||state.exchangeDone?.[0])return;
  const target=Number(uiState.exchangeTarget||1);animateCardTravel(cardElement,targetElementForSeat(target));assignExchangeCard(uiState,target,cardElement.dataset.card);
  const next=[1,2,3].find(seat=>!uiState.exchangeAssignments[seat]);if(next)uiState.exchangeTarget=next;uiState.hintCardIds.clear();render();
}
function submitExchange(){
  if(!exchangeComplete(uiState)){toast('Wybierz po jednej różnej karcie dla każdego z pozostałych graczy.');return}
  const map=exchangeMap(uiState);if(mp.active){mp.action('exchange',{map});toast('Wymiana wysłana.');return}if(!game.submitExchange(0,map))toast('Nieprawidłowa wymiana.');
}
function coachHint(){const model=buildCoachModel(game.state,uiState);if(!model?.hintCardIds?.size){toast('W tej chwili nie ma ruchu do podpowiedzenia.');return}uiState.hintCardIds=new Set(model.hintCardIds);render()}
function handleInline(action){
  if(action==='grand-call'||action==='grand-pass'){runAction('grand',{call:action==='grand-call'},()=>game.declareGrand(0,action==='grand-call'));return}
  if(action==='exchange-confirm'){submitExchange();return}if(action==='next-round'){runAction('next-round',{},()=>game.nextRound());return}if(action==='new-match')runAction('new-match',{},()=>game.resetMatch());
}

document.addEventListener('click',event=>{
  const undo=event.target.closest('[data-exchange-undo]');if(undo){event.stopPropagation();const seat=Number(undo.dataset.exchangeUndo);unassignExchangeTarget(uiState,seat);uiState.exchangeTarget=seat;render();return}
  const card=event.target.closest('[data-card]');if(card){if(game.state.phase==='exchange'){handleExchangeCard(card);return}if(game.state.phase==='play'){game.select(card.dataset.card);uiState.hintCardIds.clear();return}}
  const exchangeTarget=event.target.closest('[data-exchange-target]');if(exchangeTarget&&game.state.phase==='exchange'){uiState.exchangeTarget=Number(exchangeTarget.dataset.exchangeTarget);uiState.hintCardIds.clear();render();return}
  const dragonTarget=event.target.closest('[data-dragon-target]');if(dragonTarget){const seat=Number(dragonTarget.dataset.dragonTarget);runAction('dragon',{seat},()=>game.chooseDragonRecipient(seat));return}
  const wish=event.target.closest('[data-wish]')?.dataset.wish;if(wish){submitWish(wish);return}
  const inline=event.target.closest('[data-inline]')?.dataset.inline;if(inline){handleInline(inline);return}
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='play'){playHuman();return}
  if(action==='pass'){uiState.hintCardIds.clear();if(mp.active)mp.action('pass');else if(!game.pass(0))toast(game.state.wish?'Musisz spełnić życzenie, jeśli możesz zrobić to legalnie.':'Nie możesz teraz spasować.');return}
  if(action==='call-tichu'){runAction('tichu',{},()=>game.declareTichu(0));return}if(action==='new-match'){runAction('new-match',{},()=>game.resetMatch());return}
  if(action==='open-log'){$('#log-panel').classList.remove('hidden');return}if(action==='close-drawer'){$('#log-panel').classList.add('hidden');return}
  if(action==='open-rules'){showRules();return}if(action==='open-multiplayer'){mp.openLobby();return}
  if(action==='coach-toggle'){setCoachEnabled(uiState,!uiState.coachEnabled);render();return}if(action==='coach-hint'){coachHint();return}
  const modalAction=event.target.closest('[data-modal]')?.dataset.modal;if(modalAction==='close')closeModal();
});
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(uiState.wishPicker){uiState.wishPicker=false;render();return}if(uiState.hintCardIds.size){uiState.hintCardIds.clear();render();return}$('#log-panel')?.classList.add('hidden')});
game.addEventListener('change',event=>render(event.detail));window.tichu={game,mp,uiState};game.resetMatch();
