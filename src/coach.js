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
  if(!selectedIds.size)return {selectedLabel:'',selectedValid:null,selectedReason:''};
  const cards=(state.hands?.[0]||[]).filter(card=>selectedIds.has(card.id));
  const play=classify(cards,state.lastPlay?.type==='single'?state.lastPlay.value:null);
  let valid=!!play&&beats(play,state.lastPlay||null);
  let selectedReason='';
  if(!play)selectedReason='Zaznaczone karty nie tworzą jednego z układów dozwolonych w Tichu.';
  else if(!valid){
    const requiredType=state.lastPlay?.type;
    selectedReason=requiredType&&play.type!==requiredType&&play.type!=='bomb'
      ?`To ${typeNames[play.type]}, a stół wymaga układu typu ${typeNames[requiredType]} albo bomby.`
      :'Układ ma właściwy typ, ale jest za słaby, by przebić ostatnie zagranie.';
  }
  if(valid&&state.wish){
    const options=possibleSelections(state.hands?.[0]||[],state.lastPlay||null,state.wish),mustFulfill=options.some(option=>option.fulfills);
    if(mustFulfill&&!cards.some(card=>!card.special&&card.rank===state.wish)){
      valid=false;selectedReason=`Masz legalny ruch z kartą ${rankText(state.wish)}, więc aktywne życzenie wymaga jej zagrania.`;
    }
  }
  if(valid)selectedReason=state.lastPlay?'Ten układ ma właściwy typ i przebija ostatnie zagranie.':'Ten układ jest legalnym otwarciem lewy.';
  return {selectedLabel:play?describePlayPl(play):'Nielegalna kombinacja',selectedValid:valid,selectedReason};
}
function hintOption(options){return options.find(option=>option.play.type!=='bomb')||options[0]||null}

function playPrompt(state){
  if(state.currentPlayer!==0)return {
    goal:'Przygotuj odpowiedź na następną decyzję.',
    action:`Obserwuj typ i siłę zagrania gracza ${state.names?.[state.currentPlayer]||'rywala'}.`,
    reason:'Gdy przyjdzie Twoja kolej, musisz zagrać ten sam typ wyżej, użyć bomby albo spasować.',
  };
  if(state.wish)return {
    goal:`Spełnij życzenie Mah Jonga: ${rankText(state.wish)}.`,
    action:`Jeśli masz legalny ruch z kartą ${rankText(state.wish)}, musisz ją zagrać; inaczej wybierz zwykły legalny ruch lub spasuj.`,
    reason:'Życzenie obowiązuje pierwszego gracza, który może legalnie użyć wskazanej rangi.',
  };
  if(!state.lastPlay)return {
    goal:'Nadaj lewie korzystny typ i tempo.',
    action:'Wybierz pojedynczą kartę lub legalną kombinację i zagraj.',
    reason:'Pierwsze zagranie ustala typ oraz liczbę kart, które inni muszą przebić, i pozwala Ci wpływać na przebieg lewy.',
  };
  const type=state.lastPlay.type;
  const shared={goal:'Przejmij lewę albo zachowaj karty na później.',reason:'Wyższe zagranie daje Ci szansę przejąć prowadzenie w lewie; pas zachowuje karty, ale oddaje kontrolę.'};
  if(type==='single')return {...shared,action:'Zagraj wyższą pojedynczą kartę, bombę albo spasuj. Smok jest najwyższą pojedynczą kartą, a Feniks ma wartość połówkową.'};
  if(type==='pair')return {...shared,action:'Zagraj wyższą parę, bombę albo spasuj.'};
  if(type==='triple')return {...shared,action:'Zagraj wyższą trójkę, bombę albo spasuj.'};
  if(type==='full-house')return {...shared,action:'Zagraj wyższy full house, bombę albo spasuj. O sile full house decyduje wartość trójki.'};
  if(type==='steps')return {...shared,action:`Zagraj wyższe kolejne pary z dokładnie ${state.lastPlay.length} kart, bombę albo spasuj.`};
  if(type==='straight')return {...shared,action:`Zagraj wyższy strit z dokładnie ${state.lastPlay.length} kart, bombę albo spasuj.`};
  if(type==='bomb')return {goal:'Odpowiedz na najsilniejszy typ zagrania.',action:'Zagraj silniejszą bombę albo spasuj.',reason:'Zwykła kombinacja nie przebije bomby; zachowaj ją na moment, w którym warto przejąć lewę.'};
  return {...shared,action:'Wybierz legalne zagranie przebijające stół albo spasuj.'};
}

const emptyCoachExtras=()=>({legalCardIds:new Set(),optionCount:0,selectedLabel:'',selectedValid:null,selectedReason:'',hintCardIds:new Set()});

export function buildCoachModel(state,uiState){
  if(!uiState?.coachEnabled)return null;
  if(state.phase==='grand')return {
    goal:'Oceń, czy warto zagrać o pierwsze miejsce.',
    action:'Spójrz na pierwsze 8 kart i wybierz Grand Tichu albo Pas.',
    reason:'Grand Tichu daje +200 punktów za wyjście jako pierwszy i −200 za porażkę; decyzję podejmujesz przed dobraniem reszty kart.',
    ...emptyCoachExtras(),
  };
  if(state.phase==='exchange'){
    if(state.exchangeDone?.[0])return {
      goal:'Doprowadź wymianę do końca i rozpocznij rozgrywkę.',
      action:'Poczekaj, aż pozostali gracze zatwierdzą swoje karty.',
      reason:'Karty zostaną przekazane dopiero, gdy każdy gracz wybierze trzy różne karty.',
      ...emptyCoachExtras(),
    };
    const target=Number(uiState.exchangeTarget||1),name=state.names?.[target]||`Gracz ${target+1}`;
    const partner=target===2;
    return {
      goal:'Zaplanuj wymianę kart przed pierwszą lewą.',
      action:`Wybierz z ręki jedną kartę dla gracza ${name}. Przed zatwierdzeniem możesz zmienić wybór.`,
      reason:partner?'To Twój partner: oboje zdobywacie punkty dla jednej drużyny, więc możesz wzmocnić jego rękę.':'To rywal, więc zwykle warto oddać kartę mało przydatną dla Twojego planu.',
      legalCardIds:new Set((state.hands?.[0]||[]).map(card=>card.id)),optionCount:(state.hands?.[0]||[]).length,selectedLabel:'',selectedValid:null,selectedReason:'',hintCardIds:new Set(),
    };
  }
  if(state.phase!=='play')return state.phase==='round-end'?{
    goal:'Zrozum, skąd wziął się wynik rundy.',
    action:'Sprawdź punkty drużyn i rozpocznij następną rundę.',
    reason:'Punkty z lew oraz premie lub kary Tichu składają się na wynik całego meczu.',
    ...emptyCoachExtras(),
  }:{
    goal:'Przejdź do następnej decyzji.',
    action:'Poczekaj, aż gra zakończy bieżący krok.',
    reason:'Coach pokaże nowe działanie, gdy zmieni się faza lub aktywny gracz.',
    ...emptyCoachExtras(),
  };

  const options=state.currentPlayer===0?legalOptions(state):[],prompt=playPrompt(state),selected=selectedModel(state),hint=hintOption(options);
  return {...prompt,legalCardIds:optionCardIds(options),optionCount:options.length,...selected,hintCardIds:new Set(hint?.cards?.map(card=>card.id)||[])};
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
