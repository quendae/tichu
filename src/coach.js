import { classify, beats, possibleSelections } from './rules.js';

const rankText=value=>({11:'J',12:'Q',13:'K',14:'A'})[value]||String(value);
const typeNames={single:'pojedyncza karta',pair:'para',triple:'trójka','full-house':'full house',steps:'kolejne pary',straight:'strit',bomb:'bomba'};

function describePlayPl(play){
  if(!play)return '';
  if(play.type==='single')return `Pojedyncza karta · ${rankText(play.value)}`;
  if(play.type==='pair')return `Para · ${rankText(play.value)}`;
  if(play.type==='triple')return `Trójka · ${rankText(play.value)}`;
  if(play.type==='full-house')return `Full house · trójka ${rankText(play.value)}`;
  if(play.type==='steps')return `Kolejne pary · do ${rankText(play.value)}`;
  if(play.type==='straight')return `Strit · do ${rankText(play.value)}`;
  if(play.type==='bomb')return play.bomb?.kind==='straight-flush'?`Bomba · poker ${play.length} kart`:`Bomba · cztery ${rankText(play.value)}`;
  return typeNames[play.type]||'Legalne zagranie';
}

function legalOptions(state){
  const hand=state.hands?.[0]||[];
  const options=possibleSelections(hand,state.lastPlay||null,state.wish||null);
  if(state.wish&&options.some(option=>option.fulfills))return options.filter(option=>option.fulfills);
  return options;
}
function optionCardIds(options){const ids=new Set();for(const option of options)for(const card of option.cards)ids.add(card.id);return ids}

function selectedModel(state){
  const selectedIds=state.selected instanceof Set?state.selected:new Set(state.selected||[]);
  if(!selectedIds.size)return {selectedLabel:'',selectedValid:null};
  const cards=(state.hands?.[0]||[]).filter(card=>selectedIds.has(card.id));
  const play=classify(cards,state.lastPlay?.type==='single'?state.lastPlay.value:null);
  let valid=!!play&&beats(play,state.lastPlay||null);
  if(valid&&state.wish){
    const options=possibleSelections(state.hands?.[0]||[],state.lastPlay||null,state.wish),mustFulfill=options.some(option=>option.fulfills);
    if(mustFulfill&&!cards.some(card=>!card.special&&card.rank===state.wish))valid=false;
  }
  return {selectedLabel:play?describePlayPl(play):'Te karty nie tworzą legalnej kombinacji',selectedValid:valid};
}
function hintOption(options){return options.find(option=>option.play.type!=='bomb')||options[0]||null}

function playPrompt(state){
  if(state.currentPlayer!==0)return {title:`${state.names?.[state.currentPlayer]||'Rywal'} myśli`,body:'Obserwuj stół. Gdy przyjdzie Twoja kolej, Coach od razu pokaże legalne możliwości.'};
  if(state.wish)return {title:`Życzenie Mah Jonga: ${rankText(state.wish)}`,body:`Jeśli możesz legalnie zagrać z kartą ${rankText(state.wish)}, musisz spełnić życzenie. Jeśli nie możesz — grasz normalnie albo pasujesz.`};
  if(!state.lastPlay)return {title:'Rozpoczynasz lewę',body:'Możesz wyjść dowolną legalną kartą lub kombinacją. Bomba też jest legalna, ale zwykle warto ją zachować.'};
  const type=state.lastPlay.type;
  if(type==='single')return {title:'Twój ruch',body:'Zagraj wyższą pojedynczą kartę, bombę albo spasuj. Smok jest najwyższą pojedynczą kartą, a Feniks ma specjalną wartość połówkową.'};
  if(type==='pair')return {title:'Twój ruch',body:'Zagraj wyższą parę, bombę albo spasuj.'};
  if(type==='triple')return {title:'Twój ruch',body:'Zagraj wyższą trójkę, bombę albo spasuj.'};
  if(type==='full-house')return {title:'Twój ruch',body:'Zagraj wyższy full house, bombę albo spasuj. O sile full house decyduje wartość trójki.'};
  if(type==='steps')return {title:'Twój ruch',body:`Zagraj wyższe kolejne pary z dokładnie ${state.lastPlay.length} kart, bombę albo spasuj.`};
  if(type==='straight')return {title:'Twój ruch',body:`Zagraj wyższy strit z dokładnie ${state.lastPlay.length} kart, bombę albo spasuj.`};
  if(type==='bomb')return {title:'Na stole leży bomba',body:'Możesz ją przebić tylko silniejszą bombą. W przeciwnym razie spasuj.'};
  return {title:'Twój ruch',body:'Wybierz legalne zagranie przebijające stół albo spasuj.'};
}

