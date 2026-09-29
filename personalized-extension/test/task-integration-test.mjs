import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createController } from '../extension/validation/controller.js';
import * as R from '../extension/validation/reasoner.js';
import * as G from '../extension/validation/generate.js';
import { decide } from '../extension/validation/policy.js';
// These preparation/entrypoint fixtures produce no page claims. The runtime
// still requires a separate, complete evidence review and action check.
const setCaller = call => R.setGeminiCaller((prompt, opts) => {
  if (opts.tag === 'review-evidence') return JSON.stringify({ reviews: [], outcomes: [], milestones:JSON.parse(prompt.split('Requested outcomes: ')[1].split('\n')[0]).map(g=>({goalId:g.id,status:'unknown',quote:''})), branch: { changed: false, quote: '', reason: '' } });
  if (opts.tag === 'verify-action') return JSON.stringify({ requestCheck: {status:'consistent',quote:JSON.parse(prompt.split('Request: ')[1].split('\n')[0]),reason:'Controlled request check.'}, kind: 'reversible', quote: 'The page is ready for review.', reason: 'Fixture text edit.', label: '', expected: '' });
  return call(prompt, opts);
});
const store = {};
const area = { async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, store[k]])); },
  async set(value) { Object.assign(store, structuredClone(value)); }, async remove(keys) { for (const k of [].concat(keys)) delete store[k]; } };
globalThis.chrome = { storage: { local: area, sync: area }, runtime: { async sendMessage() {} } };
let page = 'Review only. Total $20.';
let url = 'https://fixture.test/review';
globalThis.BrowserHarness = { async axSnapshot() { return { text: page, url }; } };
const { default: V } = await import('../extension/validation/session.js');
const A = await import('../extension/browser-harness/src/agent/run.js');
const S = await import('../extension/browser-harness/src/agent/state.js');
const { _bhAgentExec } = await import('../extension/browser-harness/src/agent/exec.js');
const bank = task => ({ task, tree: { id: '0', label: task, children: [
  { id: '1', label: 'Confirm result', questions: [{ question: 'Is the task complete?',
    moment: 'Completion', cluster: 'receipts', moneyMoving: false, speak: 'never' }] },
] } });
const runs = [];
globalThis.BrowserAgent = { isRunning: () => false, isPaused: () => false,
  pause() {}, resume() {}, stop() {}, interject: A.bhAgentInterject,
  async run(task, opts) { runs.push({ task, opts }); } };
const generator = { hasCaller: () => true,
  async codeCandidate(model) { return model; },
  async writeModel(task) { return bank(task); } };
globalThis.ValidationGenerate = generator;
globalThis.ValidationController = createController(globalThis, { timeoutMs: 600 });

// Exercise the actual background message branches, not a second handler.
const background = fs.readFileSync('extension/background.js', 'utf8');
function handler(type, next) {
  const a = background.indexOf(`  if (msg.type === '${type}') {`);
  const b = background.indexOf(next, a + 1);
  assert(a >= 0 && b > a);
  return new Function('msg', 'sender', 'sendResponse', background.slice(a, b));
}
// The route reads the checking setting; these runs have it switched on.
globalThis.verificationEnabled = async () => true;
const start = handler('bhAgentStart', '  // ---- validation layer');
const edit = handler('validationEdit', "  if (msg.type === 'validationPromote')");
const stop = handler('bhAgentStop', '  // Held, not ended.');
const send = (fn, msg) => new Promise(resolve => fn(msg, {}, resolve));
const first = await send(start, { type: 'bhAgentStart', task: 'Buy a book under $40', tabId: 1 });
const second = await send(start, { type: 'bhAgentStart', task: 'Book a hotel under $100', tabId: 1 });
assert(first.started && second.started);
assert.notEqual(first.taskId, second.taskId);
assert.equal(store['aa.validation.model'].request, 'Book a hotel under $100');
assert.equal(store['aa.validation'].taskId, runs[1].opts.taskId);
assert.equal(store['aa.validation'].opts.routing, 'utility');

