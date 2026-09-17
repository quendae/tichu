export const BOT_POLICY_BASELINE='baseline';
export const BOT_POLICY_STRATEGIC='strategic';
export const DEFAULT_BOT_POLICY=BOT_POLICY_BASELINE;

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const teamOf=seat=>seat%2;

export function normalizeBotPolicy(profile){
  return profile===BOT_POLICY_STRATEGIC?BOT_POLICY_STRATEGIC:BOT_POLICY_BASELINE;
}

export function buildBotView(state,seat,{legalPlays=[]}={}){
  const ownPass=state.passSelections?.[seat]||{};
  return{
    seat,
    partner:(seat+2)%4,
    phase:state.phase,
    round:state.round,
    hand:clone(state.hands?.[seat]||[]),
    handCounts:(state.hands||[]).map(hand=>hand.length),
    table:clone(state.table||[]),
    lastPlay:clone(state.lastPlay),
    legalPlays:legalPlays||[],
    declarations:[...(state.declarations||[])],
    scores:[...(state.scores||[0,0])],
    roundScore:[...(state.roundScore||[0,0])],
    finished:[...(state.finished||[])],
    wish:state.wish??null,
    discarded:clone(state.discarded||[]),
    currentPlayer:state.currentPlayer,
    trickLeader:state.trickLeader,
    exchangeKnown:{sent:Object.values(ownPass).filter(value=>typeof value==='string')},
  };
}

function baselineGrand(view){
  return view.hand.filter(card=>!card.special&&card.rank>=12).length>=4;
}

function baselineTichu(view){
  return view.hand.filter(card=>card.special==='dragon'||card.special==='phoenix'||(!card.special&&card.rank>=12)).length>=5;
}

function baselineExchange(view){
  const hand=[...view.hand].sort((a,b)=>(a.rank||20)-(b.rank||20));
  const targets=[0,1,2,3].filter(target=>target!==view.seat);
  const partner=view.partner;
  const best=[...hand].sort((a,b)=>(b.rank||0)-(a.rank||0))[0];
  if(!best)return{};
  const lows=hand.filter(card=>card.id!==best.id).slice(0,2);
  const enemies=targets.filter(target=>target!==partner);
  const map={};
  map[partner]=best.id;
  if(enemies[0]!=null&&lows[0])map[enemies[0]]=lows[0].id;
  if(enemies[1]!=null&&lows[1])map[enemies[1]]=lows[1].id;
  return map;
}

function baselineWish(view,selectedCards=[]){
  const selected=new Set(selectedCards.map(card=>card.id));
  const counts=new Map();
  for(const card of view.hand){
    if(!card.special&&!selected.has(card.id))counts.set(card.rank,(counts.get(card.rank)||0)+1);
  }
  return[...counts.entries()].sort((a,b)=>b[1]-a[1]||b[0]-a[0])[0]?.[0]||14;
}

function baselinePlay(view){
  const opts=[...(view.legalPlays||[])];
  let legal=opts;
  if(view.wish&&opts.some(option=>option.fulfills))legal=opts.filter(option=>option.fulfills);
  let chosen=legal[0];
  if(!chosen)return{type:'pass'};
  const nonBomb=legal.find(option=>option.play?.type!=='bomb');
  if(nonBomb)chosen=nonBomb;
  const wishRank=chosen.cards?.some(card=>card.special==='mahjong')?baselineWish(view,chosen.cards):null;
  return{type:'play',ids:chosen.cards.map(card=>card.id),wishRank};
}

function baselineDragonRecipient(view){
  return[0,1,2,3].find(seat=>teamOf(seat)!==teamOf(view.seat))??null;
}

export function decideGrand(view,profile=DEFAULT_BOT_POLICY){
  normalizeBotPolicy(profile);
  return baselineGrand(view);
}

export function decideTichu(view,profile=DEFAULT_BOT_POLICY){
  normalizeBotPolicy(profile);
  return baselineTichu(view);
}

export function chooseExchange(view,profile=DEFAULT_BOT_POLICY){
  normalizeBotPolicy(profile);
  return baselineExchange(view);
}

export function chooseWish(view,selectedCards=[],profile=DEFAULT_BOT_POLICY){
  normalizeBotPolicy(profile);
  return baselineWish(view,selectedCards);
}

export function choosePlay(view,profile=DEFAULT_BOT_POLICY){
  normalizeBotPolicy(profile);
  return baselinePlay(view);
}

export function chooseDragonRecipient(view,profile=DEFAULT_BOT_POLICY){
  normalizeBotPolicy(profile);
  return baselineDragonRecipient(view);
}