from pathlib import Path
import json


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label}: expected source block not found')
    return text.replace(old, new, 1)


p = Path('src/simulation/driver.js')
s = p.read_text()
s = replace_once(
    s,
    "import { BOT_POLICY_BASELINE,BOT_POLICY_STRATEGIC } from '../bot-strategy.js';",
    "import { BOT_POLICY_BASELINE,BOT_POLICY_STRATEGIC,BOT_POLICY_STRATEGIC_V1 } from '../bot-strategy.js';",
    'driver import',
)
s = replace_once(
    s,
    "const VALID_BOT_POLICIES=new Set([BOT_POLICY_BASELINE,BOT_POLICY_STRATEGIC]);",
    "const VALID_BOT_POLICIES=new Set([BOT_POLICY_BASELINE,BOT_POLICY_STRATEGIC,BOT_POLICY_STRATEGIC_V1]);",
    'driver valid policies',
)
s = replace_once(
    s,
    "      strategic:{partnerPasses:0,partnerOvertakes:0,opponentThreatStops:0,goOutPlays:0},\n      baseline:{partnerPasses:0,partnerOvertakes:0,opponentThreatStops:0,goOutPlays:0},",
    "      strategic:{partnerPasses:0,partnerOvertakes:0,opponentThreatStops:0,goOutPlays:0},\n      'strategic-v1':{partnerPasses:0,partnerOvertakes:0,opponentThreatStops:0,goOutPlays:0},\n      baseline:{partnerPasses:0,partnerOvertakes:0,opponentThreatStops:0,goOutPlays:0},",
    'driver telemetry bucket',
)
s = replace_once(
    s,
    "  const policy=policies[seat]===BOT_POLICY_STRATEGIC?BOT_POLICY_STRATEGIC:BOT_POLICY_BASELINE;\n  const bucket=telemetry.teamPlay[policy];",
    "  const policy=VALID_BOT_POLICIES.has(policies[seat])?policies[seat]:BOT_POLICY_BASELINE;\n  const bucket=telemetry.teamPlay[policy];",
    'driver telemetry policy',
)
p.write_text(s)

