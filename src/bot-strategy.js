export const BOT_POLICY_BASELINE='baseline';
export const BOT_POLICY_STRATEGIC='strategic';
export const DEFAULT_BOT_POLICY=BOT_POLICY_BASELINE;

export const STRATEGIC_WEIGHTS=Object.freeze({
  exitSaving:2.5,
  control:1.5,
  bomb:4,
  structure:0.6,
  problemSingleton:-1.2,
  grandThreshold:40,
  tichuThreshold:32,
  maxScoreAdjustment:3,
});

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const teamOf=seat=>seat%2;
const stableCards=cards=>[...cards].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
const rankOf=card=>card.special==='mahjong'?1:card.rank;

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

function groupsByRank(hand){
  const groups=new Map();
  for(const card of hand){
    if(card.special)continue;
    const group=groups.get(card.rank)||[];
    group.push(card);
    groups.set(card.rank,stableCards(group));
  }
  return groups;
}

function consecutiveRuns(ranks,minLength){
  const sorted=[...new Set(ranks)].sort((a,b)=>a-b);
  const runs=[];
  let current=[];
  for(const rank of sorted){
    if(!current.length||rank===current.at(-1)+1)current.push(rank);
    else{if(current.length>=minLength)runs.push(current);current=[rank]}
  }
  if(current.length>=minLength)runs.push(current);
  return runs;
}

function straightFlushRuns(hand){
  const bySuit=new Map();
  for(const card of hand){
    if(card.special||card.suit==null||card.rank==null)continue;
    const cards=bySuit.get(card.suit)||[];
    cards.push(card);
    bySuit.set(card.suit,cards);
  }
  const runs=[];
  for(const cards of bySuit.values()){
    const byRank=new Map(cards.map(card=>[card.rank,card]));
    for(const ranks of consecutiveRuns([...byRank.keys()],5))runs.push(ranks.map(rank=>byRank.get(rank)));
  }
  return runs;
}

function normalStraightRuns(hand){
  const byRank=new Map();
  for(const card of stableCards(hand)){
    const rank=rankOf(card);
    if(rank==null||card.special==='dog'||card.special==='dragon'||card.special==='phoenix')continue;
    if(!byRank.has(rank))byRank.set(rank,card);
  }
  return consecutiveRuns([...byRank.keys()],5).map(ranks=>ranks.map(rank=>byRank.get(rank)));
}

function pairStepRuns(groups){
  const ranks=[...groups.entries()].filter(([,cards])=>cards.length>=2).map(([rank])=>rank);
  return consecutiveRuns(ranks,2).map(run=>run.flatMap(rank=>groups.get(rank).slice(0,2)));
}

function structureCandidates(hand){
  const groups=groupsByRank(hand);
  const candidates=[];
  for(const cards of groups.values()){
    if(cards.length===4)candidates.push({type:'bomb-four',cards:[...cards],priority:8});
  }
  for(const cards of straightFlushRuns(hand))candidates.push({type:'bomb-straight-flush',cards,priority:9});
  for(const cards of pairStepRuns(groups))candidates.push({type:'steps',cards,priority:7});
  for(const cards of normalStraightRuns(hand))candidates.push({type:'straight',cards,priority:6});

  const triples=[...groups.entries()].filter(([,cards])=>cards.length>=3);
  const pairs=[...groups.entries()].filter(([,cards])=>cards.length>=2);
  for(const [tripleRank,tripleCards] of triples){
    for(const [pairRank,pairCards] of pairs){
      if(tripleRank===pairRank)continue;
      candidates.push({type:'full-house',cards:[...tripleCards.slice(0,3),...pairCards.slice(0,2)],priority:5});
    }
  }
  for(const [,cards] of triples)candidates.push({type:'triple',cards:cards.slice(0,3),priority:4});
  for(const [,cards] of pairs)candidates.push({type:'pair',cards:cards.slice(0,2),priority:3});

  return candidates.sort((a,b)=>
    (b.cards.length-a.cards.length)||
    (b.priority-a.priority)||
    stableCards(a.cards).map(card=>card.id).join('|').localeCompare(stableCards(b.cards).map(card=>card.id).join('|'))
  );
}

function estimateExits(hand){
  const used=new Set();
  let exits=0;
  for(const candidate of structureCandidates(hand)){
    if(candidate.cards.some(card=>used.has(card.id)))continue;
    candidate.cards.forEach(card=>used.add(card.id));
    exits+=1;
  }
  exits+=hand.filter(card=>!used.has(card.id)).length;
  return Math.max(0,exits);
}

