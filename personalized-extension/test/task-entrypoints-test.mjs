import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createController } from '../extension/validation/controller.js';
import * as R from '../extension/validation/reasoner.js';

// These preparation/entrypoint fixtures produce no page claims. The runtime
// still requires a separate, complete evidence review and action check.
const setCaller = call => R.setGeminiCaller((prompt, opts) => {
  if (opts.tag === 'review-evidence') return JSON.stringify({ reviews: [], outcomes: [], milestones:JSON.parse(prompt.split('Requested outcomes: ')[1].split('\n')[0]).map(g=>({goalId:g.id,status:'unknown',quote:''})), branch: { changed: false, quote: '', reason: '' } });
  if (opts.tag === 'verify-action') return JSON.stringify({ requestCheck: {status:'consistent',quote:JSON.parse(prompt.split('Request: ')[1].split('\n')[0]),reason:'Controlled request check.'}, kind: 'reversible', quote: 'The page is ready for review.', reason: 'Fixture text edit.', label: '', expected: '' });
  return call(prompt, opts);
});
const store = {}, executions = [], effects = [];
const area = { async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, store[k]])); },
  async set(values) { Object.assign(store, structuredClone(values)); },
  async remove(keys) { for (const key of [].concat(keys)) delete store[key]; } };
globalThis.chrome = { storage: { local: area, sync: area }, runtime: { async sendMessage() {} },
  tabs: { async get(id) { return { id, url: 'https://fixture.test/page' }; }, async query() { return [{ id: 7 }]; } } };
globalThis.BrowserHarness = {
  async describeActionTarget() { return { tag: 'INPUT', label: 'Review', backendNodeId: 1 }; },
  async attach() {}, async detach() {}, async waitForLoad() { return true; },
  async enumerateInteractive() { return { items: [], structurals: [] }; },
  async captureScreenshot() { return { data: 'AAA', scale: 1, width: 10, height: 10 }; },
  async axSnapshot() { return { url: 'https://fixture.test/page', text: 'The page is ready for review.' }; },
  async wait() {}, setAgentBusy() {}, healthSnapshot() { return {}; },
  async typeText(tabId, value) {
    assert(V.isTaskReady(S.getTaskId()), 'every mutation must have its own prepared checks');
    effects.push({ tabId, value, taskId: S.getTaskId() });
    if (stopOnType) { stopOnType = false; globalThis.ValidationController.cancel(); A.bhAgentStop(); await V.stop(); }
  },
};
const { default: V } = await import('../extension/validation/session.js');
const A = await import('../extension/browser-harness/src/agent/run.js');
const S = await import('../extension/browser-harness/src/agent/state.js');
let stopOnType = false, failPreparation = false;
globalThis.BrowserAgent = { isRunning: S.isRunning, isPaused: A.bhAgentIsPaused,
  interject: A.bhAgentInterject, pause: A.bhAgentPause, resume: A.bhAgentResume, stop: A.bhAgentStop,
  run(task, opts) { executions.push({ task, ...opts }); return A.bhAgentRun(task, opts); } };
globalThis.ValidationGenerate = { hasCaller: () => true,
  async writeModel(task) {
    if (failPreparation) throw new Error('Fixture model provider failed');
    return { task, tree: { id: '0', label: task, children: [{ id: '1', label: 'Read page',
      questions: [{ question: 'Ready?', cluster: 'facts', moment: 'Completion', moneyMoving: false }] }] } };
  },
  async codeCandidate(model) { return model; },
};
globalThis.ValidationController = createController(globalThis);
setCaller(async (_prompt, { tag }) => tag === 'verify-completion'
  ? JSON.stringify({ checks: [{ id: 'task', status: 'complete', quote: 'The page is ready for review.', sourceId: 'current', reason: 'Fixture result.' }] })
  : JSON.stringify({ alignedPhase: 'Read page', alignedNodes: ['1'], answers: [], noticed: [] }));
S.setGeminiCaller(async () => S.getStep() === 1
  ? JSON.stringify({ action: 'type', text: 'review' })
  : JSON.stringify({ action: 'done', summary: 'Ready for review.' }));
const background = fs.readFileSync('extension/background.js', 'utf8');
function handler(type, end) {
  const start = background.indexOf(`  if (msg.type === '${type}') {`);
  return new Function('msg', 'sender', 'sendResponse', background.slice(start, background.indexOf(end, start + 1)));
}
const skill = handler('runSkillActions', "  if (msg.type === 'runProfileActions')");
const profile = handler('runProfileActions', '\n});');
const send = (fn, msg, sender = {}) => new Promise(resolve => fn(msg, sender, resolve));
const until = async predicate => {
  const deadline = Date.now() + 5000;
  while (!predicate()) { assert(Date.now() < deadline, 'route did not settle: '+JSON.stringify(store)); await new Promise(r => setTimeout(r, 2)); }
};

await assert.rejects(A.bhAgentRun('Unprepared direct task', { tabId: 7 }), /Prepare this task/);
assert.equal(S.isRunning(), false);
assert.deepEqual(effects, []);

