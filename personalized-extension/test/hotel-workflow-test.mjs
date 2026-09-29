import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as R from '../extension/validation/reasoner.js';
const store = {}; const effects = []; const prompts = []; const messages = [];
globalThis.chrome = {
  storage: { local: { async get(k) { return { [k]: store[k] }; },
    async set(v) { Object.assign(store, v); }, async remove(k) { delete store[k]; } },
    sync: { async get() { return {}; }, async set() {} } },
  tabs: { async get(id) { return { id, url: 'https://hotel.test/checkout', title: 'Hotel checkout' }; } },
  runtime: { async sendMessage(m) { messages.push(m); } },
};
let guests = 1;
const text = () => `Guests selected: ${guests} adult${guests === 1 ? '' : 's'}. Breakfast included. Total $180.`;
globalThis.BrowserHarness = {
  async attach() {}, async detach() {}, async waitForLoad() { return true; },
  async enumerateInteractive() { return { items: [], structurals: [] }; },
  async captureScreenshot() { return { data: 'AAA', scale: 1, width: 10, height: 10 }; },
  async axSnapshot() { return { url: 'https://hotel.test/checkout', text: text() }; },
  async wait() {}, setAgentBusy() {}, healthSnapshot() { return {}; },
  async typeText(tabId, value) { effects.push(value); if (value === '2 adults') guests = 2; },
};
const { default: V } = await import('../extension/validation/session.js');
const A = await import('../extension/browser-harness/src/agent/run.js');
const S = await import('../extension/browser-harness/src/agent/state.js');
globalThis.BrowserAgent = { isRunning: S.isRunning, interject: A.bhAgentInterject,
  stop: A.bhAgentStop, pause: A.bhAgentPause, resume: A.bhAgentResume };
const bank = { task: 'book a hotel', selection: [{ id: 'hotel', version: 'fixture-v1' }], tree: {
  id: '0', label: 'Book a hotel', children: [
    { id: '1', label: 'Set guests', questions: [{ question: 'Is one adult selected?', speak: 'if-wrong' }] },
    { id: '2', label: 'Review room', questions: [{ question: 'Does this room meet the request?', speak: 'never' }] },
  ],
} };
// The request is for two adults with breakfast, so the model carries those
// checks, as the model writer produces them from the request.
const adapted = { model: { ...bank, request: 'Prepare a hotel booking for review for two adults with breakfast under $200',
  requirements: [{ quote: 'two adults', nodeIds: ['1'] }, { quote: 'breakfast', nodeIds: ['2'] }],
  tree: { ...bank.tree, children: [
    { id: '1', label: 'Set guests', questions: [{ question: 'Are two adults selected?', speak: 'if-wrong' }] },
    { id: '2', label: 'Review room', questions: [{ question: 'Does this room meet the request?', speak: 'never' },
      { question: 'Is breakfast included?', moment: 'Now', fromAsk: true }] },
  ] } } };
// This fixture requires a decision about guests, like an audited gate in the bank.
adapted.model.tree.children[0].questions[0].speak = 'gate';
adapted.model.taskId = 'hotel-replay';
globalThis.ValidationTaskModel.load(adapted.model, 'generated');
await V.start('Prepare a hotel booking for review for two adults with breakfast under $200',
  { taskId: 'hotel-replay', requireModel: true });
await V.setModelState({ taskId: 'hotel-replay', status: 'ready' });
let reasonerReads = 0;
R.setGeminiCaller(async (_prompt, opts) => {
  if (opts.tag === 'verify-completion') return JSON.stringify({ checks: [
    { id: 'task', status: 'complete', quote: 'Guests selected: 2 adults', reason: 'Fixture task stops at review.' },
    { id: 'requirement:0', status: 'complete', quote: 'Guests selected: 2 adults', reason: 'Two adults.' },
    { id: 'requirement:1', status: 'complete', quote: 'Breakfast included', reason: 'Included.' },
  ] });
  reasonerReads++;
  return JSON.stringify({ alignedPhase: 'Set guests', alignedNodes: ['1', '2'],
    answers: [{ id: '1', answer: guests === 1 ? 'Only one adult is selected.' : 'Two adults are selected.',
      quote: `Guests selected: ${guests} adult${guests === 1 ? '' : 's'}`, contradictsAsk: guests !== 2 }],
    noticed: [], nodeStates: guests === 2 ? [{ nodeId: '1', status: 'completed', quote: 'Guests selected: 2 adults' }] : [],
  });
});
let turns = 0;
S.setGeminiCaller(async prompt => {
  prompts.push(prompt); turns++;
  if (turns === 1) return JSON.stringify({ actions: [{ action: 'type', text: 'SUBMIT OLD GUESTS' },
    { action: 'type', text: 'STALE NEXT ACTION' }] });
  if (turns === 2) { assert(prompt.includes('Change to two adults'));
    return JSON.stringify({ action: 'type', text: '2 adults' }); }
  return JSON.stringify({ action: 'done', summary: 'Ready for review with two adults.' });
});
const run = A.bhAgentRun('Prepare a hotel booking for review for two adults', { taskId: 'hotel-replay', tabId: 7, maxSteps: 6 });
const deadline = Date.now() + 5000;
while (store['aa.validation']?.gate?.allowed !== false && Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 5));
}
assert.equal(store['aa.validation'].gate.allowed, false, 'HTA check holds the executor');
assert.deepEqual(effects, [], 'nothing changes while the guest decision waits');
assert.deepEqual(store['aa.validation'].activeNodes, ['1', '2']);
const held = store['aa.validation'].gate.waitingOn[0];
A.bhAgentInterject('Change to two adults before anything else.');
await V.answer(held, 'Change to two adults');
// The resolved question must not immediately reopen merely because its own
// corrective action has not run yet. Unchanged evidence stays acknowledged.
const result = await run;
assert.deepEqual(effects, ['2 adults']);
assert.equal(guests, 2); assert(reasonerReads >= 2);
assert.equal(store['aa.validation'].progress['1'].status, 'completed');
assert.equal(store['aa.validation'].taskModel.requirements.length, 2);
assert.equal(result.summary, 'Ready for review with two adults.');
const out = process.argv.indexOf('--out');
if (out >= 0) fs.writeFileSync(process.argv[out + 1], JSON.stringify(store['aa.validation'], null, 2));
await V.stop();
console.log('PASS hotel replay: request-written task model, two active nodes, held action, correction, changed-page check, completion evidence');
