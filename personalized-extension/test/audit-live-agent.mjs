// Opt-in live actor + live verifier on public reading tasks. No saved profile.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer';
import {createHash} from 'node:crypto';
import { auditDir } from './audit-dir.mjs';
if(!process.argv.includes('--live') || !process.env.GEMINI_API_KEY)throw Error('Requires --live and GEMINI_API_KEY');
const out=path.join(auditDir,'agent-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const tasks=[
  {id:'agent-poetry-comparison',domain:'books.toscrape.com',url:'https://books.toscrape.com/',
    request:'On this demonstration book shop, open the Poetry category and compare the books priced below £30. Report their full titles, prices, and availability with source URLs. Do not buy anything, add to a basket, sign in, or fill any form.'},
  {id:'agent-python-documentation',domain:'docs.python.org',url:'https://docs.python.org/3/tutorial/',
    request:'Find the Python documentation for virtual environments. Report the command to create an environment named .venv and the command to activate it on macOS with zsh. Include the documentation URL. Read only; do not download, execute commands, or fill forms.'},
  {id:'agent-poetry-budget-change',domain:'books.toscrape.com',url:'https://books.toscrape.com/',
    request:'On this demonstration book shop, open the Poetry category and report every available book below £20. Give the full title, price and source URL for each. Do not buy anything, add to a basket, sign in, or fill any form.'},
  {id:'agent-html-button',domain:'developer.mozilla.org',url:'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button',
    request:'Using MDN, tell me how to make a button inside a form that does not submit it. Explain the default button type and give one correct HTML example with its source URL. Read only. Do not execute examples, fill forms, or change site preferences.'},
  {id:'agent-apollo-comparison',domain:'en.wikipedia.org',url:'https://en.wikipedia.org/wiki/Apollo_11',
    request:'Compare the launch dates and crew sizes of Apollo 11 and Apollo 12 using their Wikipedia articles. Give both dates, both crew sizes and both source URLs in one answer. Read only; do not edit articles or fill forms.'},
  {id:'agent-passport-information',domain:'gov.uk',url:'https://www.gov.uk/renew-adult-passport',
    request:'Find the online UK adult passport renewal fee and the stated processing time for an applicant in the UK. Give the official source URLs. Read only. Do not start an application, fill forms, or change cookie preferences.'},
];
const report={mode:'live-actor-and-verifier-public-reading',actingAgentTested:true,taskModelFromRequest:true,
  started:new Date().toISOString(),model:'gemini-3.5-flash',tasks:[],limitations:['Public reading tasks only. No authenticated tasks or real transactions. A model completion claim still needs independent review.']};
