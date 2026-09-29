import assert from 'node:assert/strict';
const store={};
const area={async get(keys){return Object.fromEntries([].concat(keys).map(k=>[k,store[k]]));},
  async set(v){Object.assign(store,structuredClone(v));},async remove(k){delete store[k];}};
globalThis.chrome={storage:{local:area,sync:area},runtime:{async sendMessage(){}},
  tabs:{async get(id){return{id,url:'https://overlap.fixture/',title:'Form'};}}};
let page='Name: empty.',effects=[],reviewStarted,releaseReview,reviewFinished=false,actorDuringReview=false,mode;
globalThis.BrowserHarness={async attach(){},async detach(){},async waitForLoad(){return true;},
  async enumerateInteractive(){return{items:[],structurals:[]};},
  async captureScreenshot(){return{data:'AAA',scale:1,width:10,height:10};},
  async axSnapshot(){return{text:page,url:'https://overlap.fixture/'};},
  async describeActionTarget(){return{backendNodeId:11,tag:'INPUT',label:'Name'};},
  async typeText(_id,text){assert(reviewFinished,'verification finishes before any mutation');effects.push(text);page='Name: '+text;},
  async wait(){},setAgentBusy(){},healthSnapshot(){return{};}};
const R=await import('../extension/validation/reasoner.js');
const {default:V}=await import('../extension/validation/session.js');
const A=await import('../extension/browser-harness/src/agent/run.js');
const S=await import('../extension/browser-harness/src/agent/state.js');
globalThis.BrowserAgent={isRunning:A.bhAgentIsRunning,isPaused:A.bhAgentIsPaused,pause:A.bhAgentPause,
  resume:A.bhAgentResume,stop:A.bhAgentStop,interject:A.bhAgentInterject};
const model={task:'Fill the name',tree:{id:'0',label:'Form',children:[{id:'1',label:'Details',
  questions:[{question:'Does the name match?',cluster:'facts',moment:'Now'}]}]}};
R.setGeminiStreamCaller(null);
for(mode of ['unchanged','correction','failure','stop','page-change']){
  page='Name: empty.';effects=[];reviewFinished=false;actorDuringReview=false;let first=true,turns=0,reads=0;
  let begin;reviewStarted=new Promise(r=>begin=r);
  const blocked=new Promise(r=>releaseReview=r);
  R.setGeminiCaller(async(prompt,opts)=>{
    if(opts.tag==='read-page'){reads++;return JSON.stringify({alignedPhase:'Details',alignedNodes:['1'],answers:[],noticed:[]});}
    if(opts.tag==='review-evidence'){
      if(first){first=false;begin();await blocked;
        if(mode==='correction')A.bhAgentInterject('Use NEW instead of OLD.');
        reviewFinished=true;
      }
      if(mode==='failure')throw Error('Reviewer unavailable');
      const goals=JSON.parse(prompt.split('Requested outcomes: ')[1].split('\n')[0]);
      return JSON.stringify({reviews:[],outcomes:[],milestones:goals.map(g=>({goalId:g.id,status:'unknown',quote:''})),branch:{changed:false}});
    }
    if(opts.tag==='verify-action'){
      if(mode==='page-change'){assert(reads>=2,'a changed page gets a fresh read');assert(prompt.includes('Name: changed during planning.'));}
      return JSON.stringify({kind:'reversible',quote:'Name',label:'',expected:'',
        requestCheck:{status:'consistent',quote:V.request(),reason:'The explicit name is being entered.'}});
    }
    if(opts.tag==='verify-completion')return JSON.stringify({checks:[{id:'task',status:'complete',basis:'page',
      sourceId:'current',quote:page,reason:'The field contains the requested name.'}]});
    throw Error('Unexpected '+opts.tag);
  });
  const taskId='overlap-'+mode;
  await V.start('Fill the name OLD.',{taskId,request:'Fill the name OLD.',tabId:7,requireModel:true,runtimeVerification:true,routing:'utility'});
  ValidationTaskModel.load({...model,taskId,request:V.request()});await V.setModelState({taskId,status:'ready'});
  S.setGeminiCaller(async prompt=>{
    if(++turns===1){
      await reviewStarted;
      actorDuringReview=!reviewFinished;
      return JSON.stringify({action:'type',text:'OLD'});
    }
    if(mode==='correction'&&turns===2){assert(prompt.includes('Use NEW instead of OLD.'));return JSON.stringify({action:'type',text:'NEW'});}
    return JSON.stringify({action:'done',summary:'The name is entered.'});
  });
  const run=A.bhAgentRun('Fill the name OLD.',{taskId,tabId:7,maxSteps:5});
  // A timeout only detects a missing overlap. Release in finally so a failed
  // assertion cannot leave a blocked verifier or agent behind.
  let timer;
  try{
    await Promise.race([reviewStarted,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Page verification did not start alongside planning')),1000);})]);
    await new Promise(r=>setTimeout(r,30));
    assert(actorDuringReview,'actor planning starts while the independent reviewer is still pending');
    assert.deepEqual(effects,[],'planning cannot change the page while verification is pending');
    if(mode==='stop')A.bhAgentStop();
    if(mode==='page-change')page='Name: changed during planning.';
  }finally{clearTimeout(timer);releaseReview();}
  await run;
  assert.deepEqual(effects,['failure','stop'].includes(mode)?[]:mode==='correction'?['NEW']:['OLD']);
  assert.equal(store.bhAgent.status,['failure','stop'].includes(mode)?'stopped':'done');
  await V.stop();
}
console.log('PASS planning overlaps production verification; execution waits; late corrections discard the plan; failed reviews stop');