p = Path('src/simulation/bot-benchmark.js')
s = p.read_text()
s = replace_once(
    s,
    "import {BOT_POLICY_BASELINE,BOT_POLICY_STRATEGIC} from '../bot-strategy.js';",
    "import {BOT_POLICY_BASELINE,BOT_POLICY_STRATEGIC,BOT_POLICY_STRATEGIC_V1} from '../bot-strategy.js';",
    'benchmark import',
)
s = replace_once(
    s,
    "const STRATEGIC=BOT_POLICY_STRATEGIC;\nconst BASELINE=BOT_POLICY_BASELINE;\nconst MATCH_A=[STRATEGIC,BASELINE,STRATEGIC,BASELINE];\nconst MATCH_B=[BASELINE,STRATEGIC,BASELINE,STRATEGIC];\n\nconst winBucket=()=>({strategic:0,baseline:0,ties:0});",
    "const STRATEGIC=BOT_POLICY_STRATEGIC;\nconst STRATEGIC_V1=BOT_POLICY_STRATEGIC_V1;\nconst BASELINE=BOT_POLICY_BASELINE;\nconst VALID_REFERENCES=new Set([BASELINE,STRATEGIC_V1]);\n\nconst winBucket=referencePolicy=>({strategic:0,[referencePolicy]:0,ties:0});",
    'benchmark constants',
)
s = replace_once(
    s,
    "function policyForTeam(botPolicies,team){\n  return botPolicies[team]===STRATEGIC?STRATEGIC:BASELINE;\n}",
    "function policyForTeam(botPolicies,team,referencePolicy){\n  return botPolicies[team]===STRATEGIC?STRATEGIC:referencePolicy;\n}",
    'benchmark policyForTeam',
)
s = replace_once(s, "  for(const policy of[STRATEGIC,BASELINE]){", "  for(const policy of[STRATEGIC,summary.referencePolicy]){", 'benchmark team telemetry loop')
s = replace_once(s, "      const policy=botPolicies[seat]===STRATEGIC?STRATEGIC:BASELINE;", "      const policy=botPolicies[seat]===STRATEGIC?STRATEGIC:summary.referencePolicy;", 'benchmark declaration policy')
s = replace_once(s, "      summary.doubles[policyForTeam(botPolicies,first%2)]+=1;", "      summary.doubles[policyForTeam(botPolicies,first%2,summary.referencePolicy)]+=1;", 'benchmark doubles policy')
s = replace_once(s, "      const policy=botPolicies[seat]===STRATEGIC?STRATEGIC:BASELINE;", "      const policy=botPolicies[seat]===STRATEGIC?STRATEGIC:summary.referencePolicy;", 'benchmark finish policy')
s = replace_once(s, "  for(const policy of[STRATEGIC,BASELINE]){", "  for(const policy of[STRATEGIC,summary.referencePolicy]){", 'benchmark finalize loop')
s = replace_once(
    s,
    "    if(summary.matchWins.strategic<=summary.matchWins.baseline)quality.push('strategic must win more matches than baseline');",
    "    if(summary.matchWins.strategic<=summary.matchWins[summary.referencePolicy])quality.push(`strategic must win more matches than ${summary.referencePolicy}`);",
    'benchmark win validation',
)
s = replace_once(
    s,
    "    const baselineDeclaration=summary.declarations.baseline.netPoints/Math.max(1,summary.matches);\n    if(strategicDeclaration<baselineDeclaration-5)quality.push('strategic declaration net points trail baseline by more than 5 points/match');",
    "    const referenceDeclaration=summary.declarations[summary.referencePolicy].netPoints/Math.max(1,summary.matches);\n    if(strategicDeclaration<referenceDeclaration-5)quality.push(`strategic declaration net points trail ${summary.referencePolicy} by more than 5 points/match`);",
    'benchmark declaration validation',
)
old_report = """    `match wins strategic/baseline/ties: ${summary.matchWins.strategic}/${summary.matchWins.baseline}/${summary.matchWins.ties}`,
    `pair wins strategic/baseline/ties: ${summary.pairWins.strategic}/${summary.pairWins.baseline}/${summary.pairWins.ties}`,
    `average score differential: ${summary.averageScoreDifferential.toFixed(2)}`,
    `aggregate pair differential: ${summary.aggregatePairDifferential}`,
    `declaration net strategic/baseline: ${summary.declarations.strategic.netPoints}/${summary.declarations.baseline.netPoints}`,
    `double victories strategic/baseline: ${summary.doubles.strategic}/${summary.doubles.baseline}`,
    `partner passes strategic/baseline: ${summary.teamPlay.strategic.partnerPasses}/${summary.teamPlay.baseline.partnerPasses}`,
    `partner overtakes strategic/baseline: ${summary.teamPlay.strategic.partnerOvertakes}/${summary.teamPlay.baseline.partnerOvertakes}`,
    `opponent threat stops strategic/baseline: ${summary.teamPlay.strategic.opponentThreatStops}/${summary.teamPlay.baseline.opponentThreatStops}`,
    `go-out plays strategic/baseline: ${summary.teamPlay.strategic.goOutPlays}/${summary.teamPlay.baseline.goOutPlays}`,
    `average finish strategic/baseline: ${summary.finishPosition.strategic.average?.toFixed(3)??'n/a'}/${summary.finishPosition.baseline.average?.toFixed(3)??'n/a'}`,
"""
new_report = """    `match wins strategic/${summary.referencePolicy}/ties: ${summary.matchWins.strategic}/${summary.matchWins[summary.referencePolicy]}/${summary.matchWins.ties}`,
    `pair wins strategic/${summary.referencePolicy}/ties: ${summary.pairWins.strategic}/${summary.pairWins[summary.referencePolicy]}/${summary.pairWins.ties}`,
    `average score differential: ${summary.averageScoreDifferential.toFixed(2)}`,
    `aggregate pair differential: ${summary.aggregatePairDifferential}`,
    `declaration net strategic/${summary.referencePolicy}: ${summary.declarations.strategic.netPoints}/${summary.declarations[summary.referencePolicy].netPoints}`,
    `double victories strategic/${summary.referencePolicy}: ${summary.doubles.strategic}/${summary.doubles[summary.referencePolicy]}`,
    `partner passes strategic/${summary.referencePolicy}: ${summary.teamPlay.strategic.partnerPasses}/${summary.teamPlay[summary.referencePolicy].partnerPasses}`,
    `partner overtakes strategic/${summary.referencePolicy}: ${summary.teamPlay.strategic.partnerOvertakes}/${summary.teamPlay[summary.referencePolicy].partnerOvertakes}`,
    `opponent threat stops strategic/${summary.referencePolicy}: ${summary.teamPlay.strategic.opponentThreatStops}/${summary.teamPlay[summary.referencePolicy].opponentThreatStops}`,
    `go-out plays strategic/${summary.referencePolicy}: ${summary.teamPlay.strategic.goOutPlays}/${summary.teamPlay[summary.referencePolicy].goOutPlays}`,
    `average finish strategic/${summary.referencePolicy}: ${summary.finishPosition.strategic.average?.toFixed(3)??'n/a'}/${summary.finishPosition[summary.referencePolicy].average?.toFixed(3)??'n/a'}`,
"""
s = replace_once(s, old_report, new_report, 'benchmark report')
s = replace_once(
    s,
    "  onProgress=null,\n}={}){\n  if(!Number.isInteger(pairs)||pairs<1)throw new TypeError('pairs must be a positive integer');\n  if(!Number.isInteger(baseSeed))throw new TypeError('baseSeed must be an integer');",
    "  onProgress=null,\n  referencePolicy=BASELINE,\n}={}){\n  if(!Number.isInteger(pairs)||pairs<1)throw new TypeError('pairs must be a positive integer');\n  if(!Number.isInteger(baseSeed))throw new TypeError('baseSeed must be an integer');\n  if(!VALID_REFERENCES.has(referencePolicy))throw new TypeError('referencePolicy must be baseline or strategic-v1');",
    'benchmark signature',
)
s = replace_once(
    s,
    "    gitSha,\n    matchWins:winBucket(),\n    pairWins:winBucket(),",
    "    gitSha,\n    referencePolicy,\n    matchWins:winBucket(referencePolicy),\n    pairWins:winBucket(referencePolicy),",
    'benchmark summary header',
)
s = replace_once(
    s,
    "    declarations:{strategic:declarationBucket(),baseline:declarationBucket()},\n    doubles:{strategic:0,baseline:0},\n    teamPlay:{strategic:teamPlayBucket(),baseline:teamPlayBucket()},\n    finishPosition:{strategic:{total:0,count:0,average:null},baseline:{total:0,count:0,average:null}},",
    "    declarations:{strategic:declarationBucket(),[referencePolicy]:declarationBucket()},\n    doubles:{strategic:0,[referencePolicy]:0},\n    teamPlay:{strategic:teamPlayBucket(),[referencePolicy]:teamPlayBucket()},\n    finishPosition:{strategic:{total:0,count:0,average:null},[referencePolicy]:{total:0,count:0,average:null}},",
    'benchmark dynamic buckets',
)
s = replace_once(
    s,
    "  const layouts=[MATCH_A,MATCH_B];",
    "  const layouts=[\n    [STRATEGIC,referencePolicy,STRATEGIC,referencePolicy],\n    [referencePolicy,STRATEGIC,referencePolicy,STRATEGIC],\n  ];",
    'benchmark layouts',
)
s = replace_once(s, "      else if(differential<0)summary.matchWins.baseline+=1;", "      else if(differential<0)summary.matchWins[referencePolicy]+=1;", 'benchmark match losses')
s = replace_once(s, "    else if(pairDifferential<0)summary.pairWins.baseline+=1;", "    else if(pairDifferential<0)summary.pairWins[referencePolicy]+=1;", 'benchmark pair losses')
p.write_text(s)

