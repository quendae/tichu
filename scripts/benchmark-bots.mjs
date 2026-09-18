import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {formatBotBenchmarkReport,runBotBenchmark} from '../src/simulation/bot-benchmark.js';

export function parseBenchmarkArgs(argv){
  const options={pairs:50,baseSeed:1,validate:false,quiet:false,gitSha:null};
  const valueOptions=new Set(['--pairs','--seed','--git-sha']);
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--validate'){options.validate=true;continue;}
    if(arg==='--quiet'){options.quiet=true;continue;}
    if(!valueOptions.has(arg))throw new Error(`Unknown option ${arg}`);
    const value=argv[++i];
    if(value===undefined)throw new Error(`Missing value for ${arg}`);
    if(arg==='--pairs')options.pairs=Number(value);
    else if(arg==='--seed')options.baseSeed=Number(value);
    else options.gitSha=value;
  }
  if(!Number.isInteger(options.pairs)||options.pairs<1)throw new Error('--pairs must be a positive integer');
  if(!Number.isInteger(options.baseSeed))throw new Error('--seed must be an integer');
  if(options.gitSha!==null&&(typeof options.gitSha!=='string'||!options.gitSha.trim()))throw new Error('--git-sha must be non-empty');
  return options;
}

export async function runBenchmarkCli(argv=process.argv.slice(2),env=process.env){
  let options;
  try{options=parseBenchmarkArgs(argv)}catch(error){
    console.error(error.message);
    return 2;
  }

  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  const gitSha=options.gitSha||env.GITHUB_SHA||null;
  const result=runBotBenchmark({
    pairs:options.pairs,
    baseSeed:options.baseSeed,
    validate:options.validate,
    gitSha,
    engineVersion:pkg.version,
    onProgress:options.quiet?null:({pairIndex,seed,differential})=>{
      if(pairIndex===0||(pairIndex+1)%10===0||pairIndex+1===options.pairs){
        console.log(`pair=${pairIndex+1}/${options.pairs} seed=${seed} differential=${differential}`);
      }
    },
  });

  if(!options.quiet||!result.ok)process.stdout.write(formatBotBenchmarkReport(result));
  if(result.reportFiles&&!options.quiet){
    console.log(`json=${result.reportFiles.jsonPath}`);
    console.log(`text=${result.reportFiles.textPath}`);
  }
  return result.ok?0:1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  process.exitCode=await runBenchmarkCli();
}
