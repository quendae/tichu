const cardId=card=>typeof card==='string'?card:card?.id;
const cardIds=cards=>(cards||[]).map(cardId).filter(id=>id!=null);

export function snapshotVisualState(state={}){
  return {
    hands:Array.from({length:4},(_,seat)=>cardIds(state.hands?.[seat])),
    handCounts:Array.from({length:4},(_,seat)=>state.hands?.[seat]?.length||0),
    table:(state.table||[]).map(entry=>({
      seat:Number(entry.seat),
      cardIds:cardIds(entry.cardIds||entry.cards),
    })),
    captured:Array.from({length:4},(_,seat)=>cardIds(state.captured?.[seat])),
    phase:state.phase??null,
    dragonRecipient:state.dragonRecipient??null,
  };
}

export function visualStreamContinues(previous,next){
  return !!previous&&!!next&&!next.rebase
    &&previous.streamId===next.streamId
    &&Number.isFinite(previous.revision)&&Number.isFinite(next.revision)
    &&next.revision===previous.revision+1;
}

function addedIds(previous=[],next=[]){
  const before=new Set(previous);
  return next.filter(id=>!before.has(id));
}

function lostIds(previous=[],next=[]){
  const after=new Set(next);
  return previous.filter(id=>!after.has(id));
}

export function deriveVisualTransitions(previous,next){
  if(!previous||!next)return [];
  const transitions=[];
  const previousTableIds=previous.table.flatMap(entry=>entry.cardIds);
  const nextTableIds=next.table.flatMap(entry=>entry.cardIds);
  const previousTableSet=new Set(previousTableIds);
  const nextTableSet=new Set(nextTableIds);
  const newEntries=next.table.filter(entry=>entry.cardIds.some(id=>!previousTableSet.has(id)));

  for(const entry of newEntries){
    const played=entry.cardIds.filter(id=>!previousTableSet.has(id));
    if(played.length)transitions.push({kind:'play',seat:entry.seat,cardIds:played});
  }

  const disappearedTable=previousTableIds.filter(id=>!nextTableSet.has(id));
  const capturedAdds=next.captured.map((cards,seat)=>({seat,cardIds:addedIds(previous.captured[seat],cards)}));

  if(newEntries.length===0){
    for(let seat=0;seat<4;seat++){
      const lost=lostIds(previous.hands[seat],next.hands[seat]);
      if(!lost.length)continue;
      const capture=capturedAdds.find(entry=>lost.some(id=>entry.cardIds.includes(id)));
      if(!capture)continue;
      const played=lost.filter(id=>capture.cardIds.includes(id));
      const tableCardIds=disappearedTable.filter(id=>capture.cardIds.includes(id));
      transitions.push({kind:'play-and-collect',seat,recipient:capture.seat,cardIds:played,tableCardIds});
      return transitions;
    }
    const handLosses=previous.handCounts
      .map((count,seat)=>({seat,count:count-next.handCounts[seat]}))
      .filter(loss=>loss.count===1);
    const dogPlay=previous.phase==='play'&&next.phase==='play'
      &&previousTableIds.length===0&&nextTableIds.length===0
      &&capturedAdds.every(entry=>entry.cardIds.length===0)
      &&handLosses.length===1;
    if(dogPlay){
      const {seat}=handLosses[0],knownIds=lostIds(previous.hands[seat],next.hands[seat]);
      transitions.push({kind:'play',seat,cardIds:[knownIds.length===1?knownIds[0]:`hidden-dog-seat-${seat}`]});
    }
  }

  if(disappearedTable.length){
    const capture=capturedAdds
      .map(entry=>({...entry,matched:disappearedTable.filter(id=>entry.cardIds.includes(id))}))
      .sort((a,b)=>b.matched.length-a.matched.length)[0];
    if(capture?.matched.length)transitions.push({kind:'collect',recipient:capture.seat,cardIds:capture.matched});
  }

  return transitions;
}
