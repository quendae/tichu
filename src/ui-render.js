import { SUITS, displayRank, classify, beats, canFulfillWishFromSelection, describePlay } from './rules.js';
import { cardArt } from './card-art.js';
import { specialCardHelp } from './coach.js';
import { exchangeComplete } from './ui-state.js';

const $=selector=>document.querySelector(selector);
const suitMap=Object.fromEntries(SUITS.map(suit=>[suit.id,suit]));
const avatarGlyph=['你','美','林','偉'];

export function esc(value){
  return String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  })[char]);
}

export function rankText(rank){return ({11:'J',12:'Q',13:'K',14:'A'})[rank]||String(rank)}
function selectedSet(state){return state.selected instanceof Set?state.selected:new Set(state.selected||[])}

export function cardHTML(card,{back=false,selected=false,clickable=false,legal=false,hinted=false,assigned=false,small=false}={}){
  if(back||card?.hidden)return `<div class="card card-back ${small?'card-small':''}" aria-hidden="true"><span class="back-glyph">天</span></div>`;
  const art=cardArt(card),suit=card.special?null:suitMap[card.suit],help=card.special?specialCardHelp(card):null;
  const classes=['card',card.special?'special':card.suit,selected?'selected':'',legal?'legal-option':'',hinted?'hinted':'',assigned?'assigned':'',small?'card-small':''].filter(Boolean).join(' ');
  const attrs=clickable?`type="button" data-card="${esc(card.id)}"`:'aria-hidden="true"',tag=clickable?'button':'div';
  const glyph=card.special?({mahjong:'麻',dog:'犬',phoenix:'鳳',dragon:'龍'}[card.special]||''):suit?.symbol||'';
  return `<${tag} ${attrs} class="${classes}" aria-label="${esc(art.ariaLabel)}" title="${esc(help?.body||art.ariaLabel)}" style="--card-accent:${art.accent}">
    <span class="card-corner"><strong>${esc(displayRank(card))}</strong><span>${esc(glyph)}</span></span>
    <span class="art-layer ${esc(art.className)}">${art.svg}</span>
    <span class="card-name">${esc(card.special?art.label:suit?.name||'')}</span>
  </${tag}>`;
}

function playerStatus(state,seat){
  const decl=state.declarations?.[seat],handCount=state.hands?.[seat]?.length??0;
  const extras=[`${handCount} kart`];
  if(decl==='grand')extras.push('GRAND TICHU');
  if(decl==='tichu')extras.push('TICHU');
  if(state.finished?.includes(seat))extras.push(`#${state.finished.indexOf(seat)+1} KONIEC`);
  return extras.join(' · ');
}
function assignmentFor(uiState,seat){return uiState.exchangeAssignments?.[seat]||null}

function seatBadgeHTML(state,uiState,seat){
  const exchangeTarget=state.phase==='exchange'&&!state.exchangeDone?.[0]&&seat!==0;
  const dragonTarget=state.dragonRecipient==='needed'&&(seat===1||seat===3);
  const actionable=exchangeTarget||dragonTarget;
  const data=exchangeTarget?`data-exchange-target="${seat}"`:dragonTarget?`data-dragon-target="${seat}"`:'';
  const tag=actionable?'button':'div';
  const relation=seat===0?'TY':seat===2?'PARTNER':'RYWAL';
  return `<${tag} ${actionable?'type="button"':''} ${data} class="player-badge ${actionable?'targetable':''}">
    <span class="avatar"><span class="avatar-glyph">${avatarGlyph[seat]||'·'}</span></span>
    <span class="player-copy"><b>${esc(state.names?.[seat]||`Gracz ${seat+1}`)}</b><small>${esc(playerStatus(state,seat))}</small></span>
    <span class="relation-tag">${relation}</span>
  </${tag}>`;
}

function exchangeSeatChip(state,uiState,seat){
  if(state.phase!=='exchange'||seat===0||state.exchangeDone?.[0])return '';
  const id=assignmentFor(uiState,seat);
  if(!id)return `<button type="button" data-exchange-target="${seat}" class="exchange-seat-chip ${uiState.exchangeTarget===seat?'active':''}"><span>Do ${esc(state.names?.[seat])}</span><small>${seat===2?'partner':'rywal'}</small></button>`;
  return `<button type="button" data-exchange-undo="${seat}" class="exchange-seat-chip assigned-chip" title="Cofnij przekazaną kartę"><span class="tiny-card-back">天</span><span>${esc(state.names?.[seat])} ✓</span><small>kliknij, aby cofnąć</small></button>`;
}

