import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { replayDeterministicMatch } from '../src/simulation/driver.js';

export async function runReplayCli(argv=process.argv.slice(2)){
  const [filename,...extra]=argv;
  if(!filename||extra.length){
    console.error('Usage: npm run replay -- <replay.json>');
    return 2;
  }
  try{
    const replay=JSON.parse(await readFile(filename,'utf8'));
    const result=replayDeterministicMatch(replay);
    if(result.ok){
      const suffix=result.reproducedFailure?` reproduced=${result.failureCode}`:` final=${result.finalSummary}`;
      console.log(`Replay OK: seed=${replay.seed} steps=${result.step}${suffix}`);
      return 0;
    }
    console.error(`Replay diverged at step ${result.step}: ${result.message}`);
    if(result.expected!==undefined||result.actual!==undefined)console.error(`expected=${result.expected} actual=${result.actual}`);
    return 1;
  }catch(error){
    console.error(error.stack||error.message);
    return 1;
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  process.exitCode=await runReplayCli();
}
