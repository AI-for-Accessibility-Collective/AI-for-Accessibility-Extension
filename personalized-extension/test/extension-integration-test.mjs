import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import puppeteer from 'puppeteer';
import { auditDir } from './audit-dir.mjs';

// Real built extension, storage, CDP actions and UI. Only provider replies are
// controlled. No real accounts, external sites, API calls or saved profiles.
const out = path.join(auditDir, 'browser-qc');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Hotel review fixture</title>
    <main><h1>Prepare hotel booking for review</h1><label for="guests">Adults</label>
    <input id="guests" value="1"><p id="state">Guests selected: 1 adult</p>
    <p>Room for 2 adults. Room for 3 adults.</p>
    <label><input id="breakfast" type="checkbox" checked>Breakfast included</label>
    <p>Total $180. This is a review only. No booking has been made.</p></main>
    <script>guests.oninput=()=>state.textContent='Guests selected: '+guests.value+' adults';</script></html>`);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ext = path.resolve('extension');
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 30000,
  userDataDir: fs.mkdtempSync(path.join(out, 'profile-')), defaultViewport: { width: 1000, height: 800 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-first-run', '--mute-audio'],
});
const errors = [];
try {
  const target = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().includes('background'), { timeout: 20000 });
  const worker = await target.worker();
  const id = new URL(target.url()).host;
  const panel = await browser.newPage();
  panel.on('pageerror', e => errors.push(e.message));
  await panel.goto(`chrome-extension://${id}/sidepanel/sidepanel.html`);
  const send = msg => panel.evaluate(m => chrome.runtime.sendMessage(m), msg);
  const page = await browser.newPage();
  const url = `http://127.0.0.1:${server.address().port}/hotel`;
  await page.goto(url);
  await page.focus('#guests');
  await page.$eval('#guests', el => el.select());
  const tabId = await worker.evaluate(async u => (await chrome.tabs.query({})).find(t => t.url === u).id, url);
  const enumerateControls=()=>worker.evaluate(id=>BrowserHarness.enumerateInteractive(id),tabId);
  let controlList=await enumerateControls();
  assert.equal(controlList.items.find(i=>i.attrs?.type==='checkbox')?.attrs.checked,'true');
  await worker.evaluate(({id,index})=>BrowserHarness.clickIndex(id,index),
    {id:tabId,index:controlList.items.find(i=>i.attrs?.type==='checkbox').idx});
  controlList=await enumerateControls();
  assert.equal(controlList.items.find(i=>i.attrs?.type==='checkbox')?.attrs.checked,'false',
    'the actor must see live unchecked state even while the HTML checked attribute remains');
  assert.equal(await page.evaluate(()=>document.querySelector('#breakfast').hasAttribute('checked')),true);
  await worker.evaluate(({id,index})=>BrowserHarness.clickIndex(id,index),
    {id:tabId,index:controlList.items.find(i=>i.attrs?.type==='checkbox').idx});
  console.log('actor checkbox state checked through the harness');
  await worker.evaluate(async () => {
    globalThis.qc = { turns: 0, mode: 'review', calls: [] };
    const complete = Validation.verifyCompletion.bind(Validation);
    Validation.verifyCompletion = async (...args) => {
      try { return await complete(...args); }
      catch (error) { qc.completionError = {message:error.message,stack:error.stack}; throw error; }
    };
    // The model the writer would return for this request, with the guest-count check.
    const coded = { cluster: 'facts', moment: 'Now', paradigm: 3, moneyMoving: false, why: 'the room must fit everyone.',
      costDims: { money: 1, privacy: 0, thirdParty: 0, safety: 0, reversibility: 0, recovery: 1 } };
    const model = { task: 'prepare a hotel booking for review', ask: 'under $200', tree: { id: '0', label: 'Prepare a hotel booking', plan: 'do 1, then 2.', children: [
      { id: '1', label: 'Set the search', plan: 'do 1.1.', children: [{ id: '1.1', label: 'Set the party', questions: [
        { question: 'Does the party the search is set to match the party you gave?', ...coded }] }] },
      { id: '2', label: 'Review', plan: 'do 2.1.', children: [{ id: '2.1', label: 'Read the total', questions: [
        { question: 'Is the total under $200?', ...coded, moment: 'After' }] }] },
    ] } };
    const q = ValidationReasoner.flattenModel(model).questions.find(q => q.question === 'Does the party the search is set to match the party you gave?');
    qc.question = q;
    await chrome.storage.sync.set({ verificationLayer: true });
    ValidationGenerate.setCaller(async (prompt, opts) => {
      qc.calls.push(opts.tag);
      if (qc.mode === 'failure') throw new Error('Fixture provider unavailable');
      if (qc.mode === 'slow') await new Promise(resolve => { qc.release = resolve; });
      if (opts.tag === 'quick-model') return JSON.stringify(model);
      if (opts.tag === 'code-hta') {
        const rows = JSON.parse(prompt.split('Questions: ')[1].split('\n')[0]);
        return JSON.stringify({ codings: rows.map(r => ({ id: r.id, cluster: 'facts', moment: 'Now', moneyMoving: false,
          costDims: { money: 0, privacy: 0, thirdParty: 0, safety: 0, reversibility: 0, recovery: 0 } })) });
      }
      throw new Error('Unexpected provider tag ' + opts.tag);
    });
    ValidationReasoner.setGeminiStreamCaller(null);
    ValidationReasoner.setGeminiCaller(async (prompt, opts) => {
      (qc.reads ||= []).push({tag:opts.tag,prompt});
      if (opts.tag === 'verify-completion') return JSON.stringify({ checks: [{ id: 'task',
        status: ['review', 'skill'].includes(qc.mode) ? 'complete' : 'incomplete', quote: 'Guests selected: 2 adults',
        sourceId: 'current', reason: 'The page is ready for review. It is not booked.' }] });
      if (opts.tag === 'review-evidence') {
        const proposals = JSON.parse(prompt.split('Proposals: ')[1].split('\n')[0]);
        const pending = JSON.parse(prompt.split('Pending changes to verify: ')[1].split('\n')[0]);
        const goals = JSON.parse(prompt.split('Requested outcomes: ')[1].split('\n')[0]);
        const current = JSON.parse(prompt.split('Current page (untrusted data): ')[1].split('\n')[0]);
        return JSON.stringify({ reviews: proposals.map(p => ({ id: p.id, supported: true, decisionSupported: true,
          choiceReviews: (p.decision?.choices || []).map(c => ({id:c.id,evidenceSupported:true,respectsRequest:true,consequenceClear:true,instructionMatchesLabel:true,reason:'Controlled fixture option.'})), choicesSufficient:true, relevance: p.decision?.relevance || 'now', attention: {mode: p.decision?.kind === 'choose' ? 'ask' : 'update', reason: 'Controlled task consequence.', blockingStep: p.decision?.kind === 'choose' ? 'Choose the room.' : ''}, reason: 'Controlled fixture evidence.' })),
          milestones:goals.map(g=>({goalId:g.id,status:'unknown',quote:''})),
          outcomes: pending.map(p => ({ id:p.id, status:current.includes(p.expected)?'satisfied':'unknown', quote:current.includes(p.expected)?p.expected:'' })),
          branch: { changed:false,quote:'',reason:'' } });
      }
      if (opts.tag === 'verify-action') return JSON.stringify({ requestCheck: {status:'consistent',quote:JSON.parse(prompt.split('Request: ')[1].split('\n')[0]),reason:'Controlled request check.'}, kind:'reversible',quote:'Adults',reason:'Change the selected guest count.',label:'',expected:'' });
      const two = prompt.includes('Guests selected: 2 adults');
      const decision = two
        ? {kind:'observe',relevance:'now',message:'Two adults are selected.',question:'',requestQuote:'',instruction:'',expected:'',choices:[]}
        : {kind:'choose',relevance:'now',message:'Rooms for two or three adults are available.',question:'How many adults are coming?',requestQuote:'',instruction:'',expected:'',choices:[
          {id:'two',label:'Room for 2 adults',action:'select',instruction:'Set Adults to 2.',expected:'Guests selected: 2 adults',quote:'Room for 2 adults',facts:[{name:'Adults',value:'2',quote:'Room for 2 adults'}]},
          {id:'three',label:'Room for 3 adults',action:'select',instruction:'Set Adults to 3.',expected:'Guests selected: 3 adults',quote:'Room for 3 adults',facts:[{name:'Adults',value:'3',quote:'Room for 3 adults'}]}]};
      return JSON.stringify({ alignedPhase: q.subtask, alignedNodes: [q.node],
        answers: qc.mode === 'review' ? [{ id: q.id, decision, answer: two ? 'Two adults selected.' : 'Only one adult selected.',
          quote: two ? 'Guests selected: 2 adults' : 'Guests selected: 1 adult', contradictsAsk: !two,
          options: two ? [] : ['Room for 2 adults', 'Room for 3 adults'] }] : [], noticed: [] });
    });
    BrowserAgent.setGeminiCaller(async () => {
      qc.turns++;
      if (qc.mode === 'skill') return JSON.stringify({ action: 'done', summary: 'Ready for review for two adults.' });
      if (qc.mode !== 'review') return JSON.stringify({ action: 'done', summary: 'The hotel is booked.' });
      if (qc.turns === 1) return JSON.stringify({ actions: [
        { action: 'type', text: 'OLD' }, { action: 'type', text: 'STALE' }] });
      if (qc.turns === 2) return JSON.stringify({ action: 'type', text: '2' });
      return JSON.stringify({ action: 'done', summary: 'Ready for review for two adults.' });
    });
  });
  const read = () => worker.evaluate(async () => chrome.storage.local.get(['aa.validation', 'bhAgent']));
  async function until(predicate, label) {
    const end = Date.now() + 45000;
    while (Date.now() < end) { const state = await read(); if (predicate(state)) return state;
      await new Promise(r => setTimeout(r, 50)); }
    fs.writeFileSync(path.join(out, 'failure-state.json'), JSON.stringify(await read(), null, 2));
    throw new Error(`Timed out: ${label}; see failure-state.json`);
  }
  const first = await send({ type: 'bhAgentStart', task: 'Prepare a hotel booking for review under $200', tabId, maxSteps: 8 });
  assert(first.started, JSON.stringify(first));
  console.log('started');
  const held = await until(s => s['aa.validation']?.gate?.allowed === false, 'hold');
  await until(s => s.bhAgent?.log?.some(e => e.action === 'blocked'), 'executor waiting at the hold');
  assert.equal(await page.$eval('#guests', el => el.value), '1');
  console.log('held before typing');
  await panel.setViewport({ width: 390, height: 844 });
  await panel.waitForSelector('.va-decision-answer input');
  await page.waitForSelector('.aw-decision-answer input');
  const waitingSnapshot=await worker.evaluate(id=>BrowserHarness.axSnapshot(id),tabId);
  assert(!waitingSnapshot.text.includes('How many adults are coming?'),'own announcement cannot become website evidence');
  for(let i=0;i<3;i++) {
    await page.evaluate(()=>{const n=document.createElement('div');n.id='audit-ignored-feedback';n.dataset.ai4a11yUi='';n.setAttribute('aria-hidden','true');n.textContent='Temporary extension feedback';document.body.append(n);});
    assert.equal((await worker.evaluate(id=>BrowserHarness.axSnapshot(id),tabId)).text,waitingSnapshot.text,
      'ignored UI must not add blank lines that invalidate a checked page');
    await page.evaluate(()=>document.getElementById('audit-ignored-feedback').remove());
    assert.equal((await worker.evaluate(id=>BrowserHarness.axSnapshot(id),tabId)).text,waitingSnapshot.text);
  }
  await page.evaluate(()=>{const p=document.createElement('p');p.textContent='Last availability check: 12:01';document.querySelector('main').append(p);});
  await worker.evaluate(id=>Validation.observe(id),tabId);
  assert.equal((await read())['aa.validation'].gate.allowed,false,'rereading an unanswered question must keep the agent paused');
  assert.equal(await page.$eval('#guests',el=>el.value),'1');
  for (const [surface, gateSelector, answerSelector, otherSelector] of [
    [panel, '.va-gate', '.va-decision-answer input', '.va-ask-page input'],
    [page, '.aw-gate', '.aw-decision-answer input', '.aw-tell-input'],
  ]) {
    await surface.bringToFront();
    if(surface===page)await surface.click('.aw-task-details > summary');
    else await surface.click('.va-ask-page > summary');
    assert.equal(await surface.$$eval(`${gateSelector} .primary, ${gateSelector} .aw-primary`, n => n.length), 0, 'choice order must not imply a recommendation');
    assert(await surface.$(`${gateSelector} [data-view="comparison"]`));
    assert.deepEqual(await surface.$$eval(`${gateSelector} .vd-option dd`, n => n.map(x=>x.textContent)),['2','3']);
    assert.deepEqual(await surface.$$eval(`${gateSelector} button`, nodes => nodes.map(n => n.textContent)),
      ['Room for 2 adults', 'Room for 3 adults', 'Stop here', 'Send']);
    const comparisonAX=await surface.createCDPSession();
    const comparisonTree=await comparisonAX.send('Accessibility.getFullAXTree');
    for(const adults of ['2','3']){
      const node=comparisonTree.nodes.find(n=>n.role?.value==='button'&&n.name?.value===`Room for ${adults} adults`);
      assert.match(node?.description?.value||'',new RegExp(`Adults\\s+${adults}`),'focused choices expose their own facts to assistive technology');
    }
    await comparisonAX.detach();
    await surface.type(answerSelector, 'Three adults please');
    await surface.type(otherSelector, 'Does it have a pool?');
    await surface.$eval(otherSelector, n => n.setSelectionRange(4, 7));
    await worker.evaluate(async () => {
      const state = (await chrome.storage.local.get('aa.validation'))['aa.validation'];
      await chrome.storage.local.set({ 'aa.validation': { ...state, spokenWords: (state.spokenWords || 0) + 1 } });
    });
    await surface.waitForFunction((selector) => document.activeElement === document.querySelector(selector)
      && document.querySelector(selector)?.selectionStart === 4, {}, otherSelector);
    assert.equal(await surface.$eval(answerSelector, n => n.value), 'Three adults please');
    assert.equal(await surface.$eval(otherSelector, n => n.value), 'Does it have a pool?');
    await surface.focus(`${gateSelector} button`); await surface.keyboard.press('ArrowDown');
    assert.equal(await surface.evaluate(() => document.activeElement.textContent), 'Room for 3 adults');
    console.log('decision interface checked:', gateSelector);
  }
  await panel.screenshot({ path: path.join(out, 'held-390.png'), fullPage: true });
  await page.click('.aw-task-details > summary');
  await page.screenshot({ path: path.join(out, 'held-overlay.png'), fullPage: true });
  await page.focus('#guests'); await page.$eval('#guests', n => n.select());
  await panel.bringToFront();
  console.log('selecting the decision option');
  await panel.click('.va-gate button');
  console.log('decision option clicked');
  const finished = await until(s => ['done', 'stopped', 'error'].includes(s.bhAgent?.status), 'finish');
  assert.equal(finished.bhAgent.status, 'done', JSON.stringify(finished.bhAgent));
  assert.equal(await page.$eval('#guests', el => el.value), '2');
  assert(finished['aa.validation'].completion.complete);
  const snap = await worker.evaluate(id => BrowserHarness.axSnapshot(id), tabId);
  assert.equal(snap.controls.find(c=>c.id==='guests')?.value,'2','the verifier can see the actual form value');
  assert.equal(snap.controls.find(c=>c.id==='breakfast')?.checked,true,'the verifier can see a checked checkbox');
  assert(!snap.text.includes('What you asked for') && !snap.text.includes('The run, in review'), snap.text);
  console.log('completed after correction');
  await panel.waitForSelector('.va-completion');
  await panel.focus('.va-plan > summary'); await panel.keyboard.press('Enter');
  assert(await panel.$eval('.va-plan', el => el.open));
  await panel.screenshot({ path: path.join(out, 'complete-390.png'), fullPage: true });
  await panel.setViewport({ width: 320, height: 800 });
  assert(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await panel.screenshot({ path: path.join(out, 'complete-320.png'), fullPage: true });
  await panel.evaluate(fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8') + '\n; true;');
  const accessibility = await panel.evaluate(async () => (await axe.run(document.querySelector('#va-panel'))).violations);
  fs.writeFileSync(path.join(out, 'accessibility.json'), JSON.stringify(accessibility, null, 2));

  await worker.evaluate(() => { qc.mode = 'booking'; });
  const second = await send({ type: 'bhAgentStart', task: 'Book this hotel', tabId, maxSteps: 3 });
  assert(second.started); assert.notEqual(second.taskId, first.taskId);
  const incomplete = await until(s => s.bhAgent?.taskId === second.taskId && s.bhAgent.status === 'stopped', 'unverified booking');
  assert.equal(incomplete['aa.validation'].completion?.complete, false,
    JSON.stringify({ agent: incomplete.bhAgent, model: incomplete['aa.validation'].modelState, observation: incomplete['aa.validation'].observation }));
  console.log('false completion stopped');
  await worker.evaluate(() => { qc.mode = 'failure'; });
  assert((await send({ type: 'bhAgentStart', task: 'A task with a failed provider', tabId })).error);
  const failed = await read(); assert.equal(failed['aa.validation'].modelState.status, 'failed');
  console.log('provider failure stopped');
  await panel.waitForSelector('.va-preparation');
  await panel.screenshot({ path: path.join(out, 'failed-320.png'), fullPage: true });
  await worker.evaluate(() => { qc.mode = 'slow'; });
  const pending = send({ type: 'bhAgentStart', task: 'Stop this preparation', tabId });
  await until(s => s['aa.validation']?.opts?.request === 'Stop this preparation', 'preparation');
  await send({ type: 'bhAgentStop' });
  assert.match((await pending).error, /stopped/);
  console.log('stop during preparation returned');
  await worker.evaluate(() => { qc.mode = 'booking'; qc.release?.(); });
  await new Promise(r => setTimeout(r, 100));
  assert.equal(await worker.evaluate(() => BrowserAgent.isRunning()), false);
  await send({ type: 'validationDone' });
  const checking = await send({ type: 'validationStart', contract: 'Check this hotel review for me', tabId });
  assert(checking.checkingOnly, JSON.stringify(checking));
  console.log('checking without an agent');
  assert.equal(await worker.evaluate(() => BrowserAgent.isRunning()), false);
  assert.equal((await read())['aa.validation'].modelState.status, 'ready');
  // Use the real panel control to replace the request, then inspect the model.
  await panel.bringToFront();
  await panel.waitForFunction(() => document.querySelector('.va-ask')?.textContent.includes('Check this hotel review for me'));
  panel.once('dialog', dialog => { console.log('edit dialog:', dialog.message()); return dialog.accept('Check this hotel review for three adults'); });
  await panel.click('.va-edit');
  const edited = await until(s => s['aa.validation']?.opts?.request === 'Check this hotel review for three adults'
    && s['aa.validation']?.modelState?.status === 'ready', 'edited request');
  assert.equal(edited['aa.validation'].taskId, checking.taskId);
  console.log('request edited in panel');
  assert.deepEqual(edited['aa.validation'].unspecified, []);
  assert.equal(await worker.evaluate(() => BrowserAgent.isRunning()), false);
  await worker.evaluate(() => { qc.mode = 'skill'; });
  const skill = await send({ type: 'runSkillActions', tabId, actions: [
    { prompt: 'Prepare this hotel page for review from a saved skill' },
    { prompt: 'Prepare this hotel page for another review from a saved skill' },
  ] });
  assert(skill.started);
  const skillFinished = await until(s => s.bhAgent?.task === 'Prepare this hotel page for another review from a saved skill'
    && s.bhAgent.status === 'done', 'saved skill actions');
  assert.equal(skillFinished.bhAgent.taskId, skillFinished['aa.validation'].taskId);
  assert.notEqual(skillFinished.bhAgent.taskId, checking.taskId);
  assert.equal(skillFinished['aa.validation'].modelState.status, 'ready');
  assert.equal(skillFinished['aa.validation'].completion.complete, true);
  const bypass = await worker.evaluate(async () => {
    try { await BrowserAgent.run('Unprepared direct run', { tabId: 1 }); return 'allowed'; }
    catch (error) { return error.message; }
  });
  assert.match(bypass, /Prepare this task/);
  console.log('saved skills prepared and direct bypass rejected');
  // Exact-target activation runs in the built harness. A changed price,
  // destination, retained node, file or masked field must invalidate review.
  await page.evaluate(() => {
    const fixture=document.createElement('section'); fixture.id='binding-fixture';
    fixture.innerHTML='<p id="binding-price">Total $20</p><form id="binding-form"><input id="binding-file" type="file"><input id="binding-secret" type="password" value="before"><button id="binding-send" formaction="/send-one">Send report</button></form>';
    document.body.append(fixture); window.bindingClicks=0;
    document.getElementById('binding-form').onsubmit=e=>{e.preventDefault();window.bindingClicks++};
  });
  // Use a selector to resolve the test target; no indexed registry substitution.
  const describe=()=>worker.evaluate(id=>BrowserHarness.describeActionTarget(id,{action:'click',selector:'#binding-send'}),tabId);
  const activate=async target=>worker.evaluate(async ({id,target})=>{
    try {await BrowserHarness.activateVerifiedTarget(id,{action:{action:'click'},target},()=>true);return true;}
    catch (e) {globalThis.qc.bindingError=e.message;return false;}
  },{id:tabId,target});
  const beforeAnnouncement=await describe();
  await page.evaluate(()=>{
    let region=document.getElementById('ai4a11y-announcer');
    if(!region){region=document.createElement('div');region.id='ai4a11y-announcer';document.body.append(region);}
    // Existing content scripts can leave an unmarked announcer in the page.
    region.removeAttribute('data-ai4a11y-ui');region.removeAttribute('data-bh-ignore');
    region.textContent='Waiting for approval';
  });
  assert.deepEqual(await describe(),beforeAnnouncement,'our announcement is not a change to the reviewed transaction');
  await page.$eval('#ai4a11y-announcer',n=>n.textContent='Approval accepted');
  assert.deepEqual(await describe(),beforeAnnouncement,'accepting approval must not invalidate that same approval');
  assert.equal(await worker.evaluate(id=>BrowserHarness.describeActionTarget(id,{action:'click',selector:'#ai4a11y-announcer'}),tabId),null);
  for (const mutate of [
    ()=>{document.getElementById('binding-price').textContent='Total $200'},
    ()=>{document.getElementById('binding-send').formAction='/send-two'},
    ()=>{const e=document.getElementById('binding-send');e.replaceWith(e.cloneNode(true))},
    ()=>{const d=new DataTransfer();d.items.add(new File(['content'],'report.txt',{lastModified:1}));document.getElementById('binding-file').files=d.files},
    ()=>{const d=new DataTransfer();d.items.add(new File(['content'],'report.txt',{lastModified:1}));document.getElementById('binding-file').files=d.files},
    ()=>{document.getElementById('binding-secret').value='after'},
    ()=>{const n=document.createElement('div');n.setAttribute('aria-live','polite');n.textContent='The site changed the transaction';document.getElementById('binding-fixture').append(n)},
  ]) {
    const before=await describe(); await page.evaluate(mutate);
    assert.equal(await activate(before),false,'changed action context cannot activate the approved control');
  }
  assert.equal(await page.evaluate(()=>window.bindingClicks),0);
  const unchanged=await describe();
  const rechecked=await describe();
  assert.deepEqual(rechecked,unchanged,'the descriptor must be stable without a page change');
  assert.equal(await activate(unchanged),true,await worker.evaluate(()=>qc.bindingError));
  assert.equal(await page.evaluate(()=>window.bindingClicks),1);
  assert(!(await describe()).pageState.includes('after'),'masked values never enter the action record');
  await page.$eval('#binding-fixture',el=>el.remove());
  console.log('exact target binding checked: prices, destinations, node replacement, files and passwords');
  const longChoiceState=structuredClone(held['aa.validation']);
  longChoiceState.request='Prepare a refundable hotel room under $700 total.';
  const question=longChoiceState.gate.leading;
  const finding=[...longChoiceState.findings].reverse().find(f=>f.widget===question);
  finding.runtime.decision.message='The total is $725 including the property fee. That is $25 over your budget.';
  finding.runtime.decision.question='What would you like to change?';
  finding.runtime.decision.choices=[
    'Raise the budget to $725 for these two full beds',
    'Look for another refundable room under $700',
    'Change the dates and keep the $700 budget',
    'Let me review the fees on the page',
  ].map((label,i)=>({id:'long-'+i,label,action:'search',instruction:label,expected:'Updated search',quote:'Fixture'}));
  longChoiceState.findings=[finding];longChoiceState.acknowledged=[];
  await worker.evaluate(s=>chrome.storage.local.set({'aa.validation':s}),longChoiceState);
  await panel.waitForFunction(()=>document.querySelector('.va-gate')?.textContent.includes('property fee'));
  await panel.setViewport({width:320,height:800});
  assert(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const layout=await panel.$$eval('.va-gate button',nodes=>nodes.map(n=>({text:n.textContent,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,client:n.clientWidth,scroll:n.scrollWidth})));
  assert(layout.every(b=>b.height>=44 && b.scroll<=b.client+1),JSON.stringify(layout));
  await panel.screenshot({path:path.join(out,'long-options-320.png'),fullPage:true});
  const heldAccessibility=await panel.evaluate(async()=>(await axe.run(document.querySelector('.va-gate'))).violations);
  assert.deepEqual(heldAccessibility.map(v=>v.id),[]);
  finding.runtime.decision={kind:'commit',relevance:'now',message:'Ready to book for $725.',question:'Book this room?',choices:[
    {id:'pay',action:'approve',label:'Book this room for $725',instruction:'Book this room.',expected:'Reservation confirmed.',quote:'Total $725. Free cancellation until October 10.'}]};
  await worker.evaluate(s=>chrome.storage.local.set({'aa.validation':s}),longChoiceState);
  for(const [surface,gate] of [[panel,'.va-gate'],[page,'.aw-gate']]){
    await surface.bringToFront();
    console.log('checking commitment evidence:',gate);
    await surface.waitForSelector(`${gate} .vd-source summary`);
    assert.equal(await surface.$eval(`${gate} .vd-source`,n=>n.open),true,'fallback evidence starts visible');
    const approvalAX=await surface.createCDPSession();
    const approvalTree=await approvalAX.send('Accessibility.getFullAXTree');
    const approvalNode=approvalTree.nodes.find(n=>n.role?.value==='button'&&n.name?.value==='Book this room for $725');
    assert.match(approvalNode?.description?.value||'',/Free cancellation until October 10/,'approval exposes its fallback evidence as an accessible description');
    await approvalAX.detach();
    for(const opened of [false,true]){
      const old=await surface.$(`${gate} .vd-source`);
      await surface.focus(`${gate} .vd-source summary`);await surface.keyboard.press('Enter');
      await surface.waitForFunction((selector,expected)=>document.querySelector(selector)?.open===expected,{},`${gate} .vd-source`,opened);
      await worker.evaluate(async()=>{const s=(await chrome.storage.local.get('aa.validation'))['aa.validation'];await chrome.storage.local.set({'aa.validation':{...s,spokenWords:(s.spokenWords||0)+1}});});
      await surface.waitForFunction(node=>!node.isConnected,{},old);
      assert(await surface.$eval(`${gate} .vd-source`,(node,expected)=>node.open===expected&&document.activeElement===node.querySelector('summary'),opened));
      await old.dispose();
    }
  }
  await panel.screenshot({path:path.join(out,'commitment-evidence-320.png'),fullPage:true});
  assert.deepEqual(errors, []);
  const report = { realExtension: true, realCDP: true, modelReplies: 'controlled',
    heldBeforeMutation: true, correctedValue: '2', staleBatchDiscarded: true,
    completionVerified: true, falseBookingStopped: true, newTaskId: true,
    providerFailureStopped: true, stopDuringPreparation: true,
    ownOverlayExcludedFromEvidence: true, announcementsDoNotInvalidateApproval:true,
    checkingWithoutAgent: true, editRequestViaPanel: true,
    savedSkillActionsPrepared: true, directRunBypassRejected: true,
    exactTargetBinding: true, changedAttachmentsAndMaskedValuesInvalidateApproval: true,
    keyboardDisclosure: true, decisionAccessibleDescriptions:true, noOverflowAt320: true, pageErrors: errors,
    actualDecisionOptions: true, optionSelectedThroughPanel: true,
    separateDraftsAndFocusPreserved: true, decisionArrowKeys: true, formValuesAndCheckedStates: true,
    longOptionsAt320:true, heldAccessibilityViolations:heldAccessibility,
    accessibilityViolations: accessibility.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })) };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  fs.writeFileSync(path.join(out,'page-errors.json'),JSON.stringify(errors,null,2));
  const target=browser.targets().find(t=>t.type()==='service_worker');
  const worker=await target?.worker();
  if(worker)fs.writeFileSync(path.join(out,'failure-state.json'),JSON.stringify(await worker.evaluate(async()=>({storage:await chrome.storage.local.get(['aa.validation','bhAgent']),qc:globalThis.qc})),null,2));
  for(const [i,p]of (await browser.pages()).entries()) {
    await p.screenshot({path:path.join(out,`failure-page-${i}.png`)}).catch(()=>{});
    fs.writeFileSync(path.join(out,`failure-page-${i}.txt`),await p.evaluate(()=>document.body?.innerText).catch(()=>''));
  }
  console.error(error); throw error;
}
finally { await browser.close(); server.close(); }