export function buildCoachModel(state,uiState){
  if(!uiState?.coachEnabled)return null;
  if(state.phase==='grand')return {title:'Decyzja Grand Tichu',body:'Widzisz dopiero pierwsze 8 kart. Grand Tichu daje +200, jeśli wyjdziesz pierwszy, i −200, jeśli Ci się nie uda.',legalCardIds:new Set(),optionCount:0,selectedLabel:'',selectedValid:null,hintCardIds:new Set()};
  if(state.phase==='exchange'){
    const target=Number(uiState.exchangeTarget||1),name=state.names?.[target]||`Gracz ${target+1}`;
    const relation=target===2?'Twojego partnera siedzącego naprzeciwko':target===1?'rywala po lewej':'rywala po prawej';
    return {title:`Przekaż kartę do ${name}`,body:`Wybierz jedną kartę bezpośrednio z ręki dla ${relation}. Przed zatwierdzeniem wymiany możesz zmienić każdy wybór.`,legalCardIds:new Set((state.hands?.[0]||[]).map(card=>card.id)),optionCount:(state.hands?.[0]||[]).length,selectedLabel:'',selectedValid:null,hintCardIds:new Set()};
  }
  if(state.phase!=='play')return {title:state.phase==='round-end'?'Koniec rundy':'Coach Tichu',body:state.phase==='round-end'?'Sprawdź wynik i rozpocznij następną rundę, gdy będziesz gotowy.':'Coach wyjaśni następną decyzję, gdy gra ruszy dalej.',legalCardIds:new Set(),optionCount:0,selectedLabel:'',selectedValid:null,hintCardIds:new Set()};

  const options=state.currentPlayer===0?legalOptions(state):[],prompt=playPrompt(state),selected=selectedModel(state),hint=hintOption(options);
  return {...prompt,legalCardIds:optionCardIds(options),optionCount:options.length,selectedLabel:selected.selectedLabel,selectedValid:selected.selectedValid,hintCardIds:new Set(hint?.cards?.map(card=>card.id)||[])};
}

export function specialCardHelp(card){
  const help={
    mahjong:{title:'Mah Jong · 1',body:'Ma wartość 1. Gdy nim wychodzisz, możesz zażyczyć sobie dowolnej zwykłej rangi od 2 do Asa. Pierwszy gracz, który może legalnie spełnić życzenie, musi to zrobić.'},
    dog:{title:'Pies',body:'Zagrywasz go samodzielnie na rozpoczęcie lewy. Lewa kończy się od razu, a wyjście przechodzi do Twojego partnera. Pies nie daje punktów.'},
    phoenix:{title:'Feniks',body:'Elastyczny joker w większości kombinacji innych niż bomby. Jako pojedyncza karta jest o pół rangi wyższy od poprzedniej. Jest wart −25 punktów.'},
    dragon:{title:'Smok',body:'Najwyższa pojedyncza karta, warta +25 punktów. Jeśli wygrywa lewę, musisz oddać całą lewę jednemu z rywali, ale zachowujesz następne wyjście.'},
  };
  return card?.special?help[card.special]||{title:'Karta specjalna',body:'Ta karta ma specjalną zasadę w Tichu.'}:null;
}