const revision = S.getInstructionRevision();
const changed = await send(edit, { type: 'validationEdit', field: 'budget', value: '$20' });
assert(changed.changed);
assert(S.getInstructionRevision() > revision);
assert(store['aa.validation.model'].request.includes('budget = "$20"'));
assert.equal(store['aa.validation'].modelState.status, 'ready');
const stale = await _bhAgentExec(1, { action: 'type', text: '100' }, 'old budget', { revision });
assert(stale.replan, 'an action planned before the UI edit is discarded');

generator.writeModel = async () => null;
const failed = await send(start, { type: 'bhAgentStart', task: 'An unsupported task', tabId: 1 });
assert(failed.error); assert.equal(runs.length, 2);
assert.equal(store['aa.validation'].modelState.status, 'failed');
assert.equal((await V.beforeAction(1, 'type')).allowed, false);
let finishLate;
generator.writeModel = () => new Promise(resolve => { finishLate = resolve; });
const timedOut = await send(start, { type: 'bhAgentStart', task: 'A slow task', tabId: 1 });
assert.match(timedOut.error, /took too long/);
finishLate(bank('late task'));
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(store['aa.validation'].modelState.status, 'failed');
assert.equal(globalThis.ValidationTaskModel.loaded(), false);
assert.equal(runs.length, 2);

// A user's Stop wins over a pending provider response, including a late one.
let stoppedProvider;
const stopPending = send(start, { type: 'bhAgentStart', task: 'Stop while preparing', tabId: 1 });
while (!finishLate || store['aa.validation']?.opts?.request !== 'Stop while preparing') await new Promise(r => setTimeout(r, 0));
await new Promise(r => setTimeout(r, 0));
stoppedProvider = finishLate;
await send(stop, { type: 'bhAgentStop' });
assert.match((await stopPending).error, /stopped/);
stoppedProvider(bank('late stopped task'));
await new Promise(r => setTimeout(r, 0));
assert.equal(runs.length, 2);
assert.equal(store['aa.validation'].modelState.status, 'failed');
assert.equal(globalThis.ValidationTaskModel.loaded(), false);

generator.writeModel = async task => bank(task);
await send(start, { type: 'bhAgentStart', task: 'Book a hotel', tabId: 1 });
setCaller(async (_prompt, opts) => opts.tag === 'verify-completion'
  ? JSON.stringify({ checks: [{ id: 'task', status: 'incomplete', quote: '', reason: 'Only a review page.' }] })
  : JSON.stringify({ alignedPhase: 'Confirm result', alignedNodes: ['1'], answers: [], noticed: [] }));
assert.equal((await V.verifyCompletion(1, 'The hotel is booked.')).complete, false);
setCaller(async (_prompt, opts) => opts.tag === 'verify-completion'
  ? JSON.stringify({ checks: [{ id: 'task', status: 'complete', quote: 'Booking confirmed: ABC123', reason: 'Confirmed.' }] })
  : JSON.stringify({ alignedPhase: 'Confirm result', alignedNodes: ['1'], answers: [], noticed: [] }));
assert.equal((await V.verifyCompletion(1, 'The hotel is booked.')).complete, false, 'invented evidence cannot complete a task');
page = 'Booking confirmed: ABC123';
assert.equal((await V.verifyCompletion(1, 'The hotel is booked.')).complete, true);
assert.equal(store['aa.validation'].completion.checks[0].quote, page);

// Editing while the real action check is reading discards the old action.
let releaseRead;
setCaller(() => new Promise(resolve => { releaseRead = resolve; }));
page = 'A changed review page';
const checking = _bhAgentExec(1, { action: 'type', text: 'OLD' }, 'old task');
while (!releaseRead) await new Promise(r => setTimeout(r, 0));
await V.editAsk('budget', '$30');
releaseRead(JSON.stringify({ alignedPhase: 'Confirm result', alignedNodes: ['1'], answers: [], noticed: [] }));
assert.equal((await checking).replan, true);
assert.deepEqual(store['aa.validation'].evidencePages, []);