export function renderSeat(state,uiState,coachModel,seat){
  const el=$(`.seat[data-seat="${seat}"]`);if(!el)return;
  const active=state.phase==='play'&&state.currentPlayer===seat;
  const exchangeActive=state.phase==='exchange'&&!state.exchangeDone?.[0]&&uiState.exchangeTarget===seat;
  const dragonTarget=state.dragonRecipient==='needed'&&(seat===1||seat===3);
  el.classList.toggle('active',active);el.classList.toggle('finished',state.finished?.includes(seat));
  el.classList.toggle('exchange-target-active',exchangeActive);el.classList.toggle('dragon-target',dragonTarget);
  const badge=seatBadgeHTML(state,uiState,seat),hand=state.hands?.[seat]||[];
  if(seat===0){
    const selected=selectedSet(state),assignedIds=new Set(Object.values(uiState.exchangeAssignments||{}));
    const cards=hand.map(card=>cardHTML(card,{selected:selected.has(card.id),clickable:state.phase==='play'||(state.phase==='exchange'&&!state.exchangeDone?.[0]),legal:!!coachModel?.legalCardIds?.has(card.id),hinted:uiState.hintCardIds?.has(card.id),assigned:assignedIds.has(card.id)})).join('');
    el.innerHTML=`${badge}<div class="hand player-hand" style="--card-count:${hand.length}">${cards}</div>`;
  }else{
    const backs=Array.from({length:hand.length},()=>cardHTML(null,{back:true})).join('');
    el.innerHTML=`${badge}${exchangeSeatChip(state,uiState,seat)}<div class="hand ${seat===2?'opponent-hand-top':'opponent-hand-side'}" style="--card-count:${hand.length}">${backs}</div>`;
  }
}

function playGroupHTML(state,entry,index,total){
  const latest=index===total-1;
  return `<div class="trick-play seat-origin-${entry.seat} ${latest?'latest':''}" style="--play-index:${index}">
    <div class="played-cards">${(entry.cards||[]).map(card=>cardHTML(card,{small:true})).join('')}</div>
    <span class="play-label">${esc(state.names?.[entry.seat]||'Gracz')} · ${esc(describePlay(entry.play))}</span>
  </div>`;
}
function renderPile(state){
  const pile=$('#table-pile');if(!pile)return;
  if(!state.table?.length){pile.innerHTML='<div class="table-empty">Stół jest pusty</div>';return;}
  pile.innerHTML=`<div class="trick-stage">${state.table.map((entry,index)=>playGroupHTML(state,entry,index,state.table.length)).join('')}</div>`;
}
function renderWishChip(state){const chip=$('#wish-chip');if(!chip)return;chip.classList.toggle('hidden',!state.wish);chip.textContent=state.wish?`ŻYCZENIE MAH JONG · ${rankText(state.wish)}`:''}

function exchangeAssignmentsHTML(state,uiState){
  return [1,2,3].map(seat=>{
    const assigned=assignmentFor(uiState,seat),active=uiState.exchangeTarget===seat&&!assigned;
    return `<button type="button" data-exchange-target="${seat}" class="exchange-recipient ${active?'active':''} ${assigned?'complete':''}">
      <span class="recipient-name">${esc(state.names?.[seat]||`Gracz ${seat+1}`)}</span>
      <small>${seat===2?'TWÓJ PARTNER':'RYWAL'}</small>
      ${assigned?`<span class="recipient-card"><span class="tiny-card-back">天</span><b>Wybrana ✓</b><i data-exchange-undo="${seat}">Cofnij</i></span>`:'<span class="recipient-card empty">Wybierz kartę z ręki</span>'}
    </button>`;
  }).join('');
}

