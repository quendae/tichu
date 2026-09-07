export function animateCardTravel(source,target,className='card-travel'){
  if(!source||!target||typeof source.getBoundingClientRect!=='function')return;
  if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const from=source.getBoundingClientRect(),to=target.getBoundingClientRect();
  const clone=source.cloneNode(true);
  clone.removeAttribute?.('data-card');
  clone.classList.add(className);
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

export function animatePlayToPile(source,pile){
  animateCardTravel(source,pile,'card-travel play-travel');
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

export function targetElementForSeat(seat){
  return document.querySelector(`.seat[data-seat="${seat}"] .player-badge`) || document.querySelector(`.seat[data-seat="${seat}"]`);
}
