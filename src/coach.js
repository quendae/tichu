import { classify, beats, describePlay, possibleSelections } from './rules.js';

const rankText=value=>({11:'J',12:'Q',13:'K',14:'A'})[value]||String(value);

function legalOptions(state){
  const hand=state.hands?.[0]||[];
  const options=possibleSelections(hand,state.lastPlay||null,state.wish||null);
  if(state.wish && options.some(option=>option.fulfills)) return options.filter(option=>option.fulfills);
  return options;
}

function optionCardIds(options){
  const ids=new Set();
  for(const option of options) for(const card of option.cards) ids.add(card.id);
  return ids;
}

function selectedModel(state){
  const selectedIds=state.selected instanceof Set ? state.selected : new Set(state.selected||[]);
  if(!selectedIds.size) return {selectedLabel:'',selectedValid:null};
  const cards=(state.hands?.[0]||[]).filter(card=>selectedIds.has(card.id));
  const play=classify(cards,state.lastPlay?.type==='single'?state.lastPlay.value:null);
  let valid=!!play && beats(play,state.lastPlay||null);
  if(valid && state.wish){
    const options=possibleSelections(state.hands?.[0]||[],state.lastPlay||null,state.wish);
    const mustFulfill=options.some(option=>option.fulfills);
    if(mustFulfill && !cards.some(card=>!card.special&&card.rank===state.wish)) valid=false;
  }
  return {
    selectedLabel:play ? describePlay(play) : 'These cards do not form a legal combination',
    selectedValid:valid,
  };
}

function hintOption(options){
  return options.find(option=>option.play.type!=='bomb') || options[0] || null;
}

function playPrompt(state){
  if(state.currentPlayer!==0){
    return {title:`${state.names?.[state.currentPlayer]||'Opponent'} is thinking`,body:'Watch the table. Your legal options will update when the turn reaches you.'};
  }
  if(state.wish){
    return {title:`Mah Jong wish: ${rankText(state.wish)}`,body:`If you can make a legal play containing ${rankText(state.wish)}, you must fulfill the wish. Otherwise you may play normally or pass.`};
  }
  if(!state.lastPlay){
    return {title:'Your lead',body:'Start the trick with any legal single or combination. A bomb is legal too, but usually worth saving.'};
  }
  const type=state.lastPlay.type;
  if(type==='single') return {title:'Your turn',body:'Play a higher single, use a bomb, or pass. The Dragon is the highest single; the Phoenix has special half-rank behavior.'};
  if(type==='pair') return {title:'Your turn',body:'Play a higher pair of the same size, use a bomb, or pass.'};
  if(type==='triple') return {title:'Your turn',body:'Play a higher triple, use a bomb, or pass.'};
  if(type==='full-house') return {title:'Your turn',body:'Play a higher full house, use a bomb, or pass. The triple rank decides which full house is higher.'};
  if(type==='steps') return {title:'Your turn',body:`Play higher consecutive pairs with the same ${state.lastPlay.length} cards, use a bomb, or pass.`};
  if(type==='straight') return {title:'Your turn',body:`Play a higher straight with exactly ${state.lastPlay.length} cards, use a bomb, or pass.`};
  if(type==='bomb') return {title:'Bomb on the table',body:'Only a stronger bomb can beat this play. Otherwise pass.'};
  return {title:'Your turn',body:'Choose a legal play that beats the table, or pass.'};
}

export function buildCoachModel(state,uiState){
  if(!uiState?.coachEnabled) return null;

  if(state.phase==='grand'){
    return {
      title:'Grand Tichu decision',
      body:'You have only seen your first 8 cards. Grand Tichu scores +200 if you go out first and -200 if you do not.',
      legalCardIds:new Set(),optionCount:0,selectedLabel:'',selectedValid:null,hintCardIds:new Set(),
    };
  }

  if(state.phase==='exchange'){
    const target=Number(uiState.exchangeTarget||1);
    const name=state.names?.[target]||`Player ${target+1}`;
    const relation=target===2?'your partner opposite you':target===1?'the opponent on your left':'the opponent on your right';
    return {
      title:`Pass a card to ${name}`,
      body:`Choose one card directly from your hand for ${relation}. You will give one different card to each other player before confirming the exchange.`,
      legalCardIds:new Set((state.hands?.[0]||[]).map(card=>card.id)),
      optionCount:(state.hands?.[0]||[]).length,
      selectedLabel:'',selectedValid:null,hintCardIds:new Set(),
    };
  }

  if(state.phase!=='play'){
    return {
      title:state.phase==='round-end'?'Round complete':'Tichu Coach',
      body:state.phase==='round-end'?'Review the score, then start the next round when ready.':'The Coach will explain the next decision when play resumes.',
      legalCardIds:new Set(),optionCount:0,selectedLabel:'',selectedValid:null,hintCardIds:new Set(),
    };
  }

  const options=state.currentPlayer===0?legalOptions(state):[];
  const prompt=playPrompt(state);
  const selected=selectedModel(state);
  const hint=hintOption(options);
  return {
    ...prompt,
    legalCardIds:optionCardIds(options),
    optionCount:options.length,
    selectedLabel:selected.selectedLabel,
    selectedValid:selected.selectedValid,
    hintCardIds:new Set(hint?.cards?.map(card=>card.id)||[]),
  };
}

export function specialCardHelp(card){
  const help={
    mahjong:{title:'Mah Jong · 1',body:'Rank 1. When you lead it, you may wish for any normal rank from 2 to Ace. The wish must be fulfilled by the first player who can do so legally.'},
    dog:{title:'Dog',body:'Lead it alone. The trick ends immediately and the lead passes to your partner. The Dog has no point value.'},
    phoenix:{title:'Phoenix',body:'A flexible wildcard in most non-bomb combinations. As a single it sits half a rank above the previous single. It is worth -25 points.'},
    dragon:{title:'Dragon',body:'The highest single and worth +25 points. If it wins the trick, you must give the whole trick to one opponent, while keeping the next lead.'},
  };
  return card?.special ? help[card.special] || {title:'Special card',body:'This card has a special Tichu rule.'} : null;
}