await send(skill, { type: 'runSkillActions', tabId: 7, actions: [{ prompt: 'Review first page' }, { prompt: 'Review second page' }] });
await until(() => store.bhAgent?.task === 'Review second page' && store.bhAgent.status === 'done' && !S.isRunning());
assert.equal(executions.length, 2); assert.equal(effects.length, 2);
assert.notEqual(executions[0].taskId, executions[1].taskId);
assert(executions.every(e => e.taskId && e.tabId === 7));

await send(profile, { type: 'runProfileActions', actions: [{ prompt: 'Review profile page' }] }, { tab: { id: 19 } });
await until(() => store.bhAgent?.task === 'Review profile page' && store.bhAgent.status === 'done' && !S.isRunning());
assert.equal(effects.at(-1).tabId, 19);

failPreparation = true;
const beforeFailure = effects.length;
await send(skill, { type: 'runSkillActions', tabId: 7, actions: [{ prompt: 'Failed preparation' }, { prompt: 'Must not run after failure' }] });
await until(() => store.bhAgent?.task === 'Failed preparation' && store.bhAgent.status === 'stopped');
await new Promise(r => setTimeout(r, 5));
assert.equal(effects.length, beforeFailure);
assert(!executions.some(e => e.task === 'Must not run after failure'));
failPreparation = false;

stopOnType = true;
await send(profile, { type: 'runProfileActions', actions: [{ prompt: 'Stop first action' }, { prompt: 'Must not run after Stop' }] }, { tab: { id: 19 } });
await until(() => store.bhAgent?.task === 'Stop first action' && store.bhAgent.status === 'stopped' && !S.isRunning());
await new Promise(r => setTimeout(r, 5));
assert(!executions.some(e => e.task === 'Must not run after Stop'));
assert.equal(V.isRunning(), false);

// Test the exact continuation implementation with Stop during the tab read.
await globalThis.ValidationController.start({ task: 'Continue review', tabId: 7, awaitCompletion: true });
const steerStart = background.indexOf('async function steerAgent(');
const steer = new Function(background.slice(steerStart, background.indexOf('\nchrome.runtime.onMessage', steerStart)) + '\nreturn steerAgent;')();
const beforeContinue = executions.length;
let releaseTab;
const getTab = chrome.tabs.get;
chrome.tabs.get = () => new Promise(resolve => { releaseTab = resolve; });
const continuation = steer('Read it again');
await until(() => !!releaseTab);
globalThis.ValidationController.cancel(); A.bhAgentStop(); await V.stop();
releaseTab({ id: 7, url: 'https://fixture.test/page' });
assert.equal((await continuation).queued, 0);
assert.equal(executions.length, beforeContinue, 'a delayed continuation cannot restart after Stop');
chrome.tabs.get = getTab;

// Edits preserve taskId, so continuation text must be read after its awaits.
await globalThis.ValidationController.start({ task: 'Review for two adults', tabId: 7, awaitCompletion: true });
const originalRules = V.rules;
let releaseRules, firstRulesRead = true;
V.rules = async () => firstRulesRead
  ? (firstRulesRead = false, await new Promise(resolve => { releaseRules = resolve; })) : originalRules();
const editingContinuation = steer('Continue the review');
await until(() => !!releaseRules);
await globalThis.ValidationController.edit('request', 'Review for three adults');
releaseRules([]);
assert.equal((await editingContinuation).continued, true);
assert(executions.at(-1).task.startsWith('Review for three adults.'));
await until(() => !S.isRunning()); V.rules = originalRules;

// An edit during browser attachment must survive into the first agent turn.
let releaseAttach, firstPrompt = null;
const attach = BrowserHarness.attach;
BrowserHarness.attach = () => new Promise(resolve => { releaseAttach = resolve; });
S.setGeminiCaller(async prompt => {
  firstPrompt ||= prompt;
  return JSON.stringify({ action: 'done', summary: 'Ready for review.' });
});
await globalThis.ValidationController.start({ task: 'Review for four adults', tabId: 7 });
await until(() => !!releaseAttach);
await globalThis.ValidationController.edit('request', 'Review for five adults');
releaseAttach(); await until(() => !S.isRunning());
assert(firstPrompt.includes('Review for five adults'), 'startup must not erase a new correction');
BrowserHarness.attach = attach;
await V.stop();

// A bound executor cannot silently become the standalone harness mid-run.
S.setStop(false); S.setTaskId('missing-task');
const { _bhAgentExec } = await import('../extension/browser-harness/src/agent/exec.js');
const beforeMissing = effects.length;
assert.equal((await _bhAgentExec(7, { action: 'type', text: 'unchecked' }, 'test')).stopped, true);
assert.equal(effects.length, beforeMissing); S.resetRunState();
console.log('PASS skill/profile preparation, task bindings, sequence cancellation, direct-run rejection, continuation Stop and edits during startup');
