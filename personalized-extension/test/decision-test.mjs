import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { decisionContext, decisionPayload, decisionMessage, createDecisionResponder } from '@ai4a11y/tools/utils/verification-decisions.js';
import { bhRenderAx } from '../extension/browser-harness/src/harness/ax-render.js';

const ax = (value, checked) => [{ nodeId: '0', role: { value: 'RootWebArea' }, childIds: ['1','2'] },
  { nodeId: '1', parentId: '0', role: { value: 'spinbutton' }, name: { value: 'Adults' }, value: { value },
    properties: [{ name: 'valuemin', value: { value: 0 } }] },
  { nodeId: '2', parentId: '0', role: { value: 'checkbox' }, name: { value: 'Breakfast' },
    properties: [{ name: 'checked', value: { value: checked } }] }];
assert.notEqual(bhRenderAx(ax(2, true)), bhRenderAx(ax(3, false)));
assert.match(bhRenderAx(ax(0, false)), /value=0/);
assert.match(bhRenderAx(ax(0, false)), /checked=false/);
assert.match(bhRenderAx(ax(2, 'mixed')), /checked="mixed"/);
assert.match(bhRenderAx([{ nodeId: '0', role: { value: 'textbox' }, name: { value: 'a\n"b' } }]), /"a\\n\\"b"/);

const dom = new JSDOM('<!doctype html><body><div id="panel"></div></body>', { url: 'https://fixture.test' });
for (const key of ['window','document','HTMLElement','Node','MouseEvent','Event','KeyboardEvent','getComputedStyle']) globalThis[key] = dom.window[key];
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
const base = () => ({ taskId: 'task-1', contract: { item: 'room' }, phase: 'Select', acknowledged: [], steps: [], said: [],
  findings: [{ widget: 'Which room?', phase: 'Select', say: 'Two rooms are available.', from: 'King $200. Twin $230.',
    options: ['King $200','Twin $230'], node: '1', control: { action: 'select-options', label: 'Read me the options' }, level: 'stop' }],
  gate: { allowed: false, waitingOn: ['Which room?'], leading: 'Which room?', say: 'Which room?' } });
let state = base(); const effects = [], listeners = [];
const duplicateQuestionState = structuredClone(state);
duplicateQuestionState.findings[0].runtime = { decision: {
  kind: 'choose', message: 'Two rooms are available. Which room?', question: 'Which room?', choices: [],
} };
assert.equal(decisionMessage(duplicateQuestionState), 'Two rooms are available. Which room?',
  'an exact question duplicated in the message is spoken once');
duplicateQuestionState.findings[0].runtime.decision.question = 'Which room would you like?';
assert.equal(decisionMessage(duplicateQuestionState), 'Two rooms are available. Which room? Which room would you like?',
  'different wording is preserved for the reviewer to reject or refine');
globalThis.chrome = { storage: { local: { async get() { return { 'aa.validation': state }; } },
  onChanged: { addListener(fn) { listeners.push(fn); } } } };
const { mountValidationPanel } = await import('../extension/validation/panel.js');
const { AgentWatch } = await import('@ai4a11y/tools/adapters/agent-watch.js');
const clicks = [];
mountValidationPanel(document.getElementById('panel'), { onControl: (c) => clicks.push(c) });
AgentWatch.onAnswer = (_widget, _response, payload) => clicks.push(payload);
AgentWatch.enable({ state });
await new Promise(resolve => setTimeout(resolve, 30));
for (const gate of [document.querySelector('.va-gate'), document.querySelector('.aw-gate')]) {
  assert(gate, 'both decision interfaces are visible');
  const buttons = [...gate.querySelectorAll('button')];
  assert.deepEqual(buttons.map(b => b.textContent), ['King $200','Twin $230','Stop here','Send']);
  buttons[1].click();
  assert.equal(clicks.at(-1).kind, 'option'); assert.equal(clicks.at(-1).response, 'Twin $230');
  assert.equal(clicks.at(-1).decisionKey, decisionContext(state).decisionKey);
  buttons[0].focus(); buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(document.activeElement, buttons[1]);
  gate.querySelector('input').value = 'Find a room under $180';
  gate.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(clicks.at(-1).kind, 'custom'); assert.equal(clicks.at(-1).widget, 'Which room?');
}

// Storage and agent log updates must preserve separate drafts and focus.
const repaint = () => { state = { ...state, spokenWords: (state.spokenWords || 0) + 1 };
  for (const fn of listeners) fn({ 'aa.validation': { newValue: state } }, 'local');
  AgentWatch.update(state); };
for (const [answerSelector, otherSelector] of [
  ['.va-decision-answer input', '.va-ask-page input'],
  ['.aw-decision-answer input', '.aw-tell-input'],
]) {
  let answer = document.querySelector(answerSelector), other = document.querySelector(otherSelector);
  answer.value = 'Three adults please'; other.value = 'Does it have a pool?';
  other.focus(); other.setSelectionRange(4, 7); repaint();
  answer = document.querySelector(answerSelector); other = document.querySelector(otherSelector);
  assert.equal(answer.value, 'Three adults please'); assert.equal(other.value, 'Does it have a pool?');
  assert.equal(document.activeElement, other); assert.equal(other.selectionStart, 4);
  answer.focus(); answer.setSelectionRange(2, 5); repaint();
  answer = document.querySelector(answerSelector);
  assert.equal(document.activeElement, answer); assert.equal(answer.value, 'Three adults please');
  assert.equal(answer.selectionEnd, 5);
}
state = structuredClone(state); state.findings[0].options = ['Twin $250']; repaint();
for (const selector of ['.va-decision-answer input', '.aw-decision-answer input']) {
  assert.equal(document.querySelector(selector).value, '', 'a changed decision does not inherit an old answer');
}
state = base();

const handlers = {
  getState: async () => state,
  stop: async () => { effects.push('stop'); state.gate.allowed = true; },
  handOver: async o => { assert.equal(o.tabId, 42); effects.push('handOver'); },
  watch: async o => { assert.equal(o.tabId, 42); effects.push('watch'); return { watching: true }; },
  refine: async () => (effects.push('refine'), 2),
  instructionFor: async c => c.option ? `Choose ${c.option}` : 'Read options',
  steer: async text => effects.push(text),
  answer: async () => { effects.push('answer'); state.gate.allowed = true; return { resolved: true }; },
};
const respond = createDecisionResponder(handlers);
assert.equal((await respond(decisionPayload(state, { kind: 'option', response: 'Twin $230' }))).resolved, true);
assert.deepEqual(effects, ['Choose Twin $230','answer']);
assert.equal((await respond(clicks[0])).stale, true, 'duplicate answers cannot steer');

state = base(); effects.length = 0;
const stale = decisionPayload(state, { kind: 'option', response: 'Twin $230' });
state.findings[0].options = ['Twin $250'];
assert.equal((await respond(stale)).stale, true); assert.deepEqual(effects, []);
state = base(); const oldTask = decisionPayload(state, { kind: 'custom', response: 'Changed' }); state.taskId = 'task-2';
assert.equal((await respond(oldTask)).stale, true);
state = base();
assert.equal((await respond(decisionPayload(state, { kind: 'custom', response: 'Find a room under $180' }))).resolved, true);
assert.match(effects[0], /Find a room under \$180/); assert.equal(effects.at(-1), 'answer');

for (const [action, expected] of [['hand-over','handOver'],['watch-value','watch'],['refine-narrow','refine']]) {
  state = base(); effects.length = 0; state.findings[0].options = null;
  state.observation = { tabId: 42 };
  state.findings[0].control = { action, label: 'Do this' };
  await respond(decisionPayload(state, { kind: 'control', response: 'Do this' }));
  assert.deepEqual(effects, [expected, 'answer']);
}

// Two simultaneous presses cannot queue two continuations.
state = base(); effects.length = 0;
let releaseInstruction;
const pendingResponder = createDecisionResponder({ ...handlers,
  instructionFor: () => new Promise(resolve => { releaseInstruction = resolve; }) });
const payload = decisionPayload(state, { kind: 'option', response: 'Twin $230' });
const firstPress = pendingResponder(payload);
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal((await pendingResponder(payload)).pending, true);
// Stop wins even when an earlier choice is still preparing its instruction.
await pendingResponder(decisionPayload(state, { kind: 'stop', response: 'stop' }));
releaseInstruction('Choose Twin $230');
assert.equal((await firstPress).stale, true); assert.deepEqual(effects, ['stop']);

// Exercise the exact background route, including cancellation of the controller.
const background = fs.readFileSync('extension/background.js','utf8');
const steerStart = background.indexOf('async function steerAgent(');
const steerEnd = background.indexOf('\nchrome.runtime.onMessage', steerStart);
const productionSteer = new Function(`${background.slice(steerStart, steerEnd)}; return steerAgent;`)();
state = base(); effects.length = 0;
let runningTask = state.taskId, releaseHydration;
globalThis.BrowserAgent = { isRunning: () => false, run: async (...args) => effects.push(args),
  interject: text => effects.push(text) };
globalThis.Validation = { taskId: () => runningTask,
  ensureRunning: () => new Promise(resolve => { releaseHydration = resolve; }), isTaskReady: () => true,
  rules: async () => [], request: () => 'new task' };
const raceResponder = createDecisionResponder({ ...handlers, steer: productionSteer });
const stalePress = raceResponder(decisionPayload(state, { kind: 'option', response: 'Twin $230' }));
await new Promise(resolve => setTimeout(resolve, 0));
runningTask = 'task-2'; state = { ...base(), taskId: runningTask };
releaseHydration(true);
assert.equal((await stalePress).stale, true);
assert.deepEqual(effects, [], 'an old answer must never reach the replacement task');
const start = background.indexOf("  if (msg.type === 'validationAnswer') {");
const end = background.indexOf("  if (msg.type === 'validationStop') {", start);
let stopped = 0, cancelled = 0, ended = 0;
globalThis.Validation = { createDecisionResponder, stop: async () => ended++ };
globalThis.BrowserAgent = { stop: () => stopped++ };
globalThis.ValidationController = { cancel: () => cancelled++ };
const route = new Function('steerAgent','runRefineProbe', `let validationDecisionResponder; return function(msg,sender,sendResponse) {${background.slice(start,end)}}`)(
  () => { throw Error('Stop must never steer'); }, () => { throw Error('Stop must never refine'); });
state = base();
const stoppedReply = await new Promise(resolve => route({ type: 'validationAnswer', ...decisionPayload(state, { kind: 'stop', response: 'stop' }) }, {}, resolve));
assert.equal(stoppedReply.stopped, true); assert.equal(stopped, 1); assert.equal(cancelled, 1); assert.equal(ended, 1);
state=base();state.findings[0].say='Which time?';
state.findings[0].runtime={decision:{kind:'choose',message:'',question:'Which time?',choices:['14:30','15:30'].map(time=>({
  id:time,label:time,action:'select',instruction:'Select '+time,expected:time+' selected',facts:[{name:'Time',value:time,quote:time}]}))}};
repaint();
for(const gate of [document.querySelector('.va-gate'),document.querySelector('.aw-gate')]){
  assert.equal(gate.querySelector('[data-view]').dataset.view,'choice');
  assert.equal(gate.querySelectorAll('.vd-option').length,0,'a time already in the button does not need a duplicate comparison card');
  const button=[...gate.querySelectorAll('button')].find(b=>b.textContent==='15:30');button.click();
  assert.equal(clicks.at(-1).choiceId,'15:30');
}
state=base();state.findings[0].runtime={decision:{kind:'commit',message:'Share with the selected recipients.',question:'',choices:[{
  id:'approve',label:'Share with Alex and Blair',action:'approve',instruction:'Share with both.',expected:'Shared.',quote:'Recipients: Alex and Blair.',facts:[]}]}};
repaint();
for(const selector of ['.va-gate','.aw-gate'])assert.equal(document.querySelector(selector+' details[data-decision-disclosure]').open,true,
  'fallback evidence is visible on first render in both interfaces');
for(const opened of [false,true]){
  for(const selector of ['.va-gate','.aw-gate'])document.querySelector(selector+' details[data-decision-disclosure]').open=opened;
  repaint();
  for(const selector of ['.va-gate','.aw-gate'])assert.equal(document.querySelector(selector+' details[data-decision-disclosure]').open,opened,
    'refresh preserves both opening and closing the evidence');
}
state.findings[0].runtime.decision.choices[0].facts=[{name:'Recipient',value:'Alex',quote:'Alex'}, {name:'Recipient',value:'Blair',quote:'Blair'}];
repaint();
for(const selector of ['.va-gate','.aw-gate'])assert.deepEqual([...document.querySelectorAll(selector+' .vd-option dd')].map(n=>n.textContent),['Alex','Blair']);
state.findings[0].runtime.decision.choices[0].id='new-approval';repaint();
const focusedEvidence=document.querySelector('.va-gate .vd-source summary');focusedEvidence.focus();
await new Promise(resolve=>setTimeout(resolve,30));
assert.equal(document.activeElement,focusedEvidence,'deferred new-question focus must not override the user moving to evidence');
AgentWatch.disable();
console.log('PASS form values, control states, both decision surfaces, keyboard, options, custom answers, stale/duplicate rejection and enforced Stop');
