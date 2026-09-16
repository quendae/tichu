function seedToUint32(seed){
  if(typeof seed==='number'&&Number.isFinite(seed))return seed>>>0;
  const text=String(seed);
  let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return hash>>>0;
}

export function createSeededRng(seed){
  let state=seedToUint32(seed);
  return()=>{
    state=(state+0x6D2B79F5)>>>0;
    let t=state;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return((t^(t>>>14))>>>0)/4294967296;
  };
}