function renderContext(state,uiState){
  const host=$('#context-panel');if(!host)return;host.className='context-panel';
  if(state.phase==='grand'){
    host.innerHTML=state.declarations?.[0]
      ?'<div class="inline-note">Decyzja Grand Tichu zapisana. Czekamy na pozostałych…</div>'
      :`<div class="decision-ribbon grand-ribbon"><div><small>PIERWSZE 8 KART</small><b>Grand Tichu?</b><span>Wyjdziesz pierwszy: +200 · inaczej: −200</span></div><div class="inline-actions"><button type="button" data-inline="grand-pass" class="secondary">Pas</button><button type="button" data-inline="grand-call" class="primary">Grand Tichu +200</button></div></div>`;
    return;
  }
  if(state.phase==='exchange'){
    if(state.exchangeDone?.[0])host.innerHTML='<div class="inline-note"><b>Wymiana zatwierdzona ✓</b><span>Czekamy na pozostałych graczy.</span></div>';
    else{
      const target=Number(uiState.exchangeTarget||1);
      host.innerHTML=`<div class="exchange-controller"><div class="exchange-heading"><small>WYMIANA KART</small><b>Przekaż kartę do ${esc(state.names?.[target]||`gracza ${target+1}`)}</b><span>Kliknij kartę bezpośrednio w swojej ręce. Każdy wybór możesz cofnąć.</span></div><div class="exchange-recipients">${exchangeAssignmentsHTML(state,uiState)}</div><button type="button" data-inline="exchange-confirm" class="primary confirm-exchange" ${exchangeComplete(uiState)?'':'disabled'}>Potwierdź wymianę · ${Object.keys(uiState.exchangeAssignments||{}).length}/3</button></div>`;
    }
    return;
  }
  if(state.dragonRecipient==='needed'){
    host.innerHTML='<div class="decision-ribbon dragon-ribbon"><div><small>LEWA SMOKA</small><b>Oddaj lewę jednemu z rywali</b><span>Kliknij gracza po lewej lub prawej. Kolejny ruch nadal należy do Ciebie.</span></div></div>';return;
  }
  host.innerHTML='';
}

function renderWishBar(uiState){
  const bar=$('#wish-bar');if(!bar)return;
  if(!uiState.wishPicker){bar.classList.add('hidden');bar.innerHTML='';return;}
  const ranks=Array.from({length:13},(_,index)=>index+2);bar.classList.remove('hidden');
  bar.innerHTML=`<div class="wish-inline"><span><small>MAH JONG</small><b>Wybierz życzenie</b></span><div class="wish-ranks">${ranks.map(rank=>`<button type="button" data-wish="${rank}" class="secondary">${rankText(rank)}</button>`).join('')}<button type="button" data-wish="none" class="ghost">Bez życzenia</button></div></div>`;
}

function renderRoundSummary(state){
  const host=$('#round-summary');if(!host)return;
  if(!['round-end','match-end'].includes(state.phase)){host.classList.add('hidden');host.innerHTML='';return;}
  host.classList.remove('hidden');
  if(state.phase==='round-end')host.innerHTML=`<div class="summary-card"><small>RUNDA ${state.round}</small><h2>Koniec rundy</h2><div class="summary-score"><span><b>${state.roundScore?.[0]??0}</b> My</span><i>:</i><span><b>${state.roundScore?.[1]??0}</b> Oni</span></div><p>Wynik meczu ${state.scores?.[0]??0} : ${state.scores?.[1]??0}</p><button type="button" data-inline="next-round" class="primary">Następna runda</button></div>`;
  else host.innerHTML=`<div class="summary-card"><small>KONIEC MECZU</small><h2>${state.winnerTeam===0?'Wygrywacie!':'Wygrywają rywale'}</h2><p>Wynik końcowy ${state.scores?.[0]??0} : ${state.scores?.[1]??0}</p><button type="button" data-inline="new-match" class="primary">Nowy mecz</button></div>`;
}

function renderTurnStatus(state){
  const host=$('#turn-status');if(!host)return;
  if(state.phase==='play')host.textContent=state.currentPlayer===0?'Twój ruch':`Ruch: ${state.names?.[state.currentPlayer]||'rywal'}`;
  else if(state.phase==='exchange')host.textContent=state.exchangeDone?.[0]?'Czekamy na wymianę…':'Wybierz karty do przekazania';
  else if(state.phase==='grand')host.textContent='Decyzja Grand Tichu';else host.textContent='';
}