function cardPointsAtRisk(card){
  if(card.special==='dragon')return 25;
  if(card.special==='phoenix')return -25;
  if(card.special)return 0;
  if(card.rank===5)return 5;
  if(card.rank===10||card.rank===13)return 10;
  return 0;
}

export function analyzeHand(input){
  const hand=stableCards(input||[]);
  const groups=groupsByRank(hand);
  const straightRuns=normalStraightRuns(hand);
  const pairRuns=pairStepRuns(groups);
  const straightFlushes=straightFlushRuns(hand);
  const fourBombs=[...groups.values()].filter(cards=>cards.length===4).length;
  const bombCount=fourBombs+straightFlushes.length;
  const pairCount=[...groups.values()].filter(cards=>cards.length>=2).length;
  const tripleCount=[...groups.values()].filter(cards=>cards.length>=3).length;
  const longestStraight=Math.max(0,...straightRuns.map(cards=>cards.length));
  const longestPairRun=Math.max(0,...pairRuns.map(cards=>cards.length/2));
  const phoenix=hand.some(card=>card.special==='phoenix');

  let controlScore=0;
  for(const card of hand){
    if(card.special==='dragon')controlScore+=5;
    else if(card.special==='phoenix')controlScore+=4;
    else if(!card.special&&card.rank===14)controlScore+=2;
    else if(!card.special&&card.rank===13)controlScore+=1;
    else if(!card.special&&card.rank===12)controlScore+=0.5;
    else if(!card.special&&card.rank===11)controlScore+=0.25;
  }
  controlScore+=bombCount*2;

  let structureScore=pairCount+tripleCount*1.5+bombCount*6;
  if(longestStraight>=5)structureScore+=longestStraight*1.2;
  if(longestPairRun>=2)structureScore+=longestPairRun*2;
  if(phoenix&&(pairCount||tripleCount||longestStraight>=4||longestPairRun>=2))structureScore+=1.5;

  const structuredRanks=new Set();
  straightRuns.forEach(cards=>cards.forEach(card=>{if(card.rank!=null)structuredRanks.add(card.rank)}));
  const problemSingletons=hand.filter(card=>
    !card.special&&card.rank<=8&&(groups.get(card.rank)?.length||0)===1&&!structuredRanks.has(card.rank)
  ).length;

  const estimatedExits=estimateExits(hand);
  const pointsAtRisk=hand.reduce((sum,card)=>sum+cardPointsAtRisk(card),0);
  return{
    cardCount:hand.length,
    estimatedExits,
    bombCount,
    controlScore,
    problemSingletons,
    structureScore,
    pointsAtRisk,
    pairCount,
    tripleCount,
    longestStraight,
    longestPairRun,
  };
}

function baselineGrand(view){
  return view.hand.filter(card=>!card.special&&card.rank>=12).length>=4;
}

function baselineTichu(view){
  return view.hand.filter(card=>card.special==='dragon'||card.special==='phoenix'||(!card.special&&card.rank>=12)).length>=5;
}

function scoreAdjustment(view){
  const team=teamOf(view.seat);
  const own=Number(view.scores?.[team]||0);
  const other=Number(view.scores?.[1-team]||0);
  const raw=(other-own)/200;
  return Math.max(-STRATEGIC_WEIGHTS.maxScoreAdjustment,Math.min(STRATEGIC_WEIGHTS.maxScoreAdjustment,raw));
}

function strategicHandScore(view){
  const analysis=analyzeHand(view.hand);
  const savings=Math.max(0,analysis.cardCount-analysis.estimatedExits);
  return{
    analysis,
    score:
      savings*STRATEGIC_WEIGHTS.exitSaving+
      analysis.controlScore*STRATEGIC_WEIGHTS.control+
      analysis.bombCount*STRATEGIC_WEIGHTS.bomb+
      analysis.structureScore*STRATEGIC_WEIGHTS.structure+
      analysis.problemSingletons*STRATEGIC_WEIGHTS.problemSingleton,
  };
}

function strategicGrand(view){
  const {score}=strategicHandScore(view);
  const threshold=STRATEGIC_WEIGHTS.grandThreshold-scoreAdjustment(view);
  return score>=threshold;
}

