import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runSimulationBatch } from '../src/simulation/driver.js';

export function parseSimulationArgs(argv){
  const options={matches:100,baseSeed:1,stepLimit:10000,outDir:'artifacts/replays',quiet:false};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--quiet'){options.quiet=true;continue;}
    const value=argv[++i];
    if(value===undefined)throw new Error(`Missing value for ${arg}`);
    if(arg==='--matches')options.matches=Number(value);
    else if(arg==='--seed')options.baseSeed=Number(value);
    else if(arg==='--step-limit')options.stepLimit=Number(value);
    else if(arg==='--out')options.outDir=value;
    else throw new Error(`Unknown option ${arg}`);
  }
  if(!Number.isInteger(options.matches)||options.matches<1)throw new Error('--matches must be a positive integer');
  if(!Number.isInteger(options.baseSeed))throw new Error('--seed must be an integer');
  if(!Number.isInteger(options.stepLimit)||options.stepLimit<1)throw new Error('--step-limit must be a positive integer');
  if(typeof options.outDir!=='string'||!options.outDir.trim())throw new Error('--out must be a non-empty path');
  return options;
}

export async function runSimulationCli(argv=process.argv.slice(2),env=process.env){
  let options;
  try{options=parseSimulationArgs(argv)}catch(error){
    console.error(error.message);
    return 2;
  }

  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  const result=runSimulationBatch({
    matches:options.matches,
    baseSeed:options.baseSeed,
    stepLimit:options.stepLimit,
    engineVersion:pkg.version,
    gitSha:env.GITHUB_SHA||null,
    onProgress:options.quiet?null:({matchIndex,seed,steps})=>{
      if((matchIndex+1)%10===0||matchIndex===0)console.log(`match=${matchIndex+1}/${options.matches} seed=${seed} steps=${steps}`);
    },
  });

  if(result.ok){
    if(!options.quiet)console.log(`Simulation OK: matches=${result.matches} steps=${result.steps} seed=${options.baseSeed}..${options.baseSeed+options.matches-1}`);
    return 0;
  }

  await mkdir(options.outDir,{recursive:true});
  const filename=join(options.outDir,`failure-seed-${result.seed}.json`);
  await writeFile(filename,JSON.stringify(result.result.replay,null,2)+'\n','utf8');
  const failure=result.result.replay.failure;
  console.error(`Invariant failed: ${failure?.code||'SIMULATION_ERROR'}`);
  console.error(`seed=${result.seed} match=${result.matchIndex+1} round=${failure?.round} step=${failure?.step}`);
  if(failure?.message)console.error(failure.message);
  console.error(`replay=${filename}`);
  return 1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  process.exitCode=await runSimulationCli();
}
