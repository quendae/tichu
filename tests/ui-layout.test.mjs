import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_UI_DEFAULTS, DEV_UI_CONTROLS,
  loadDesktopLayout, saveDesktopLayout, setDesktopLayoutValue, resetDesktopLayout,
  desktopLayoutCss, clampCoachPosition, loadCoachPosition, resetCoachPosition, saveCoachPosition,
} from '../src/ui-layout.js';

function memoryStorage(initial={}){
  const data=new Map(Object.entries(initial));
  return {
    getItem:key=>data.has(key)?data.get(key):null,
    setItem:(key,value)=>data.set(key,String(value)),
    removeItem:key=>data.delete(key),
    snapshot:()=>Object.fromEntries(data),
  };
}

test('desktop tuning validates stored values and produces CSS variables',()=>{
  const storage=memoryStorage({
    'tichu.qqnd.desktop-layout.v1':JSON.stringify({localCardWidth:112,opponentCardWidth:999}),
  });
  const values=loadDesktopLayout(storage);
  assert.equal(values.localCardWidth,112);
  assert.equal(values.opponentCardWidth,DESKTOP_UI_DEFAULTS.opponentCardWidth);
  assert.equal(desktopLayoutCss(values)['--local-card-width'],'112px');
});

test('layout values round to each control step and persist only valid controls',()=>{
  const storage=memoryStorage();
  const values={...DESKTOP_UI_DEFAULTS};
  assert.equal(setDesktopLayoutValue(values,'localCardWidth','112.6'),113);
  assert.equal(setDesktopLayoutValue(values,'unknown','50'),false);
  assert.equal(setDesktopLayoutValue(values,'badgeScale','NaN'),false);
  saveDesktopLayout(values,storage);
  assert.equal(loadDesktopLayout(storage).localCardWidth,113);
  assert.deepEqual(Object.keys(DEV_UI_CONTROLS),Object.keys(DESKTOP_UI_DEFAULTS));
});

test('malformed stored layout resets to defaults and reset removes persistence',()=>{
  const storage=memoryStorage({'tichu.qqnd.desktop-layout.v1':'not json'});
  assert.deepEqual(loadDesktopLayout(storage),DESKTOP_UI_DEFAULTS);
  saveDesktopLayout({...DESKTOP_UI_DEFAULTS,localHandStep:75},storage);
  assert.deepEqual(resetDesktopLayout(storage),DESKTOP_UI_DEFAULTS);
  assert.equal(storage.getItem('tichu.qqnd.desktop-layout.v1'),null);
});

test('desktop CSS contains the seven documented variables with unitless scale factors',()=>{
  const css=desktopLayoutCss({...DESKTOP_UI_DEFAULTS,badgeScale:125,coachTextScale:130});
  assert.deepEqual(css,{
    '--local-card-width':'104px',
    '--opponent-card-width':'96px',
    '--local-hand-step':'72px',
    '--opponent-hand-step':'34px',
    '--badge-scale':'1.25',
    '--played-card-step':'54px',
    '--coach-text-scale':'1.3',
  });
});

test('Coach position is clamped inside table and above the safe bottom edge',()=>{
  const result=clampCoachPosition(
    {x:900,y:700},
    {width:350,height:220},
    {left:20,top:60,right:1180,bottom:820},
    170,
  );
  assert.deepEqual(result,{x:830,y:430});
});

test('Coach position stays within resized table bounds for negative and oversized panels',()=>{
  const bounds={left:40,top:80,right:640,bottom:480};
  assert.deepEqual(
    clampCoachPosition({x:-200,y:-50},{width:220,height:140},bounds,90),
    {x:40,y:80},
  );
  assert.deepEqual(
    clampCoachPosition({x:700,y:520},{width:220,height:140},bounds,90),
    {x:420,y:250},
  );
  assert.deepEqual(
    clampCoachPosition({x:90,y:120},{width:800,height:500},bounds,90),
    {x:40,y:80},
  );
});

test('Coach position storage accepts finite coordinates only',()=>{
  const storage=memoryStorage();
  assert.deepEqual(loadCoachPosition(storage),null);
  assert.equal(saveCoachPosition({x:10,y:20},storage),true);
  assert.deepEqual(loadCoachPosition(storage),{x:10,y:20});
  assert.equal(saveCoachPosition({x:Infinity,y:20},storage),false);
  storage.setItem('tichu.qqnd.coach-position.v1',JSON.stringify({x:'10',y:20}));
  assert.deepEqual(loadCoachPosition(storage),null);
  saveCoachPosition({x:30,y:40},storage);
  assert.equal(resetCoachPosition(storage),null);
  assert.deepEqual(loadCoachPosition(storage),null);
});