// Completed subgoals can cite different pages, but cannot swap their quotes.
await V.start('Book a flight and a hotel');
globalThis.ValidationTaskModel.load({ ...bank('Book a flight and a hotel'), selection: [
  { id: 'flights', goal: 'Book a flight' }, { id: 'hotel', goal: 'Book a hotel' },
] });
setCaller(async (_prompt, opts) => opts.tag === 'verify-completion'
  ? JSON.stringify({ checks: [
    { id: 'flights', status: 'complete', quote: 'Flight confirmed F123', sourceId: 'page:1:https://fixture.test/flight', reason: 'Flight receipt.' },
    { id: 'hotel', status: 'complete', quote: 'Hotel confirmed H123', sourceId: 'current', reason: 'Hotel receipt.' },
  ] }) : JSON.stringify({ alignedPhase: 'Confirm result', alignedNodes: ['1'], answers: [], noticed: [] }));
url = 'https://fixture.test/flight'; page = 'Flight confirmed F123'; await V.observe(1);
url = 'https://fixture.test/hotel'; page = 'Hotel confirmed H123';
const compound = await V.verifyCompletion(1, 'Both are booked.');
assert.equal(compound.complete, true);
assert.equal(compound.checks[0].url, 'https://fixture.test/flight');
await V.start('A different task');
assert.deepEqual(store['aa.validation'].evidencePages, [], 'a new task cannot inherit earlier receipts');

// Completing missing coding preserves every valid source value.
const uncoded = { task: 'Submit a form', tree: { id: '0', questions: [
  { question: 'Submit now?', moneyMoving: true, moment: 'Now', cluster: 'approve', costDims: { money: 3 }, evidence: ['source-video'] },
] } };
const coding = { id: '0#0', moneyMoving: false, moment: 'After', cluster: 'facts',
  costDims: { money: 0, privacy: 1, thirdParty: 1, safety: 1, reversibility: 1, recovery: 1 } };
const coded = await G.codeCandidate(uncoded, async () => JSON.stringify({ codings: [coding] }));
assert.equal(coded.tree.questions[0].moneyMoving, true);
assert.equal(coded.tree.questions[0].moment, 'Now');
assert.equal(coded.tree.questions[0].cluster, 'approve');
assert.equal(coded.tree.questions[0].costDims.money, 3);
assert.deepEqual(coded.tree.questions[0].evidence, ['source-video']);
assert.equal(uncoded.tree.questions[0].costDims.privacy, undefined);
await assert.rejects(G.codeCandidate(uncoded, async () => '{"codings":[]}'), /Incomplete HTA coding/);

const severe = { widget: 'Wrong guests', phase: 'Review', moment: 'Now', speak: 'never',
  contradicts: true, verified: 'verified_exact' };
assert.equal(decide(severe, { routing: 'utility' }).level, 'stop', 'authored silence cannot hide a conflict in production routing');
const ordinary = { widget: 'Room detail', phase: 'Review', moment: 'After', speak: 'always', verified: 'verified_exact' };
const sighted = decide(ordinary, { routing: 'utility' });
const blv = decide(ordinary, { routing: 'utility', model: { vision: { descriptions: true } } });
assert(sighted.eu && blv.eu);
assert.notEqual(sighted.eu.checkpoint, blv.eu.checkpoint, 'the user profile reaches the live surface score');

// Stop during an edit's storage read cannot recreate a cleared run.
await V.start('Prepare a hotel booking', { taskId: 'edit-race' });
const get = area.get;
let releaseEdit, interceptRead = true;
area.get = async keys => {
  if (interceptRead && keys === 'aa.validation') { interceptRead = false;
    await new Promise(resolve => { releaseEdit = resolve; }); }
  return get(keys);
};
const pendingEdit = V.editAsk('budget', '$50');
while (!releaseEdit) await new Promise(r => setTimeout(r, 0));
await V.stop(); releaseEdit(); await pendingEdit;
assert.equal(V.isRunning(), false);
assert.equal(V.taskId(), null);
area.get = get;