function selectionPlayable(state){
  if(state.phase!=='play')return false;
  const selected=selectedSet(state),cards=(state.hands?.[0]||[]).filter(card=>selected.has(card.id));
  const play=classify(cards,state.lastPlay?.type==='single'?state.lastPlay.value:null);
  if(!play||!beats(play,state.lastPlay||null))return false;
  const bomb=play.type==='bomb'&&state.currentPlayer!==0;if(state.currentPlayer!==0&&!bomb)return false;
  if(state.wish&&state.currentPlayer===0){
    const options=state.hands?.[0]||[];if(cards.length&&canFulfillWishFromSelection(play,state.wish))return true;
    if(options.some(card=>!card.special&&card.rank===state.wish))return false;
  }
  return true;
}

function renderActions(state){
  const play=$('#play-btn'),pass=$('#pass-btn'),tichu=$('#tichu-btn');
  if(play){play.classList.toggle('hidden',state.phase!=='play');play.disabled=!selectionPlayable(state);}
  if(pass){pass.classList.toggle('hidden',state.phase!=='play');pass.disabled=!(state.phase==='play'&&state.currentPlayer===0&&state.lastPlay);}
  if(tichu){const visible=['exchange','play'].includes(state.phase);tichu.classList.toggle('hidden',!visible);tichu.disabled=!(visible&&(state.hands?.[0]?.length===14)&&!['grand','tichu'].includes(state.declarations?.[0]));}
}

function renderCoach(coachModel,uiState){
  const host=$('#coach-panel');if(!host)return;
  const menuState=$('#coach-menu-state'),menuButton=document.querySelector('.coach-menu');
  if(menuState)menuState.textContent=uiState.coachEnabled?'ON':'OFF';if(menuButton)menuButton.classList.toggle('active',uiState.coachEnabled);
  if(!uiState.coachEnabled||!coachModel){
    host.className='coach-dock coach-off';host.innerHTML='<button type="button" data-action="coach-toggle" class="coach-off-button">🎓 Włącz tryb początkującego</button>';return;
  }
  host.className='coach-dock';
  const verdict=coachModel.selectedLabel?`<span class="coach-verdict ${coachModel.selectedValid?'valid':'invalid'}">${coachModel.selectedValid?'✓':'×'} ${esc(coachModel.selectedLabel)}</span>`:'';
  const options=coachModel.optionCount?`${coachModel.optionCount} ${coachModel.optionCount===1?'możliwy ruch':'możliwe ruchy'}`:'';
  host.innerHTML=`<div class="coach-copy"><span class="coach-kicker">💡 TWÓJ RUCH</span><b>${esc(coachModel.title)}</b><p>${esc(coachModel.body)}</p><div class="coach-meta">${verdict}${options?`<span>${esc(options)}</span>`:''}</div></div><div class="coach-actions"><button type="button" data-action="coach-hint" class="coach-hint" ${coachModel.hintCardIds?.size?'':'disabled'}>Podpowiedz ruch</button><button type="button" data-action="coach-toggle" class="coach-toggle">Coach ON</button></div>`;
}

function renderScores(state){
  $('#score-a').textContent=state.scores?.[0]??0;$('#score-b').textContent=state.scores?.[1]??0;
  const a=$('#team-a-label'),b=$('#team-b-label');if(a)a.textContent='MY';if(b)b.textContent='ONI';
}
function renderFooter(state,uiState){
  const coach=$('#coach-status'),round=$('#round-status'),turn=$('#turn-status-footer'),mode=$('#mode-status');
  if(coach)coach.textContent=`🎓 Coach: ${uiState.coachEnabled?'ON':'OFF'}`;
  if(round)round.textContent=`Runda ${state.round||1}`;
  if(turn)turn.textContent=state.phase==='play'?(state.currentPlayer===0?'Twój ruch':`Ruch: ${state.names?.[state.currentPlayer]||'rywal'}`):state.phase==='exchange'?'Wymiana kart':state.phase==='grand'?'Grand Tichu':'';
  if(mode)mode.textContent=state.multiplayer?'Gra online':'Gra lokalna · 3 boty';
}
function renderLog(state){const host=$('#game-log');if(host)host.innerHTML=(state.log||[]).map(entry=>`<div class="log-item">${esc(entry.text)}</div>`).join('')}

export function renderAll(state,uiState,coachModel){
  renderScores(state);[0,1,2,3].forEach(seat=>renderSeat(state,uiState,coachModel,seat));renderPile(state);renderWishChip(state);renderContext(state,uiState);renderWishBar(uiState);renderRoundSummary(state);renderTurnStatus(state);renderActions(state);renderCoach(coachModel,uiState);renderFooter(state,uiState);renderLog(state);
}