p = Path('scripts/benchmark-bots.mjs')
s = p.read_text()
s = replace_once(
    s,
    "import {formatBotBenchmarkReport,runBotBenchmark} from '../src/simulation/bot-benchmark.js';",
    "import {BOT_POLICY_BASELINE,BOT_POLICY_STRATEGIC_V1} from '../src/bot-strategy.js';\nimport {formatBotBenchmarkReport,runBotBenchmark} from '../src/simulation/bot-benchmark.js';",
    'cli import',
)
s = replace_once(
    s,
    "  const options={pairs:50,baseSeed:1,validate:false,quiet:false,gitSha:null};\n  const valueOptions=new Set(['--pairs','--seed','--git-sha']);",
    "  const options={pairs:50,baseSeed:1,validate:false,quiet:false,gitSha:null,referencePolicy:BOT_POLICY_BASELINE};\n  const valueOptions=new Set(['--pairs','--seed','--git-sha','--reference']);",
    'cli options',
)
s = replace_once(
    s,
    "    if(arg==='--pairs')options.pairs=Number(value);\n    else if(arg==='--seed')options.baseSeed=Number(value);\n    else options.gitSha=value;",
    "    if(arg==='--pairs')options.pairs=Number(value);\n    else if(arg==='--seed')options.baseSeed=Number(value);\n    else if(arg==='--git-sha')options.gitSha=value;\n    else options.referencePolicy=value;",
    'cli parser',
)
s = replace_once(
    s,
    "  if(options.gitSha!==null&&(typeof options.gitSha!=='string'||!options.gitSha.trim()))throw new Error('--git-sha must be non-empty');\n  return options;",
    "  if(options.gitSha!==null&&(typeof options.gitSha!=='string'||!options.gitSha.trim()))throw new Error('--git-sha must be non-empty');\n  if(![BOT_POLICY_BASELINE,BOT_POLICY_STRATEGIC_V1].includes(options.referencePolicy))throw new Error('--reference must be baseline or strategic-v1');\n  return options;",
    'cli validation',
)
s = replace_once(
    s,
    "    engineVersion:pkg.version,\n    onProgress:",
    "    engineVersion:pkg.version,\n    referencePolicy:options.referencePolicy,\n    onProgress:",
    'cli benchmark call',
)
p.write_text(s)

p = Path('package.json')
data = json.loads(p.read_text())
data['scripts']['test:bot-v2'] = 'node scripts/benchmark-bots.mjs --pairs 10 --seed 1 --quiet --reference strategic-v1'
data['scripts']['bot:benchmark:v2'] = 'node scripts/benchmark-bots.mjs --pairs 50 --seed 1 --reference strategic-v1'
p.write_text(json.dumps(data, indent=2) + '\n')
