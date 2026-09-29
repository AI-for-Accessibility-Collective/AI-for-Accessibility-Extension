// Predeclared contrast cases. Live reader + independent reviewer + routing.
// Synthetic pages make the expected intervention explicit; no acting browser.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {setProfiles} from '../extension/validation/model-call.js';
import * as R from '../extension/validation/reasoner.js';
import {decide} from '../extension/validation/policy.js';
import {decisionView} from '@ai4a11y/tools/utils/verification-decision-view.js';
import {holdout,fresh} from './fixtures/decision-quality-holdout.mjs';
import { auditDir } from './audit-dir.mjs';
if(!process.argv.includes('--live')||!process.env.GEMINI_API_KEY)throw Error('Requires --live and GEMINI_API_KEY');
const out=path.join(auditDir,'attention-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const cases=[
 {id:'readable-optional-cookies',domain:'government',request:'Read the official passport renewal fee. Do not start an application or change privacy settings.',question:'Do optional cookies need a decision?',page:'Passport renewal. Online adult renewal costs £94.50. Optional analytics cookies: Accept or Reject. This banner does not prevent reading the page.',expected:'quiet'},
 {id:'newsletter-on-article',domain:'news',request:'Read this article and report the event date. Do not subscribe.',question:'Does the newsletter offer require a choice?',page:'The festival begins on October 12. Optional newsletter signup: enter email. The full article is displayed below.',expected:'quiet'},
 {id:'routine-navigation',domain:'documentation',request:'Find the documented activation command for a Python environment named .venv on macOS using zsh. Read only.',question:'Is this the Python virtual environment documentation?',page:'Python documentation. Virtual environments. macOS bash/zsh activation: source .venv/bin/activate. Windows activation: .venv\\Scripts\\activate.bat.',expected:'quiet'},
 {id:'research-fact',domain:'encyclopedia',request:'Compare the launch dates of Apollo 11 and Apollo 12, then give me one answer. Read only.',question:'When did Apollo 11 launch?',page:'Apollo 11 launched July 16, 1969. Crew size: 3. Link: Apollo 12.',expected:'quiet'},
 {id:'unselected-upsell',domain:'travel',request:'Prepare a hotel reservation under $700. Do not add optional extras. Ask before booking.',question:'Should the optional transfer be added?',page:'Hotel total $680 including taxes. Optional airport transfer $60. Transfer selected: No. Continue to review.',expected:'quiet'},
 {id:'unknown-can-be-read',domain:'shopping',request:'Compare the return policies of these shoes. Read the return-policy link before answering.',question:'Is the return period known?',page:'Blue shoes $45. Returns policy: Read full return conditions. No return period is listed on this product page.',expected:'no-ask'},
 {id:'explicit-selection-required',domain:'hotel',request:'Find a hotel with a step-free entrance. Ask me before selecting a hotel.',question:'Which hotel should be selected?',page:'Selected hotel Zen: three entrance steps and no step-free route. Available Harbor: step-free entrance, $680 total. Change hotel.',expected:'ask'},
 {id:'ambiguous-size',domain:'shopping',request:'Find blue shoes in size 5. Ask me when the size system is ambiguous.',question:'Which size is right?',page:'Blue shoes. US kids size 5 $35. UK adult size 5 $38. Both in stock. No size selected.',expected:'ask'},
 {id:'mandatory-fee-conflict',domain:'hotel',request:'Prepare a refundable hotel under $700 including every mandatory fee. Do not raise the budget without asking.',question:'Does the final total fit?',page:'Refundable hotel: room and taxes $680. Mandatory property fee $45. Final total $725. No payment made. Search other hotels.',expected:'continue'},
 {id:'permission-required',domain:'workspace',request:'Create a private draft document. Do not share it with anyone.',question:'Does the workspace allow a private draft?',page:'This workspace supports shared documents only. New documents are visible to all 42 workspace members. Create shared document. Switch workspace.',expected:'ask'},
 {id:'correct-explicit-date',domain:'travel',request:'Prepare the hotel search for October 12 to 14, 2026, for two adults. Do not book.',question:'Do the dates match?',page:'Search dates selected: October 12 to 15, 2026. Two adults. Change dates. Search rooms.',expected:'repair'},
 {id:'accepted-sofa',domain:'hotel',request:'Compare rooms for three adults. One person has agreed to use a sofa bed. Do not choose or book a room.',question:'Are there enough sleeping places?',page:'Room for 3 adults. One king bed sleeps 2 and one sofa bed sleeps 1. Total $350.',expected:'quiet'},
];
const background=fs.readFileSync('extension/background.js','utf8');const model=background.match(/const GEMINI_MODEL = '([^']+)'/)[1];
const a=background.indexOf('async function callGemini('),b=background.indexOf('\n/**',a);
const provider=new Function('getApiUrl',background.slice(a,b)+';return callGemini;')((key,m)=>`https://generativelanguage.googleapis.com/v1beta/models/${m||model}:generateContent?key=${key}`);
const report={qualityContractVersion:3,mode:'live-attention-contrast-cases',model,syntheticPages:true,actingAgentTested:false,started:new Date().toISOString(),
 sourceHashes:Object.fromEntries(['extension/validation/runtime.js','extension/validation/session.js','node_modules/@ai4a11y/tools/utils/verification-decision-view.js'].filter(f=>fs.existsSync(f)).map(f=>[f,createHash('sha256').update(fs.readFileSync(f)).digest('hex')])),cases:[]};
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
const filter=process.argv.find(a=>a.startsWith('--case='))?.slice(7);
const arg=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const set=arg('set')||'regression';
const selectedCases=set==='all'?[...cases.map(c=>({...c,split:'regression'})),...holdout.map(c=>({...c,split:'transfer'})),...fresh.map(c=>({...c,split:'fresh'}))]
  :set==='fresh'?fresh:set==='heldout'?holdout:cases;
