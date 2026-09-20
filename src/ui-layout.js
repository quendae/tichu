const LAYOUT_KEY='tichu.qqnd.desktop-layout.v1';
const COACH_POSITION_KEY='tichu.qqnd.coach-position.v1';

export const DESKTOP_UI_DEFAULTS=Object.freeze({
  localCardWidth:104,
  opponentCardWidth:96,
  localHandStep:72,
  opponentHandStep:34,
  badgeScale:100,
  playedCardStep:54,
  coachTextScale:100,
});

export const DEV_UI_CONTROLS=Object.freeze({
  localCardWidth:{label:'Karty gracza',min:92,max:124,step:1,unit:'px'},
  opponentCardWidth:{label:'Karty przeciwników i stołu',min:80,max:112,step:1,unit:'px'},
  localHandStep:{label:'Odstęp ręki gracza',min:48,max:84,step:1,unit:'px'},
  opponentHandStep:{label:'Odstęp wachlarzy przeciwników',min:22,max:48,step:1,unit:'px'},
  badgeScale:{label:'Skala plakietek',min:85,max:125,step:1,unit:'%'},
  playedCardStep:{label:'Odstęp kart na stole',min:34,max:72,step:1,unit:'px'},
  coachTextScale:{label:'Skala tekstu Coacha',min:85,max:130,step:1,unit:'%'},
});

function validatedValue(key,rawValue){
  const control=DEV_UI_CONTROLS[key];
  const value=typeof rawValue==='number' ? rawValue : Number(rawValue);
  if(!control || !Number.isFinite(value) || value<control.min || value>control.max) return null;
  return Math.round((value-control.min)/control.step)*control.step+control.min;
}

function validatedLayout(rawValues){
  const values={...DESKTOP_UI_DEFAULTS};
  if(!rawValues || typeof rawValues!=='object' || Array.isArray(rawValues)) return values;
  for(const key of Object.keys(DEV_UI_CONTROLS)){
    const value=validatedValue(key,rawValues[key]);
    if(value!==null) values[key]=value;
  }
  return values;
}

export function loadDesktopLayout(storage=globalThis.localStorage){
  try {
    const stored=storage?.getItem?.(LAYOUT_KEY);
    return stored===null || stored===undefined ? {...DESKTOP_UI_DEFAULTS} : validatedLayout(JSON.parse(stored));
  } catch {
    return {...DESKTOP_UI_DEFAULTS};
  }
}

export function saveDesktopLayout(values,storage=globalThis.localStorage){
  const layout=validatedLayout(values);
  try {
    storage?.setItem?.(LAYOUT_KEY,JSON.stringify(layout));
  } catch {}
  return layout;
}

export function setDesktopLayoutValue(values,key,rawValue){
  const value=validatedValue(key,rawValue);
  if(value===null || !values || typeof values!=='object') return false;
  values[key]=value;
  return value;
}

export function resetDesktopLayout(storage=globalThis.localStorage){
  try {
    storage?.removeItem?.(LAYOUT_KEY);
  } catch {}
  return {...DESKTOP_UI_DEFAULTS};
}

export function desktopLayoutCss(values){
  const layout=validatedLayout(values);
  return {
    '--local-card-width':`${layout.localCardWidth}px`,
    '--opponent-card-width':`${layout.opponentCardWidth}px`,
    '--local-hand-step':`${layout.localHandStep}px`,
    '--opponent-hand-step':`${layout.opponentHandStep}px`,
    '--badge-scale':String(layout.badgeScale/100),
    '--played-card-step':`${layout.playedCardStep}px`,
    '--coach-text-scale':String(layout.coachTextScale/100),
  };
}

export function clampCoachPosition(position,panelRect,boundsRect,safeBottom){
  const maxX=Math.max(boundsRect.left,boundsRect.right-panelRect.width);
  const maxY=Math.max(boundsRect.top,boundsRect.bottom-safeBottom-panelRect.height);
  return {
    x:Math.min(maxX,Math.max(boundsRect.left,position.x)),
    y:Math.min(maxY,Math.max(boundsRect.top,position.y)),
  };
}

function validCoachPosition(position){
  return position && typeof position==='object' && Number.isFinite(position.x) && Number.isFinite(position.y);
}

export function loadCoachPosition(storage=globalThis.localStorage){
  try {
    const stored=storage?.getItem?.(COACH_POSITION_KEY);
    if(stored===null || stored===undefined) return null;
    const position=JSON.parse(stored);
    return validCoachPosition(position) ? {x:position.x,y:position.y} : null;
  } catch {
    return null;
  }
}

export function saveCoachPosition(position,storage=globalThis.localStorage){
  if(!validCoachPosition(position)) return false;
  try {
    storage?.setItem?.(COACH_POSITION_KEY,JSON.stringify({x:position.x,y:position.y}));
    return true;
  } catch {
    return false;
  }
}

export function resetCoachPosition(storage=globalThis.localStorage){
  try {
    storage?.removeItem?.(COACH_POSITION_KEY);
  } catch {}
  return null;
}