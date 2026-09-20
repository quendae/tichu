from pathlib import Path

path = Path('src/ui-render.js')
text = path.read_text(encoding='utf-8')
old = '''function renderCoach(coachModel,uiState){
  const host=$('#coach-panel');if(!host)return;
  const menuState=$('#coach-menu-state'),menuButton=document.querySelector('.coach-menu');
  if(menuState)menuState.textContent=uiState.coachEnabled?'ON':'OFF';if(menuButton)menuButton.classList.toggle('active',uiState.coachEnabled);
  if(!uiState.coachEnabled||!coachModel){
    host.className='coach-dock coach-off';host.innerHTML='<button type="button" data-action="coach-toggle" class="coach-off-button">🎓 Włącz tryb początkującego</button>';return;
  }
  host.className='coach-dock';
  const verdict=coachModel.selectedLabel?`<div class="coach-selection ${coachModel.selectedValid?'valid':'invalid'}"><b>${coachModel.selectedValid?'✓':'×'} ${esc(coachModel.selectedLabel)}</b>${coachModel.selectedReason?`<span>${esc(coachModel.selectedReason)}</span>`:''}</div>`:'';
  const options=coachModel.optionCount?`${coachModel.optionCount} ${coachModel.optionCount===1?'możliwy ruch':'możliwe ruchy'}`:'';
  host.innerHTML=`<div class="coach-window-head"><button class="coach-drag-handle" type="button" aria-label="Przenieś Coacha">🎓 COACH TICHU</button><button data-action="reset-coach-position" type="button" class="coach-position-reset" aria-label="Przywróć pozycję Coacha">↺</button></div><div class="coach-copy"><div class="coach-guide"><div data-coach-section="goal"><small>Cel</small><b>${esc(coachModel.goal)}</b></div><div data-coach-section="action"><small>Teraz</small><span>${esc(coachModel.action)}</span></div><div data-coach-section="reason"><small>Dlaczego</small><span>${esc(coachModel.reason)}</span></div></div>${verdict}<div class="coach-meta">${options?`<span>${esc(options)}</span>`:''}</div></div><div class="coach-actions"><button type="button" data-action="coach-hint" class="coach-hint" ${coachModel.hintCardIds?.size?'':'disabled'}>Podpowiedz ruch</button><button type="button" data-action="coach-toggle" class="coach-toggle">Coach ON</button></div>`;
}
'''
new = '''function coachRenderKey(coachModel,uiState){
  if(!uiState.coachEnabled||!coachModel)return `off:${uiState.coachEnabled?'1':'0'}:${coachModel?'1':'0'}`;
  return JSON.stringify([
    'on',coachModel.goal,coachModel.action,coachModel.reason,
    coachModel.selectedLabel||'',!!coachModel.selectedValid,coachModel.selectedReason||'',
    coachModel.optionCount||0,coachModel.hintCardIds?.size||0,
  ]);
}
function renderCoach(coachModel,uiState){
  const host=$('#coach-panel');if(!host)return;
  const menuState=$('#coach-menu-state'),menuButton=document.querySelector('.coach-menu');
  if(menuState)menuState.textContent=uiState.coachEnabled?'ON':'OFF';if(menuButton)menuButton.classList.toggle('active',uiState.coachEnabled);
  const renderKey=coachRenderKey(coachModel,uiState);
  if(host.dataset.renderKey===renderKey)return;
  host.dataset.renderKey=renderKey;
  if(!uiState.coachEnabled||!coachModel){
    host.className='coach-dock coach-off';host.innerHTML='<button type="button" data-action="coach-toggle" class="coach-off-button">🎓 Włącz tryb początkującego</button>';return;
  }
  host.className='coach-dock';
  const verdict=coachModel.selectedLabel?`<div class="coach-selection ${coachModel.selectedValid?'valid':'invalid'}"><b>${coachModel.selectedValid?'✓':'×'} ${esc(coachModel.selectedLabel)}</b>${coachModel.selectedReason?`<span>${esc(coachModel.selectedReason)}</span>`:''}</div>`:'';
  const options=coachModel.optionCount?`${coachModel.optionCount} ${coachModel.optionCount===1?'możliwy ruch':'możliwe ruchy'}`:'';
  host.innerHTML=`<div class="coach-window-head"><button class="coach-drag-handle" type="button" aria-label="Przenieś Coacha">🎓 COACH TICHU</button><button data-action="reset-coach-position" type="button" class="coach-position-reset" aria-label="Przywróć pozycję Coacha">↺</button></div><div class="coach-copy"><div class="coach-guide"><div data-coach-section="goal"><small>Cel</small><b>${esc(coachModel.goal)}</b></div><div data-coach-section="action"><small>Teraz</small><span>${esc(coachModel.action)}</span></div><div data-coach-section="reason"><small>Dlaczego</small><span>${esc(coachModel.reason)}</span></div></div>${verdict}<div class="coach-meta">${options?`<span>${esc(options)}</span>`:''}</div></div><div class="coach-actions"><button type="button" data-action="coach-hint" class="coach-hint" ${coachModel.hintCardIds?.size?'':'disabled'}>Podpowiedz ruch</button><button type="button" data-action="coach-toggle" class="coach-toggle">Coach ON</button></div>`;
}
'''

if old in text:
    text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')
    print('patched src/ui-render.js')
elif 'function coachRenderKey(coachModel,uiState)' in text:
    print('already patched')
else:
    raise SystemExit('expected renderCoach block not found')
