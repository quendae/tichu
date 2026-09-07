import { SUITS, displayRank } from './rules.js';

const suitById=Object.fromEntries(SUITS.map(suit=>[suit.id,suit]));
const palette={
  jade:'#207a5b',
  sword:'#a3473f',
  pagoda:'#365f8e',
  star:'#72518f',
  mahjong:'#a47b36',
  dog:'#53645b',
  phoenix:'#c75c3d',
  dragon:'#9a3f36',
};

const wrap=body=>`<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`;

function jadeSvg(){
  return wrap(`<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="57" cy="77" r="22" stroke-width="5" opacity=".18"/><circle cx="57" cy="77" r="10" stroke-width="3" opacity=".24"/>
    <path d="M27 113C34 91 39 66 41 31M52 106C55 84 57 62 58 38" stroke-width="3" opacity=".72"/>
    <path d="M39 48c-10-2-15-8-17-16 10 1 17 6 19 13M41 66c10-7 18-8 25-3-7 8-15 11-25 7M53 77c-8-4-12-10-12-18 9 3 14 8 15 15M55 93c9-5 17-5 23 0-7 7-15 9-24 4" stroke-width="2.6"/>
  </g>`);
}

function swordSvg(){
  return wrap(`<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path d="M28 105L72 38 78 26 68 33 33 101z" stroke-width="4"/><path d="M70 106L32 47 25 37 29 50 64 111z" stroke-width="4" opacity=".82"/>
    <path d="M24 92l21 14M58 101l19-13" stroke-width="6"/><circle cx="27" cy="109" r="5" fill="currentColor" stroke="none" opacity=".7"/><circle cx="73" cy="111" r="5" fill="currentColor" stroke="none" opacity=".7"/>
    <path d="M24 114c-5 9-7 15-4 18M29 114c2 8 2 14-1 20M71 116c5 7 7 13 5 18" stroke-width="2" opacity=".55"/>
  </g>`);
}

function pagodaSvg(){
  return wrap(`<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="73" cy="35" r="11" fill="currentColor" stroke="none" opacity=".12"/>
    <path d="M50 23v16M31 49h38L57 38H43zM23 57c18 4 36 4 54 0M34 60v16h32V60M27 84h46L62 74H38zM19 92c21 5 41 5 62 0M31 96v20h38V96M22 118h56" stroke-width="3.5"/>
    <path d="M42 101v15M58 101v15" stroke-width="2" opacity=".55"/>
  </g>`);
}

function starSvg(){
  return wrap(`<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path d="M24 100l18-35 18 18 17-43" stroke-width="2.5" opacity=".45"/>
    <path d="M73 28a18 18 0 1 0 4 34 15 15 0 1 1-4-34z" fill="currentColor" stroke="none" opacity=".12"/>
    <circle cx="24" cy="100" r="4" fill="currentColor" stroke="none"/><circle cx="42" cy="65" r="3" fill="currentColor" stroke="none"/><circle cx="60" cy="83" r="4" fill="currentColor" stroke="none"/><circle cx="77" cy="40" r="3" fill="currentColor" stroke="none"/>
    <path d="M35 34l3 7 7 3-7 3-3 7-3-7-7-3 7-3zM71 96l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="currentColor" stroke="none" opacity=".75"/>
  </g>`);
}

function mahjongSvg(){
  return wrap(`<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="51" cy="37" r="19" fill="currentColor" stroke="none" opacity=".13"/>
    <path d="M13 55h76M18 62c20-9 43-8 66 1M25 123c2-24 15-37 30-48 10-7 14-14 13-24" stroke-width="3" opacity=".65"/>
    <rect x="37" y="78" width="27" height="34" rx="3" stroke-width="3" fill="currentColor" fill-opacity=".06"/>
    <path d="M50 85v19M44 91h13M43 100h15" stroke-width="2.5"/>
  </g>`);
}

