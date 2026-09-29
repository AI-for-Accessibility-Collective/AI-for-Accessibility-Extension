// Opt-in: real actor, real verifier, real extension UI, interactive local sites.
// Site outcomes are scored without using the model's own completion verdict.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer';
import {workflows as tuned,matchesPreference} from './fixtures/interactive-workflows.mjs';
import {holdoutWorkflows} from './fixtures/holdout-workflows.mjs';
// --set=holdout runs the workflows that were never used to change anything.
const workflows=process.argv.includes('--set=holdout')?holdoutWorkflows:tuned;
import {decisionContext} from '@ai4a11y/tools/utils/verification-decisions.js';
import { auditDir } from './audit-dir.mjs';
// --profile='{"actor":{"thinking":"low"}}' changes only the calls it names.
const profileArg=process.argv.find(a=>a.startsWith('--profile='))?.slice(10);
if(!process.argv.includes('--live')||!process.env.GEMINI_API_KEY)throw Error('Requires --live and GEMINI_API_KEY');
const filter=process.argv.find(a=>a.startsWith('--task='))?.slice(7);
if(filter&&filter.split(',').some(id=>!workflows.some(t=>t.id===id)))throw Error('Unknown workflow');
const out=path.join(auditDir,'workflows-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid+(filter?'-'+filter.replaceAll(',','-'):''));
fs.mkdirSync(out,{recursive:true});
const report={mode:'live-interactive-workflows',started:new Date().toISOString(),model:'gemini-3.5-flash',actingAgentTested:true,
  taskModelFromRequest:true,realDecisionInterface:true,tasks:[],
  limitations:['Authored local websites, not real accounts or transactions. Scripted user preferences, not participant evidence.']};
const sources=['test/fixtures/fresh-workflows.mjs','extension/validation/progress.js','test/fixtures/interactive-workflows.mjs','test/audit-live-workflows.mjs','extension/validation/runtime.js','extension/validation/model-call.js','extension/validation/policy.js','utils/ai.js','extension/validation/session.js','extension/validation/reasoner.js','extension/validation/generate.js','extension/validation/quick-model.js','extension/validation/controller.js','extension/validation/panel.js','node_modules/@ai4a11y/tools/utils/verification-decision-view.js','extension/browser-harness/src/agent/run.js','extension/browser-harness/src/agent/exec.js','extension/browser-harness/src/agent/constants.js','extension/browser-harness/src/harness/injected/page-helpers.bhinject','extension/browser-harness/src/harness/ax.js','extension/validation/dist/validation.js','extension/browser-harness/dist/agent.js','extension/browser-harness/dist/harness.js'];
report.sourceHashes=Object.fromEntries(sources.filter(f=>fs.existsSync(f)).map(f=>[f,createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
let active;
const server=http.createServer((req,res)=>{
  if(!active){res.writeHead(503);res.end();return;}
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith('/'+active.id+'/')){res.writeHead(404);res.end();return;}
  const body=active.fixture.serve(url,active.truth,(type,data)=>active.events.push({at:Date.now(),type,data:structuredClone(data)}));
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(body);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await puppeteer.launch({headless:true,protocolTimeout:120000,
  userDataDir:fs.mkdtempSync(path.join(out,'profile-')),defaultViewport:{width:1280,height:1000},
  args:[`--disable-extensions-except=${path.resolve('extension')}`,`--load-extension=${path.resolve('extension')}`,'--no-first-run','--mute-audio']});
console.log('WORKFLOW AUDIT',out);save();
try{
  const target=await browser.waitForTarget(t=>t.type()==='service_worker'&&t.url().includes('background'),{timeout:30000});
  const worker=await target.worker();const extensionId=new URL(target.url()).host;
  report.workerErrors=[];worker.on('console',m=>{if(['error','warning','warn'].includes(m.type()))report.workerErrors.push({at:Date.now(),type:m.type(),text:m.text().slice(0,2000)});});
  const panel=await browser.newPage();await panel.setViewport({width:390,height:844});
  await panel.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
  await panel.evaluate(()=>{
    globalThis.auditUI=[];
    const send=chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage=async(...args)=>{
      const entry=args[0]?.type==='validationAnswer'?{message:args[0],at:Date.now()}:null;
      if(entry)auditUI.push(entry);
      try{const result=await send(...args);if(entry){entry.result=result;entry.finishedAt=Date.now();}return result;}
      catch(e){if(entry){entry.error=e.message;entry.finishedAt=Date.now();}throw e;}
    };
  });
  await worker.evaluate((key,profile)=>{
    globalThis.auditCalls=[];
    if(profile)globalThis.ValidationModelCall?.setProfiles(JSON.parse(profile),{merge:true});
    const call=async(prompt,opts={})=>{
      const c={tag:opts.tag||'actor',prompt,responseSchema:opts.responseSchema,images:opts.images||[],at:Date.now()};auditCalls.push(c);
      try{c.reply=await callGemini(prompt,key,opts);return c.reply;}
      catch(e){c.error=e.message;throw e;}finally{c.ms=Date.now()-c.at;}
    };
    BrowserAgent.setGeminiCaller((prompt,_key,opts)=>call(prompt,ValidationModelCall.withProfile('actor',opts||{})));
    ValidationReasoner.setGeminiCaller(call);ValidationReasoner.setGeminiStreamCaller(null);
    ValidationGenerate.setCaller((prompt,opts)=>call(prompt,{...opts,timeoutMs:opts?.timeoutMs??180000}));
  },process.env.GEMINI_API_KEY,profileArg||null);
  report.profile=profileArg?JSON.parse(profileArg):null;
  for(const fixture of workflows.filter(t=>!filter||filter.split(',').includes(t.id))){
    const entry={id:fixture.id,title:fixture.title,request:fixture.request,status:'running',expectedDecisions:fixture.expectedDecisions,
      steps:[],answers:[],events:[],truth:structuredClone(fixture.initial),errors:[]};
    report.tasks.push(entry);active={...entry,fixture};save();
    const page=await browser.newPage();page.on('pageerror',e=>entry.errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request',request=>{
      const allowed=request.url().startsWith(origin+'/')||request.url().startsWith('chrome-extension://')||request.url().startsWith('data:');
      if(!allowed)entry.errors.push('Attempted external page request: '+request.url());
      void(allowed?request.continue():request.abort());
    });
    await page.goto(`${origin}/${fixture.id}/start`,{waitUntil:'domcontentloaded'});
    const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,page.url());
    await panel.bringToFront();
    await worker.evaluate(()=>{auditCalls.length=0;});
    const startedAt=Date.now();
    await worker.evaluate(({task,tabId})=>{
      globalThis.auditStart=null;
      ValidationController.start({task,tabId,maxSteps:36}).then(r=>{auditStart=r;}).catch(e=>{auditStart={error:e.message};});
    },{task:fixture.request,tabId});
    let last='',terminal=null,answered=new Set(),lastStatusAt=0;
    const deadline=startedAt+20*60*1000;
    while(Date.now()<deadline){
      const data=await worker.evaluate(async()=>({start:globalThis.auditStart,calls:globalThis.auditCalls,
        storage:await chrome.storage.local.get(['aa.validation','bhAgent','aa.validation.model'])}));
      const s=data.storage['aa.validation'],agent=data.storage.bhAgent;
      const actorStep=agent?.log?.findLast(event=>Number.isInteger(event.step))?.step;
      entry.calls=data.calls.map(({images,...call},i)=>({...call,imageFiles:(images||[]).map((img,j)=>{
        const file=`${fixture.id}-call-${i+1}-${j+1}.png`;
        if(!fs.existsSync(path.join(out,file)))fs.writeFileSync(path.join(out,file),Buffer.from(img.split(',')[1],'base64'));
        return file;
      })}));
      entry.prepared=data.start;if(data.start&&entry.preparationMs==null)entry.preparationMs=Date.now()-startedAt;
      const identity=JSON.stringify([actorStep,agent?.log?.length,agent?.status,s?.observation,s?.gate,s?.completion,entry.events.length]);
      if(identity!==last){
        last=identity;entry.steps.push({index:entry.steps.length+1,at:Date.now(),url:page.url(),truth:structuredClone(entry.truth),
          actorStep,agent,gate:s?.gate,observation:s?.observation,findings:s?.findings,runtime:s?.runtimeState,completion:s?.completion});
        console.log(fixture.id,'step',actorStep,agent?.status,s?.observation?.status,entry.truth.stage,s?.gate?.allowed===false?'HELD':'');
      }
      if(Date.now()-lastStatusAt>30000){lastStatusAt=Date.now();console.log(fixture.id,'calls',entry.calls.length,'elapsed',Math.round((Date.now()-startedAt)/1000));}
      if(data.start?.error){terminal='start-failed';break;}
      if(data.start?.started&&agent?.taskId===data.start.taskId&&['done','stopped','error'].includes(agent?.status)){terminal=agent.status;break;}
      if(data.start?.started&&s?.taskId===data.start.taskId&&s?.gate?.allowed===false&&s?.modelState?.status==='ready'){
        const ctx=decisionContext(s),decision=ctx.finding?.runtime?.decision;
        if(!answered.has(ctx.decisionKey)){
          const preference=fixture.preference(entry.truth,entry.answers);
          const choices=decision?.choices||[];
          // Do not choose a different action just because its label contains
          // the desired name. A handover or a search is not that selection.
          const compatible=choices.find(c=>matchesPreference(preference,c));
          const answer={index:entry.answers.length+1,at:Date.now(),stage:entry.truth.stage,preference:preference?.id||null,
            message:decision?.message,question:decision?.question,choices,decisionKey:ctx.decisionKey,chosen:compatible||null,
            expectedAnswer:preference?.answer,matchedOption:Boolean(compatible),submitted:false};
          answer.messageWords=`${decision?.message||''} ${decision?.question||''}`.trim().split(/\s+/).filter(Boolean).length;
          answer.msSinceLastSiteAction=entry.events.length?answer.at-entry.events.at(-1).at:null;
          entry.answers.push(answer);answered.add(ctx.decisionKey);save();
          await panel.waitForSelector('.va-gate button',{timeout:10000});
          answer.ui=await panel.$eval('.va-gate',n=>({text:n.innerText,role:n.getAttribute('role'),
            view:n.querySelector('[data-view]')?.dataset.view,buttons:[...n.querySelectorAll('button')].map(b=>({label:b.textContent,height:b.getBoundingClientRect().height})),
            overflow:document.documentElement.scrollWidth>innerWidth}));
          answer.screenshot=`${fixture.id}-decision-${answer.index}.png`;
          await panel.screenshot({path:path.join(out,answer.screenshot),fullPage:true});
          if(!preference){terminal='unexpected-question';answer.error='No user judgment is needed at this authored stage.';break;}
          if(entry.answers.filter(a=>a.preference===preference.id).length>2){terminal='repeated-question';break;}
          if(!compatible){terminal='missing-useful-option';break;}
          const buttons=await panel.$$('.va-gate button');
          const expectedButtonKey=`answer:${ctx.decisionKey}:runtime:${choices.findIndex(c=>c.id===compatible.id)}`;
          let pressed=false;
          for(const b of buttons){if(await b.evaluate(n=>n.dataset.vaKey)===expectedButtonKey){
            await b.focus();answer.at=Date.now();await panel.keyboard.press('Enter');pressed=true;break;
          }}
          if(!pressed){terminal='missing-ui-option';break;}
          await panel.waitForFunction(key=>auditUI.some(a=>a.message.decisionKey===key&&(a.result||a.error)),{timeout:180000},ctx.decisionKey);
          answer.response=await panel.evaluate(key=>auditUI.find(a=>a.message.decisionKey===key&&(a.result||a.error)),ctx.decisionKey);
          answer.responseMs=answer.response?.finishedAt-answer.response?.at;
          answer.submitted=answer.response?.message?.kind==='runtime'
            && answer.response.message.choiceId===compatible.id
            && (answer.response?.result?.resolved===true||answer.response?.result?.changed===true);
          if(!answer.submitted){terminal='ui-answer-rejected';break;}
          console.log('ANSWER',fixture.id,preference.id,compatible.label);
        }
      }
      save();await new Promise(r=>setTimeout(r,1000));
    }
    entry.status=terminal||'audit-time-limit';entry.totalMs=Date.now()-startedAt;
    entry.callTimings=Object.fromEntries([...new Set(entry.calls.map(c=>c.tag))].map(tag=>{
      const calls=entry.calls.filter(c=>c.tag===tag),finished=calls.filter(c=>Number.isFinite(c.ms));
      return[tag,{calls:calls.length,finished:finished.length,errors:calls.filter(c=>c.error).length,
        totalMs:finished.reduce((sum,c)=>sum+c.ms,0),maxMs:Math.max(0,...finished.map(c=>c.ms))}];
    }));
    entry.final=await worker.evaluate(async()=>chrome.storage.local.get(['aa.validation','bhAgent','aa.validation.model']));
    entry.checks=fixture.oracle(entry.truth,entry.events,entry.answers).map(([id,pass])=>({id,pass:pass===true}));
    entry.checks.push({id:'all-required-decisions',pass:fixture.expectedDecisions.every(id=>entry.answers.some(a=>a.preference===id&&a.submitted))},
      {id:'no-repeated-decisions',pass:fixture.expectedDecisions.every(id=>entry.answers.filter(a=>a.preference===id).length<=1)},
      {id:'no-unexpected-decisions',pass:entry.answers.every(a=>a.preference)},
      {id:'useful-options',pass:entry.answers.every(a=>a.matchedOption)},
      {id:'agent-completed',pass:entry.status==='done'});
    entry.passed=entry.checks.every(c=>c.pass);
    entry.evidenceFile=fixture.id+'-final-page.json';
    fs.writeFileSync(path.join(out,entry.evidenceFile),JSON.stringify(await worker.evaluate(id=>BrowserHarness.axSnapshot(id),tabId),null,2));
    entry.screenshot=fixture.id+'-final.png';await page.screenshot({path:path.join(out,entry.screenshot)});
    await worker.evaluate(async()=>{BrowserAgent.stop();ValidationController.cancel();await Validation.stop();});
    await worker.evaluate(async()=>{const end=Date.now()+15000;while(BrowserAgent.isRunning()&&Date.now()<end)await new Promise(r=>setTimeout(r,100));});
    save();console.log('RESULT',fixture.id,entry.status,JSON.stringify(entry.checks));await page.close();
  }
}catch(e){report.error=e.message;for(const task of report.tasks.filter(t=>t.status==='running')){task.status='infrastructure-failed';task.passed=false;}console.log('ERROR',e.message);}
finally{await browser.close();await new Promise(r=>server.close(r));report.finished=new Date().toISOString();save();}
console.log('REPORT',path.join(out,'report.json'));
if(report.error||report.tasks.some(t=>!t.passed))process.exitCode=1;
