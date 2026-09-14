export function animateCardTravel(source,target,className='card-travel'){
  if(!source||!target||typeof source.getBoundingClientRect!=='function')return;
  if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const from=source.getBoundingClientRect(),to=target.getBoundingClientRect();
  const clone=source.cloneNode(true);
  clone.removeAttribute?.('data-card');
  clone.classList.add(...className.split(/\s+/).filter(Boolean));
  Object.assign(clone.style,{
    position:'fixed',left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`,
    margin:'0',zIndex:'300',pointerEvents:'none',transformOrigin:'center center',
  });
  document.body.appendChild(clone);
  const dx=(to.left+to.width/2)-(from.left+from.width/2);
  const dy=(to.top+to.height/2)-(from.top+from.height/2);
  const animation=clone.animate([
    {transform:'translate(0,0) rotate(0deg) scale(1)',opacity:1},
    {transform:`translate(${dx*.52}px,${dy*.45-28}px) rotate(4deg) scale(.92)`,opacity:.96,offset:.55},
    {transform:`translate(${dx}px,${dy}px) rotate(-7deg) scale(.45)`,opacity:.12},
  ],{duration:430,easing:'cubic-bezier(.2,.8,.2,1)'});
  animation.onfinish=()=>clone.remove();
  animation.oncancel=()=>clone.remove();
}

function rectOf(element){
  if(!element?.getBoundingClientRect)return null;
  const {left,top,width,height}=element.getBoundingClientRect();
  return {left,top,width,height};
}

function sourceRecord(element,cardId,role){
  const rect=rectOf(element);
  if(!element||!rect)return null;
  return {cardId,role,rect,template:element.cloneNode(true)};
}

function handSources(transition,root){
  if(transition.seat===0){
    return transition.cardIds.map(cardId=>{
      const escaped=globalThis.CSS?.escape?CSS.escape(cardId):cardId.replace(/["\\]/g,'\\$&');
      return sourceRecord(root.querySelector(`[data-card="${escaped}"]`),cardId,'play');
    }).filter(Boolean);
  }
  const cards=[...root.querySelectorAll(`.seat[data-seat="${transition.seat}"] [data-card-zone="opponent"] .card`)];
  const edge=cards.at(-1);
  return transition.cardIds.map(cardId=>sourceRecord(edge,cardId,'play')).filter(Boolean);
}

function tableSources(transition,root){
  const allowed=new Set(transition.kind==='play-and-collect'?transition.tableCardIds:transition.cardIds);
  return [...root.querySelectorAll('[data-card-zone="table"] [data-card-id]')]
    .filter(element=>allowed.has(element.dataset.cardId))
    .map(element=>sourceRecord(element,element.dataset.cardId,'table'))
    .filter(source=>source&&source.rect.width>0&&source.rect.height>0);
}

export function captureTransitionSources(transitions,root=document){
  return transitions.map(transition=>({
    transition,
    playSources:['play','play-and-collect'].includes(transition.kind)?handSources(transition,root):[],
    tableSources:['collect','play-and-collect'].includes(transition.kind)?tableSources(transition,root):[],
  }));
}

function appendMotionClone(source,transition,index,targetRect,documentRef){
  const clone=source.template.cloneNode(true);
  clone.removeAttribute?.('data-card');
  clone.setAttribute('aria-hidden','true');
  clone.tabIndex=-1;
  clone.dataset.motionKind=transition.kind;
  clone.dataset.motionSeat=String(transition.seat??transition.recipient);
  clone.dataset.motionDestination=transition.kind==='play'?'table':`seat-${transition.recipient}`;
  clone.dataset.motionCard=source.cardId;
  clone.dataset.motionRole=source.role;
  clone.classList.add('card-travel-clone');
  const from=source.rect;
  Object.assign(clone.style,{
    position:'fixed',left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`,
    margin:'0',zIndex:'999',pointerEvents:'none',transformOrigin:'center center',
  });
  documentRef.body.appendChild(clone);
  const dx=(targetRect.left+targetRect.width/2)-(from.left+from.width/2);
  const dy=(targetRect.top+targetRect.height/2)-(from.top+from.height/2);
  let keyframes;
  if(transition.kind==='play'){
    keyframes=[
      {transform:'translate(0,0) rotate(0deg) scale(1)',opacity:1},
      {transform:`translate(${dx*.55}px,${dy*.48-28}px) rotate(4deg) scale(.94)`,opacity:.96,offset:.55},
      {transform:`translate(${dx}px,${dy}px) rotate(-5deg) scale(.72)`,opacity:.08},
    ];
  }else if(transition.kind==='play-and-collect'&&source.role==='play'){
    keyframes=[
      {transform:'translate(0,0) rotate(0deg) scale(1)',opacity:1},
      {transform:`translate(${dx*.48}px,${dy*.35-24}px) rotate(4deg) scale(.9)`,opacity:.96,offset:.48},
      {transform:`translate(${dx}px,${dy}px) rotate(-4deg) scale(.58)`,opacity:.08},
    ];
  }else{
    keyframes=[
      {transform:'translate(0,0) rotate(0deg) scale(1)',opacity:1},
      {transform:`translate(${dx}px,${dy}px) rotate(-4deg) scale(.58)`,opacity:.08},
    ];
  }
  const animation=clone.animate(keyframes,{
    duration:transition.kind==='play'?430:380,
    delay:index*35,
    easing:'cubic-bezier(.2,.8,.2,1)',
    fill:'both',
  });
  const cleanup=()=>clone.remove();
  animation.onfinish=cleanup;
  animation.oncancel=cleanup;
  return animation;
}