function strategicTichu(view){
  const {score}=strategicHandScore(view);
  const threshold=STRATEGIC_WEIGHTS.tichuThreshold-scoreAdjustment(view);
  return score>=threshold;
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

function exchangeCardStrength(card){
  if(card.special==='dragon')return 100;
  if(card.special==='phoenix')return 80;
  if(card.special==='dog')return 20;
  if(card.special==='mahjong')return 15;
  return Number(card.rank||0);
}

function removalDamage(hand,card){
  const before=analyzeHand(hand);
  const after=analyzeHand(hand.filter(item=>item.id!==card.id));
  return Math.max(0,before.bombCount-after.bombCount)*120+
    Math.max(0,before.longestPairRun-after.longestPairRun)*30+
    Math.max(0,before.longestStraight-after.longestStraight)*12+
    Math.max(0,after.estimatedExits-before.estimatedExits)*20+
    Math.max(0,before.structureScore-after.structureScore)*4;
}

function strategicExchange(view){
  const hand=stableCards(view.hand||[]);
  const partner=view.partner;
  const enemies=[0,1,2,3].filter(target=>target!==view.seat&&target!==partner);
  if(hand.length<3)return baselineExchange(view);

  const partnerDeclared=['tichu','grand'].includes(view.declarations?.[partner]);
  const partnerChoice=[...hand].sort((a,b)=>{
    const aScore=exchangeCardStrength(a)*(partnerDeclared?2:1)-removalDamage(hand,a)*5;
    const bScore=exchangeCardStrength(b)*(partnerDeclared?2:1)-removalDamage(hand,b)*5;
    return bScore-aScore||String(a.id).localeCompare(String(b.id));
  })[0];

  const map={};
  map[partner]=partnerChoice.id;
  let remaining=hand.filter(card=>card.id!==partnerChoice.id);
  for(const target of enemies){
    const choice=[...remaining].sort((a,b)=>{
      const aCost=removalDamage(remaining,a)*100+exchangeCardStrength(a);
      const bCost=removalDamage(remaining,b)*100+exchangeCardStrength(b);
      return aCost-bCost||String(a.id).localeCompare(String(b.id));
    })[0];
    if(!choice)break;
    map[target]=choice.id;
    remaining=remaining.filter(card=>card.id!==choice.id);
  }
  return Object.keys(map).length===3?map:baselineExchange(view);
}

function baselineWish(view,selectedCards=[]){
  const selected=new Set(selectedCards.map(card=>card.id));
  const counts=new Map();
  for(const card of view.hand){
    if(!card.special&&!selected.has(card.id))counts.set(card.rank,(counts.get(card.rank)||0)+1);
  }
  return[...counts.entries()].sort((a,b)=>b[1]-a[1]||b[0]-a[0])[0]?.[0]||14;
}

function rankFromKnownCardId(id){
  const match=String(id||'').match(/-(\d+)$/);
  if(!match)return null;
  const rank=Number(match[1]);
  return rank>=2&&rank<=14?rank:null;
}

function publicRankCounts(view){
  const counts=new Map();
  const add=card=>{
    if(!card?.special&&card?.rank>=2&&card.rank<=14)counts.set(card.rank,(counts.get(card.rank)||0)+1);
  };
  for(const entry of view.table||[])for(const card of entry.cards||[])add(card);
  for(const card of view.discarded||[])add(card);
  return counts;
}

function strategicWish(view,selectedCards=[]){
  const selected=new Set(selectedCards.map(card=>card.id));
  const ownCounts=new Map();
  for(const card of view.hand||[]){
    if(!card.special&&!selected.has(card.id))ownCounts.set(card.rank,(ownCounts.get(card.rank)||0)+1);
  }
  const sentCounts=new Map();
  for(const id of view.exchangeKnown?.sent||[]){
    const rank=rankFromKnownCardId(id);
    if(rank!=null)sentCounts.set(rank,(sentCounts.get(rank)||0)+1);
  }
  const seen=publicRankCounts(view);
  return Array.from({length:13},(_,index)=>index+2).sort((a,b)=>{
    const score=rank=>(sentCounts.get(rank)||0)*20-(ownCounts.get(rank)||0)*6-(seen.get(rank)||0)*3+rank/100;
    return score(b)-score(a)||b-a;
  })[0]||14;
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

function playControlCost(cards){
  return cards.reduce((cost,card)=>{
    if(card.special==='dragon')return cost+45;
    if(card.special==='phoenix')return cost+35;
    if(!card.special&&card.rank===14)return cost+14;
    if(!card.special&&card.rank===13)return cost+7;
    return cost;
  },0);
}

function optionKey(option){
  return stableCards(option.cards||[]).map(card=>card.id).join('|');
}

function strategicPlay(view){
  if(view.currentPlayer!==view.seat)return{type:'pass'};
  const options=[...(view.legalPlays||[])];
  const mustFulfillWish=Boolean(view.wish&&options.some(option=>option.fulfills));
  let legal=options;
  if(mustFulfillWish)legal=options.filter(option=>option.fulfills);
  if(!legal.length)return{type:'pass'};

  const winningSeat=view.table?.at(-1)?.seat;
  const opponents=[0,1,2,3].filter(seat=>teamOf(seat)!==teamOf(view.seat));
  const declarationActive=seat=>['tichu','grand'].includes(view.declarations?.[seat]);
  const urgentOpponents=opponents.filter(seat=>(view.handCounts?.[seat]??99)<=2||declarationActive(seat));

  if(view.lastPlay&&winningSeat===view.partner&&!urgentOpponents.length&&!mustFulfillWish)return{type:'pass'};

  const winnerIsOpponent=winningSeat!=null&&teamOf(winningSeat)!==teamOf(view.seat);
  const winnerOneCard=winnerIsOpponent&&(view.handCounts?.[winningSeat]??99)<=1;
  const winnerDeclaration=winnerIsOpponent&&declarationActive(winningSeat);
  const emergency=winnerOneCard&&winnerDeclaration;
  const before=analyzeHand(view.hand||[]);

  const scored=legal.map(option=>{
    const cards=option.cards||[];
    const ids=new Set(cards.map(card=>card.id));
    const remaining=(view.hand||[]).filter(card=>!ids.has(card.id));
    const after=analyzeHand(remaining);
    const empties=remaining.length===0;
    const bomb=option.play?.type==='bomb';
    const controlCost=playControlCost(cards);
    let score=cards.length*12+(before.estimatedExits-after.estimatedExits)*18;

    if(!view.lastPlay)score+=cards.length*9;
    if(empties)score+=1000;

    score-=controlCost;
    score-=Math.max(0,before.bombCount-after.bombCount-(bomb?1:0))*90;
    score-=Math.max(0,before.longestPairRun-after.longestPairRun)*10;
    score-=Math.max(0,before.longestStraight-after.longestStraight)*5;

    if(bomb&&!empties&&!emergency)score-=70;
    if(winnerIsOpponent&&(view.handCounts?.[winningSeat]??99)<=2)score+=35;
    if(winnerDeclaration)score+=25;

    if(emergency){
      const strongest=Math.max(0,...cards.map(card=>card.special==='dragon'?100:card.special==='phoenix'?85:(!card.special?Number(card.rank||0)*5:0)));
      score+=strongest*2;
      if(bomb)score+=25;
    }

    return{option,score,key:optionKey(option)};
  }).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));

  const chosen=scored[0]?.option;
  if(!chosen)return{type:'pass'};
  const wishRank=chosen.cards?.some(card=>card.special==='mahjong')?strategicWish(view,chosen.cards):null;
  return{type:'play',ids:chosen.cards.map(card=>card.id),wishRank};
}