report.sourceHashes=Object.fromEntries(['extension/validation/runtime.js','extension/validation/session.js','extension/validation/reasoner.js','extension/validation/generate.js','extension/validation/quick-model.js','extension/browser-harness/src/harness/input.js','extension/browser-harness/src/agent/constants.js','extension/browser-harness/src/agent/exec.js','extension/background.js'].filter(file=>fs.existsSync(file)).map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
const browser=await puppeteer.launch({headless:true,protocolTimeout:30000,
  userDataDir:fs.mkdtempSync(path.join(out,'profile-')),defaultViewport:{width:1440,height:1000},
  args:[`--disable-extensions-except=${path.resolve('extension')}`,`--load-extension=${path.resolve('extension')}`,'--no-first-run','--mute-audio']});
console.log('AGENT AUDIT',out);save();
try{
  const target=await browser.waitForTarget(t=>t.type()==='service_worker'&&t.url().includes('background'),{timeout:30000});
  const worker=await target.worker();
  await worker.evaluate(key=>{
    globalThis.auditCalls=[];
    const call=async(prompt,opts={})=>{
      const c={tag:opts.tag||'actor',prompt,images:opts.images||[],at:new Date().toISOString()};auditCalls.push(c);const at=Date.now();
      try{c.reply=await callGemini(prompt,key,opts);return c.reply;}
      catch(e){c.error=e.message;throw e;}finally{c.ms=Date.now()-at;}
    };
    BrowserAgent.setGeminiCaller((prompt,_key,opts)=>call(prompt,ValidationModelCall.withProfile('actor',opts||{})));
    ValidationReasoner.setGeminiCaller(call);ValidationReasoner.setGeminiStreamCaller(null);
    ValidationGenerate.setCaller((prompt,opts)=>call(prompt,{...opts,timeoutMs:opts?.timeoutMs??180000}));
    for(const method of ['typeText','typeIndex','uploadFileIndex','selectDropdown']){
      BrowserHarness[method]=async()=>{throw Error('This audit only permits reading and navigation.');};
    }
  },process.env.GEMINI_API_KEY);
  const filter=process.argv.find(a=>a.startsWith('--task='))?.slice(7);
  for(const task of tasks.filter(t=>!filter||filter.split(',').includes(t.id))){
    const entry={...task,status:'running',steps:[]};report.tasks.push(entry);save();
    const page=await browser.newPage();await page.setUserAgent((await browser.userAgent()).replace('HeadlessChrome','Chrome'));
    await page.goto(task.url,{waitUntil:'domcontentloaded',timeout:35000});await page.bringToFront();
    const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,page.url());
    await worker.evaluate(()=>{auditCalls.length=0;});
    const preparationAt=Date.now();
    if(process.argv.includes('--background')){
      const other=await browser.newPage();await other.goto('about:blank');
      entry.backgroundInput=true;
    }
    // Starting in the worker keeps the real controller and executor path.
    await worker.evaluate(({task,tabId})=>{
      globalThis.auditStart=null;
      ValidationController.start({task,tabId,maxSteps:14}).then(r=>{globalThis.auditStart=r;})
        .catch(e=>{globalThis.auditStart={error:e.message};});
    },{task:task.request,tabId});
    let last='',terminal=null;
    const deadline=Date.now()+8*60*1000;
    while(Date.now()<deadline){
      const data=await worker.evaluate(async()=>({start:globalThis.auditStart,
        calls:globalThis.auditCalls,storage:await chrome.storage.local.get(['aa.validation','bhAgent','aa.validation.model'])}));
      const s=data.storage['aa.validation'],agent=data.storage.bhAgent;
      entry.calls=data.calls.map(({images,...call},i)=>({...call,imageFiles:(images||[]).map((image,j)=>{
        const file=`${task.id}-call-${i+1}-image-${j+1}.png`;
        if(!fs.existsSync(path.join(out,file)))fs.writeFileSync(path.join(out,file),Buffer.from(image.split(',')[1],'base64'));
        return file;
      })}));entry.prepared=data.start;
      if(data.start && entry.preparationMs==null)entry.preparationMs=Date.now()-preparationAt;
      const identity=JSON.stringify([agent?.step,agent?.status,s?.observation,s?.gate,s?.completion]);
      if(identity!==last){
        last=identity;const row={index:entry.steps.length+1,at:new Date().toISOString(),url:page.url(),title:agent?.status||s?.modelState?.status,
          gate:s?.gate,observation:s?.observation,findings:s?.findings,completion:s?.completion,agent,progress:s?.progress,runtime:s?.runtimeState};
        entry.steps.push(row);save();console.log(task.id,row.index,row.title,s?.observation?.status||'',s?.gate?.allowed===false?'HELD':'');
      }
      if(data.start?.error){terminal='start-failed';break;}
      if(data.start?.started && agent?.taskId===data.start.taskId && ['done','stopped','error'].includes(agent?.status)){terminal=agent.status;entry.final=data.storage;break;}
      if(data.start?.started && s?.taskId===data.start.taskId && s?.gate?.allowed===false && s?.modelState?.status==='ready'){
        terminal='needs-user-answer';entry.final=data.storage;break;
      }
      save();
      await new Promise(r=>setTimeout(r,1000));
    }
    entry.status=terminal||'audit-time-limit';
    entry.totalMs=Date.now()-preparationAt;
    entry.final=await worker.evaluate(async()=>chrome.storage.local.get(['aa.validation','bhAgent','aa.validation.model']));
    const snap=await worker.evaluate(id=>BrowserHarness.axSnapshot(id),tabId).catch(e=>({error:e.message}));
    fs.writeFileSync(path.join(out,task.id+'-final-page.json'),JSON.stringify(snap,null,2));
    await page.screenshot({path:path.join(out,task.id+'-final.png')});
    entry.evidenceFile=task.id+'-final-page.json';entry.screenshot=task.id+'-final.png';
    await worker.evaluate(async()=>{BrowserAgent.stop();ValidationController.cancel();await Validation.stop();});
    await worker.evaluate(async()=>{const end=Date.now()+15000;while(BrowserAgent.isRunning()&&Date.now()<end)await new Promise(r=>setTimeout(r,100));if(BrowserAgent.isRunning())throw Error('Agent did not finish stopping');});
    save();console.log('RESULT',task.id,entry.status);await page.close();
  }
}catch(e){report.error=e.message;console.log('ERROR',e.message);}
finally{await browser.close();report.finished=new Date().toISOString();save();}
console.log('REPORT',path.join(out,'report.json'));
if(report.error||report.tasks.some(t=>t.status!=='done'))process.exitCode=1;