function revealPlayDestination(root,sourceCount){
  if(sourceCount<1)return null;
  const destination=root.querySelector('#table-pile .trick-play.latest');
  if(!destination?.animate)return null;
  const duration=430+Math.max(0,sourceCount-1)*35;
  destination.dataset.motionReveal='play';
  destination.dataset.motionDestination='table';
  destination.style.opacity='0';
  const animation=destination.animate([
    {opacity:0},
    {opacity:0,offset:.62},
    {opacity:1},
  ],{duration,easing:'cubic-bezier(.2,.8,.2,1)'});
  const cleanup=()=>{
    destination.style.removeProperty('opacity');
    delete destination.dataset.motionReveal;
    delete destination.dataset.motionDestination;
  };
  animation.onfinish=cleanup;
  animation.oncancel=cleanup;
  return animation;
}

export function runVisualTransitions(transitions,sources,{enabled=true,root=document}={}){
  if(!enabled||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return [];
  const animations=[];
  for(let transitionIndex=0;transitionIndex<transitions.length;transitionIndex++){
    const transition=transitions[transitionIndex],captured=sources[transitionIndex];
    if(!captured)continue;
    const target=transition.kind==='play'
      ?root.querySelector('#table-pile')
      :targetElementForSeat(transition.recipient,root);
    const targetRect=rectOf(target);
    if(!targetRect)continue;
    const motionSources=transition.kind==='play'
      ?captured.playSources
      :transition.kind==='collect'
        ?captured.tableSources
        :[...captured.playSources,...captured.tableSources];
    if(transition.kind==='play'){
      const reveal=revealPlayDestination(root,motionSources.length);
      if(reveal)animations.push(reveal);
    }
    motionSources.forEach((source,index)=>animations.push(appendMotionClone(source,transition,index,targetRect,root)));
  }
  return animations;
}

export function flashSeat(seat,text='PASS',duration=900){
  const host=document.querySelector(`.seat[data-seat="${seat}"]`);
  if(!host)return;
  host.querySelector('.seat-feedback')?.remove();
  const badge=document.createElement('div');
  badge.className='seat-feedback';
  badge.textContent=text;
  host.appendChild(badge);
  setTimeout(()=>badge.remove(),duration);
}

export function targetElementForSeat(seat,root=document){
  return root.querySelector(`.seat[data-seat="${seat}"] .player-badge`) || root.querySelector(`.seat[data-seat="${seat}"]`);
}