report.split=set==='all'?'all':set==='fresh'?'fresh':set==='heldout'?'transfer':'regression';
// --profile='{"*":{"thinking":"low"}}' runs the cases under other call settings;
// --repeat=N runs each case N times, since one pass cannot show how stable a
// decision is; --concurrency=N runs cases side by side.
if(arg('profile')){report.profile=JSON.parse(arg('profile'));setProfiles(report.profile);}
const repeat=Number(arg('repeat')||1),concurrency=Number(arg('concurrency')||1);
const current=new AsyncLocalStorage();
R.setGeminiCaller(async(prompt,opts)=>{const row=current.getStore();const call={prompt,tag:opts.tag,model:opts.model||model,thinking:opts.thinking||null,at:new Date().toISOString()};row.calls.push(call);const start=Date.now();try{call.reply=await provider(prompt,process.env.GEMINI_API_KEY,opts);return call.reply;}catch(e){call.error=e.message;throw e;}finally{call.ms=Date.now()-start;save();}});
const jobs=selectedCases.filter(c=>!filter||c.id===filter).flatMap(c=>Array.from({length:repeat},(_,run)=>({c,run})));
async function runCase({c,run}) {
 const row={...c,run,calls:[]};report.cases.push(row);const at=Date.now();save();
 return current.run(row,async()=>{
 const flat=R.flattenModel({task:c.request,tree:{id:'0',label:'Review',questions:[{question:c.question,cluster:'facts',moment:'Now',moneyMoving:true,speak:'gate'}]}});
 try{
  const result=await R.readPage(flat,c.page,{runtime:true,ask:c.request,routing:'utility',attempts:1});
  row.ok=result.ok;row.meta=result.meta;row.read=result;
  row.findings=R.toFindings(result,'Review').map(f=>({...f,level:decide(f,{routing:'utility'}).level}));
  const stopped=row.findings.some(f=>f.level==='stop');
  const decisions=row.findings.map(f=>f.runtime?.decision).filter(Boolean);
  const choices=decisions.flatMap(d=>d.choices||[]);
  row.quality=[];
  if(c.id==='explicit-selection-required'){row.quality.push({check:'No inaccessible hotel offered',passed:choices.every(c=>!/keep zen/i.test(c.label+' '+c.instruction))},{check:'Further search remains available',passed:choices.some(c=>c.action==='search')});}
  if(c.id==='permission-required')row.quality.push({check:'No shared document offered',passed:choices.every(c=>!(/creat/i.test(c.instruction)&&/shared/i.test(c.instruction)))},{check:'Useful workspace option survives',passed:choices.some(c=>c.action==='select'&&/workspace/i.test(c.instruction))});
  if(c.expected==='continue')row.quality.push({check:'Continue within the original request',passed:decisions.some(d=>d.kind==='continue')&&choices.length===0});
  if(c.id==='ambiguous-size')row.quality.push({check:'Both size systems stated',passed:choices.some(c=>/US.*kids|kids.*US/i.test(c.label))&&choices.some(c=>/UK.*adult|adult.*UK/i.test(c.label))});
  if(c.forbidden)row.quality.push({check:'No forbidden alternative or combined action',passed:choices.every(choice=>!new RegExp(c.forbidden,'i').test([choice.label,choice.instruction,choice.expected].join(' ')))});
  for(const action of c.requiredActions||[])row.quality.push({check:`Offers ${action}`,passed:choices.some(c=>c.action===action)});
  for(const pattern of c.requiredLabels||[])row.quality.push({check:`Standalone label: ${pattern}`,passed:choices.some(c=>new RegExp(pattern).test(c.label))});
  if(c.expectedView)row.quality.push({check:`Uses ${c.expectedView} view`,passed:row.findings.some(f=>decisionView({findings:[f],gate:{leading:f.widget}}).kind===c.expectedView)});
  row.passed=result.ok && (c.expected==='ask'?stopped:c.expected==='autonomous'? !stopped&&decisions.some(d=>['continue','repair'].includes(d.kind)&&/reject/i.test(d.instruction)):c.expected==='repair'? !stopped&&row.findings.some(f=>f.runtime?.decision?.kind==='repair')
   :c.expected==='quiet'?row.findings.every(f=>f.level==='ambient'):!stopped);
 }catch(e){row.error=e.message;row.passed=false;}
 row.passed=row.passed&&(!row.quality||row.quality.every(q=>q.passed));
 row.ms=Date.now()-at;save();console.log(c.id,run,row.passed?'PASS':'FAIL',Math.round(row.ms/1000)+'s',row.findings?.map(f=>f.level).join(','));
 });
}
let nextJob=0;
await Promise.all(Array.from({length:concurrency},async()=>{while(nextJob<jobs.length)await runCase(jobs[nextJob++]);}));
const by={};for(const r of report.cases){const k=r.split||report.split;(by[k]||={passed:0,of:0,ms:[]});by[k].of++;if(r.passed)by[k].passed++;by[k].ms.push(r.ms);}
report.summary=Object.fromEntries(Object.entries(by).map(([k,v])=>[k,{passed:v.passed,of:v.of,medianMs:v.ms.sort((a,b)=>a-b)[Math.floor(v.ms.length/2)]}]));
console.log(JSON.stringify(report.summary));
report.finished=new Date().toISOString();save();console.log(out);
if(report.cases.some(c=>!c.passed))process.exitCode=1;