function baselineDragonRecipient(view){
  return[0,1,2,3].find(seat=>teamOf(seat)!==teamOf(view.seat))??null;
}

function strategicDragonRecipient(view){
  const opponents=[0,1,2,3].filter(seat=>teamOf(seat)!==teamOf(view.seat));
  return opponents.sort((a,b)=>{
    const score=seat=>{
      const declaration=view.declarations?.[seat];
      const declarationPenalty=declaration==='grand'?5:declaration==='tichu'?4:0;
      return Number(view.handCounts?.[seat]||0)-declarationPenalty;
    };
    return score(b)-score(a)||a-b;
  })[0]??null;
}

export function decideGrand(view,profile=DEFAULT_BOT_POLICY){
  return normalizeBotPolicy(profile)===BOT_POLICY_STRATEGIC?strategicGrand(view):baselineGrand(view);
}

export function decideTichu(view,profile=DEFAULT_BOT_POLICY){
  return normalizeBotPolicy(profile)===BOT_POLICY_STRATEGIC?strategicTichu(view):baselineTichu(view);
}

export function chooseExchange(view,profile=DEFAULT_BOT_POLICY){
  return normalizeBotPolicy(profile)===BOT_POLICY_STRATEGIC?strategicExchange(view):baselineExchange(view);
}

export function chooseWish(view,selectedCards=[],profile=DEFAULT_BOT_POLICY){
  return normalizeBotPolicy(profile)===BOT_POLICY_STRATEGIC?strategicWish(view,selectedCards):baselineWish(view,selectedCards);
}

export function choosePlay(view,profile=DEFAULT_BOT_POLICY){
  return normalizeBotPolicy(profile)===BOT_POLICY_STRATEGIC?strategicPlay(view):baselinePlay(view);
}

export function chooseDragonRecipient(view,profile=DEFAULT_BOT_POLICY){
  return normalizeBotPolicy(profile)===BOT_POLICY_STRATEGIC?strategicDragonRecipient(view):baselineDragonRecipient(view);
}
