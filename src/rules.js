export const SUITS = [
  { id: 'jade', symbol: '◆', name: 'Jade' },
  { id: 'sword', symbol: '⚔', name: 'Swords' },
  { id: 'pagoda', symbol: '▥', name: 'Pagodas' },
  { id: 'star', symbol: '★', name: 'Stars' },
];
export const RANKS = [2,3,4,5,6,7,8,9,10,11,12,13,14];
export const SPECIALS = ['mahjong','dog','phoenix','dragon'];

export function makeDeck() {
  const cards = [];
  for (const suit of SUITS) for (const rank of RANKS) {
    cards.push({ id: `${suit.id}-${rank}`, suit: suit.id, rank, special: null });
  }
  cards.push(
    { id:'mahjong', suit:null, rank:1, special:'mahjong' },
    { id:'dog', suit:null, rank:0, special:'dog' },
    { id:'phoenix', suit:null, rank:null, special:'phoenix' },
    { id:'dragon', suit:null, rank:15, special:'dragon' },
  );
  return cards;
}

export function cardPoints(card) {
  if (card.special === 'dragon') return 25;
  if (card.special === 'phoenix') return -25;
  if (card.special) return 0;
  if (card.rank === 5) return 5;
  if (card.rank === 10 || card.rank === 13) return 10;
  return 0;
}

export function displayRank(card) {
  if (card.special) return ({mahjong:'1',dog:'DOG',phoenix:'PHX',dragon:'DRG'})[card.special];
  return ({11:'J',12:'Q',13:'K',14:'A'})[card.rank] || String(card.rank);
}

const normals = cards => cards.filter(c=>!c.special || c.special==='mahjong');
const phoenixCount = cards => cards.filter(c=>c.special==='phoenix').length;
const forbiddenCombo = cards => cards.some(c=>c.special==='dog' || c.special==='dragon');

function groupsByRank(cards) {
  const m = new Map();
  for (const c of cards) {
    if (c.special === 'phoenix') continue;
    const r = c.special==='mahjong' ? 1 : c.rank;
    if (!m.has(r)) m.set(r, []);
    m.get(r).push(c);
  }
  return m;
}

function straightInfo(cards) {
  if (cards.length < 5 || forbiddenCombo(cards) || phoenixCount(cards)>1) return null;
  const p = phoenixCount(cards);
  const rs = normals(cards).map(c=>c.special==='mahjong'?1:c.rank);
  if (new Set(rs).size !== rs.length) return null;
  const candidates = [];
  const maxStart = 14 - cards.length + 1;
  for (let start=1; start<=maxStart; start++) {
    const seq = Array.from({length:cards.length},(_,i)=>start+i);
    const missing = seq.filter(r=>!rs.includes(r));
    if (missing.length===p && rs.every(r=>seq.includes(r))) candidates.push({ high: seq.at(-1), phoenixAs: missing[0] ?? null });
  }
  if (!candidates.length) return null;
  return candidates.sort((a,b)=>b.high-a.high)[0];
}

function stepsInfo(cards) {
  if (cards.length < 4 || cards.length%2 || forbiddenCombo(cards) || phoenixCount(cards)>1) return null;
  const p = phoenixCount(cards), needPairs=cards.length/2;
  const g=groupsByRank(cards), rs=[...g.keys()].sort((a,b)=>a-b);
  if (!rs.length) return null;
  const min=rs[0], max=rs.at(-1);
  if (max-min+1!==needPairs) return null;
  let missingSlots=0;
  for(let r=min;r<=max;r++) {
    const n=g.get(r)?.length||0;
    if(n>2) return null;
    missingSlots += 2-n;
  }
  if(missingSlots!==p) return null;
  return { high:max, phoenixAs: p ? [...Array(needPairs)].map((_,i)=>min+i).find(r=>(g.get(r)?.length||0)===1) : null };
}

function sameRankWithPhoenix(cards, wanted) {
  if (cards.length!==wanted || forbiddenCombo(cards) || phoenixCount(cards)>1) return null;
  const p=phoenixCount(cards), g=groupsByRank(cards);
  if (g.size!==1) return null;
  const [rank, group]=[...g.entries()][0];
  return group.length+p===wanted ? {rank, phoenixAs:p?rank:null}:null;
}

function fullHouseInfo(cards) {
  if (cards.length!==5 || forbiddenCombo(cards) || phoenixCount(cards)>1) return null;
  const p=phoenixCount(cards), g=groupsByRank(cards), entries=[...g.entries()].map(([rank,arr])=>[rank,arr.length]);
  const candidates=[];
  for (const [tr,tc] of entries) for (const [pr,pc] of entries) {
    if (tr===pr) continue;
    const need=(3-tc)+(2-pc);
    if (tc<=3 && pc<=2 && need===p) candidates.push({triple:tr, pair:pr, phoenixAs: tc<3?tr:pr});
  }
  if (!p && entries.length===2) {
    const triple=entries.find(e=>e[1]===3), pair=entries.find(e=>e[1]===2);
    if(triple&&pair) candidates.push({triple:triple[0],pair:pair[0],phoenixAs:null});
  }
  return candidates.sort((a,b)=>b.triple-a.triple)[0]||null;
}

