const boundedInt=(value,fallback,min,max)=>{
  const parsed=Number.parseInt(String(value??''),10);
  if(!Number.isFinite(parsed))return fallback;
  return Math.max(min,Math.min(max,parsed));
};

export function readSoakConfig(env=process.env){
  return {
    rooms:boundedInt(env.SOAK_ROOMS,4,1,8),
    churnRooms:boundedInt(env.SOAK_CHURN_ROOMS,8,1,16),
    reconnectAfterActions:boundedInt(env.SOAK_RECONNECT_AFTER_ACTIONS,60,10,500),
    maxActions:boundedInt(env.SOAK_MAX_ACTIONS,6000,500,10000),
  };
}

export function summarizeSoakResults(results){
  const rows=Array.isArray(results)?results:[];
  return {
    rooms:rows.length,
    completedMatches:rows.filter(row=>Array.isArray(row.scores)&&row.scores.length===2&&Math.max(...row.scores)>=1000&&row.scores[0]!==row.scores[1]).length,
    totalActions:rows.reduce((sum,row)=>sum+Number(row.actions||0),0),
    totalRounds:rows.reduce((sum,row)=>sum+Number(row.completedRounds||0),0),
    reconnects:rows.reduce((sum,row)=>sum+Number(row.reconnects||0),0),
    maxDurationMs:rows.reduce((max,row)=>Math.max(max,Number(row.durationMs||0)),0),
    clientErrors:rows.reduce((sum,row)=>sum+(Array.isArray(row.errors)?row.errors.length:Number(row.clientErrors||0)),0),
    roomsDetail:rows.map(row=>({
      roomId:row.roomId,
      actions:Number(row.actions||0),
      completedRounds:Number(row.completedRounds||0),
      reconnects:Number(row.reconnects||0),
      durationMs:Number(row.durationMs||0),
      scores:Array.isArray(row.scores)?[...row.scores]:null,
    })),
  };
}

export function validateSoakSummary(summary,{expectedRooms}={}){
  const expected=Number(expectedRooms??summary?.rooms??0);
  const errors=[];
  if(Number(summary?.completedMatches||0)!==expected)errors.push(`completed_matches:${Number(summary?.completedMatches||0)}/${expected}`);
  if(Number(summary?.reconnects||0)<expected)errors.push(`reconnects:${Number(summary?.reconnects||0)}/${expected}`);
  if(Number(summary?.clientErrors||0)>0)errors.push(`client_errors:${Number(summary.clientErrors)}`);
  return errors;
}