function dogSvg(){
  return wrap(`<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path d="M31 66c-8-13-5-28 7-35l7 15c7-3 14-3 21 0l8-15c11 8 13 23 5 36 5 10 4 25-3 35-8 12-17 18-27 18-12 0-22-7-29-20-6-11-5-25 1-34z" stroke-width="4" fill="currentColor" fill-opacity=".07"/>
    <circle cx="42" cy="70" r="3" fill="currentColor" stroke="none"/><circle cx="65" cy="70" r="3" fill="currentColor" stroke="none"/>
    <path d="M49 82c4 3 7 3 11 0M54 84v9c-7 5-14 4-19-2M54 93c7 5 14 4 19-2" stroke-width="2.5"/>
    <path d="M28 109c-7 4-10 9-8 15M80 108c8 4 10 9 8 15" stroke-width="2" opacity=".55"/>
  </g>`);
}

function phoenixSvg(){
  return wrap(`<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path d="M52 111c-5-19 0-35 15-48-1 18-5 33-15 48z" fill="currentColor" fill-opacity=".15" stroke-width="3"/>
    <path d="M51 82C35 62 22 51 12 48c6 20 17 35 34 44M55 80c14-24 26-38 37-42-2 21-13 39-34 54" stroke-width="4"/>
    <path d="M47 63c-5-12-4-22 5-31 4 8 6 14 4 20 6-8 12-13 19-14-2 13-9 23-20 30" stroke-width="3"/>
    <path d="M48 111c-11 6-17 13-18 21M55 109c3 11 9 18 18 23M46 101c-15 2-26 7-33 16M60 101c15 2 25 7 31 15" stroke-width="2.5" opacity=".62"/>
  </g>`);
}

function dragonSvg(){
  return wrap(`<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path d="M72 30c-15 1-23 11-21 23 2 13 22 10 21 24-1 17-33 9-39 27-4 12 4 23 19 25" stroke-width="9" opacity=".17"/>
    <path d="M72 30c-15 1-23 11-21 23 2 13 22 10 21 24-1 17-33 9-39 27-4 12 4 23 19 25" stroke-width="3.5"/>
    <path d="M67 27l-5-10M73 28l8-9M64 36l-10-4M78 36l9-4" stroke-width="2.5"/>
    <circle cx="68" cy="34" r="2.5" fill="currentColor" stroke="none"/>
    <path d="M74 41c9 3 14 9 14 18M59 64c-9 0-15 4-19 12M61 91c10 3 15 9 16 18M37 106c-8 1-14 5-18 12" stroke-width="2" opacity=".65"/>
    <path d="M18 43c7-7 15-8 23-3M15 49c9-2 16 1 21 8M67 119c8-6 17-7 25-2M70 126c7-2 13-1 19 3" stroke-width="2.3" opacity=".45"/>
  </g>`);
}

const normalSvg={jade:jadeSvg,sword:swordSvg,pagoda:pagodaSvg,star:starSvg};
const specialSvg={mahjong:mahjongSvg,dog:dogSvg,phoenix:phoenixSvg,dragon:dragonSvg};
const specialNames={mahjong:'Mah Jong',dog:'Dog',phoenix:'Phoenix',dragon:'Dragon'};

export function cardArt(card){
  if(!card) return {className:'card-art',ariaLabel:'Card',label:'Card',svg:wrap(''),accent:'#5f665f',artKey:'fallback'};
  if(card.special){
    const name=specialNames[card.special]||card.special;
    return {
      className:`card-art special-art ${card.special}-art`,
      ariaLabel:name,
      label:name,
      svg:(specialSvg[card.special]||(()=>wrap('')))(),
      accent:palette[card.special]||'#5f665f',
      artKey:`special-${card.special}`,
    };
  }
  const suit=suitById[card.suit]||{name:card.suit||'Unknown',symbol:''};
  const rank=displayRank(card);
  return {
    className:`card-art suit-art ${card.suit}-art`,
    ariaLabel:`${rank} of ${suit.name}`,
    label:`${rank} ${suit.symbol}`.trim(),
    svg:(normalSvg[card.suit]||(()=>wrap('')))(),
    accent:palette[card.suit]||'#5f665f',
    artKey:`suit-${card.suit}`,
  };
}