// Old findings cannot enter a new task while an adopted question is saved.
await V.start('Old hotel task', { taskId: 'old' });
globalThis.ValidationTaskModel.load(bank('Old hotel task'), 'generated');
page = 'Guests selected: 3 adults';
setCaller(async () => JSON.stringify({ alignedPhase: 'Confirm result', alignedNodes: ['1'],
  answers: [{ id: '1', answer: 'Three adults selected.', quote: page, contradictsAsk: true }],
  noticed: [{ what: 'How many guests?', whyItMatters: 'Match the request.', quote: page, contradictsAsk: true }] }));
const set = area.set;
let releaseAdoption, interceptWrite = true;
area.set = async values => {
  if (interceptWrite && values['aa.validation.model']) { interceptWrite = false;
    await new Promise(resolve => { releaseAdoption = resolve; }); }
  return set(values);
};
const oldRead = V.observe(1);
while (!releaseAdoption) await new Promise(r => setTimeout(r, 0));
await V.start('New library task', { taskId: 'new' });
globalThis.ValidationTaskModel.load(bank('New library task'), 'generated');
releaseAdoption(); await oldRead;
assert.equal(store['aa.validation'].taskId, 'new');
assert.deepEqual(store['aa.validation'].findings, []);
assert.equal(store['aa.validation'].gate.allowed, true);
area.set = set;
await V.stop();

// Writing the model and coding it each make progress. A slow first stage must
// not spend the time reserved for the second.
const savedGenerator={...generator};
const delay=()=>new Promise(resolve=>setTimeout(resolve,400));
generator.writeModel=async task=>{await delay();return bank(task)};
generator.codeCandidate=async model=>{await delay();return model};
const stagedController=createController(globalThis,{timeoutMs:700});
const staged=await stagedController.start({task:'Prepare a large task model',tabId:1});
assert.equal(staged.started,true,JSON.stringify(staged));
stagedController.cancel();await V.stop();Object.assign(generator,savedGenerator);

// Stop while the real model-writing call is failing must not start its retry.
const cancelController=createController(globalThis,{timeoutMs:1000});
let adaptationCalls=0,releaseAdaptation,adaptationStarted;
const adapting=new Promise(resolve=>adaptationStarted=resolve);
generator.writeModel=(request,options)=>G.writeModel(request,{...options,caller:async()=>{
  adaptationCalls++;adaptationStarted();await new Promise(resolve=>releaseAdaptation=resolve);
  throw Error('Gemini API error 503: unavailable');
}});
const cancelledPreparation=cancelController.start({task:'Prepare then stop',tabId:1});
await adapting;cancelController.cancel();releaseAdaptation();
assert.notEqual((await cancelledPreparation).started,true);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(adaptationCalls,1);
await V.stop();Object.assign(generator,savedGenerator);

// The shared provider must reject truncated answers and time out the body,
// not just the initial HTTP headers.
const providerStart = background.indexOf('async function callGemini(');
const providerEnd = background.indexOf('\n/**', providerStart);
const provider = fetcher => new Function('fetch', 'getApiUrl',
  background.slice(providerStart, providerEnd) + '\nreturn callGemini;')(fetcher, () => 'https://fixture.test/model');
await assert.rejects(provider(async () => ({ ok: true, async json() {
  return { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }] };
} }))('test', 'unused'), /cut short/);
const whole = await provider(async () => ({ ok: true, async json() {
  return { candidates: [{ content: { parts: [{ text: 'private reasoning', thought: true },
    { text: '{"ready":' }, { text: 'true}' }] } }] };
} }))('test', 'unused');
assert.equal(whole, '{"ready":true}');
await assert.rejects(provider(async (_url, { signal }) => ({ ok: true, json() {
  return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('body aborted')), { once: true }));
} }))('test', 'unused', { timeoutMs: 5 }), /body aborted/);
console.log('PASS actual start/edit routes, consecutive tasks, edits discard old actions, failures/timeouts hold, completion evidence, and utility/profile routing');