function bombInfo(cards) {
  if (cards.some(c=>c.special)) return null;
  if(cards.length===4) {
    const g=groupsByRank(cards);
    if(g.size===1) return {kind:'four', size:4, high:[...g.keys()][0]};
  }
  if(cards.length>=5) {
    const suit=cards[0]?.suit;
    if(cards.every(c=>c.suit===suit)) {
      const rs=cards.map(c=>c.rank).sort((a,b)=>a-b);
      if(new Set(rs).size===rs.length && rs.every((r,i)=>i===0||r===rs[i-1]+1)) return {kind:'straight-flush', size:cards.length, high:rs.at(-1)};
    }
  }
  return null;
}

export function classify(cards, previousSingleValue=null) {
  if (!Array.isArray(cards) || cards.length===0) return null;
  const bomb=bombInfo(cards);
  if(bomb) return {type:'bomb', length:cards.length, value:bomb.high, bomb, cards};

  if(cards.length===1) {
    const c=cards[0];
    let value;
    if(c.special==='dog') value=0;
    else if(c.special==='mahjong') value=1;
    else if(c.special==='phoenix') value= previousSingleValue==null ? 1.5 : Math.min(14.5, previousSingleValue+0.5);
    else if(c.special==='dragon') value=15;
    else value=c.rank;
    return {type:'single',length:1,value,cards,phoenixAs:c.special==='phoenix'?value:null};
  }

  const pair=sameRankWithPhoenix(cards,2);
  if(pair) return {type:'pair',length:2,value:pair.rank,cards,phoenixAs:pair.phoenixAs};
  const triple=sameRankWithPhoenix(cards,3);
  if(triple) return {type:'triple',length:3,value:triple.rank,cards,phoenixAs:triple.phoenixAs};
  const fh=fullHouseInfo(cards);
  if(fh) return {type:'full-house',length:5,value:fh.triple,cards,phoenixAs:fh.phoenixAs};
  const steps=stepsInfo(cards);
  if(steps) return {type:'steps',length:cards.length,value:steps.high,cards,phoenixAs:steps.phoenixAs};
  const straight=straightInfo(cards);
  if(straight) return {type:'straight',length:cards.length,value:straight.high,cards,phoenixAs:straight.phoenixAs};
  return null;
}

export function compareBomb(a,b) {
  if(a.bomb.kind!==b.bomb.kind) return a.bomb.kind==='straight-flush' ? 1 : -1;
  if(a.bomb.kind==='straight-flush' && a.bomb.size!==b.bomb.size) return Math.sign(a.bomb.size-b.bomb.size);
  return Math.sign(a.bomb.high-b.bomb.high);
}

export function beats(play, previous) {
  if(!play) return false;
  if(!previous) return true;
  if(play.type==='bomb') {
    if(previous.type!=='bomb') return true;
    return compareBomb(play,previous)>0;
  }
  if(previous.type==='bomb') return false;
  if(play.type!==previous.type || play.length!==previous.length) return false;
  if(play.type==='single' && previous.cards[0]?.special==='dragon') return false;
  return play.value>previous.value;
}

export function canFulfillWishFromSelection(play, wishRank) {
  if(!wishRank || !play) return false;
  return play.cards.some(c=>!c.special && c.rank===wishRank);
}

export function possibleSelections(hand, previous=null, wishRank=null) {
  const n=hand.length, out=[];
  const maxMask = n>18 ? 0 : (1<<n);
  if(maxMask) {
    for(let mask=1;mask<maxMask;mask++) {
      const cards=[];
      for(let i=0;i<n;i++) if(mask&(1<<i)) cards.push(hand[i]);
      const p=classify(cards, previous?.type==='single'?previous.value:null);
      if(p && beats(p,previous)) out.push({cards,play:p,fulfills:canFulfillWishFromSelection(p,wishRank)});
    }
  } else {
    for(const c of hand) {
      const p=classify([c], previous?.type==='single'?previous.value:null);
      if(p && beats(p,previous)) out.push({cards:[c],play:p,fulfills:canFulfillWishFromSelection(p,wishRank)});
    }
    const groups=groupsByRank(hand.filter(c=>c.special!=='phoenix'));
    for(const [,arr] of groups) for(const size of [2,3,4]) if(arr.length>=size) {
      const cards=arr.slice(0,size), p=classify(cards);
      if(p&&beats(p,previous)) out.push({cards,play:p,fulfills:canFulfillWishFromSelection(p,wishRank)});
    }
  }
  out.sort((a,b)=>{
    if(a.fulfills!==b.fulfills) return a.fulfills?-1:1;
    if((a.play.type==='bomb') !== (b.play.type==='bomb')) return a.play.type==='bomb'?1:-1;
    return a.play.value-b.play.value || a.cards.length-b.cards.length;
  });
  return out;
}
