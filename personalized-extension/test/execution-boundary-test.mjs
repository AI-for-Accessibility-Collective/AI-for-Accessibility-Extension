import assert from 'node:assert/strict';
const local = new Map(); const events = [];
globalThis.chrome = {
  storage: { local: {
    async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys])
      .filter(k => local.has(k)).map(k => [k, local.get(k)])); },
    async set(obj) { for (const [k, v] of Object.entries(obj)) local.set(k, v); },
    async remove(k) { local.delete(k); },
  } },
  tabs: { async get(id) { return { id, url: 'https://hotel.test/', title: 'Test hotel' }; } },
  runtime: { async sendMessage() {} },
};
let enumerations = 0;
globalThis.BrowserHarness = {
  async attach() {}, async detach() {}, async waitForLoad() { return true; },
  async enumerateInteractive() { enumerations++; return { items: [], structurals: [] }; },
  async captureScreenshot() { return { data: 'AAA', scale: 1, width: 10, height: 10 }; },
  async wait() {}, setAgentBusy() {}, healthSnapshot() { return {}; },
  async typeText(tab, text) { events.push('typed ' + text); },
};
const A = await import('../extension/browser-harness/src/agent/run.js');
const S = await import('../extension/browser-harness/src/agent/state.js');
const { _bhAgentExec } = await import('../extension/browser-harness/src/agent/exec.js');
const { _bhWithActionTimeout } = await import('../extension/browser-harness/src/agent/error.js');
let gateCalls = 0;
globalThis.Validation = {
  ensureRunning: async () => true, isRunning: () => true,
  async allow() {
    gateCalls++;
    if (gateCalls === 1) {
      local.set('aa.validation', { gate: { allowed: false } });
      setTimeout(() => {
        A.bhAgentInterject('Use NEW instead of OLD.');
        events.push('correction queued');
        local.set('aa.validation', { gate: { allowed: true } });
      }, 30);
      return { allowed: false, waitingOn: ['guests'] };
    }
    return { allowed: true };
  },
};
let turns = 0;
S.setGeminiCaller(async prompt => {
  turns++;
  if (turns === 1) return JSON.stringify({ actions: [
    { action: 'type', text: 'OLD' }, { action: 'type', text: 'STALE BATCH' }] });
  if (turns === 2) {
    assert(prompt.includes('Use NEW instead of OLD.'));
    events.push('model read correction');
    return JSON.stringify({ action: 'type', text: 'NEW' });
  }
  return JSON.stringify({ action: 'done', summary: 'finished' });
});
await A.bhAgentRun('fill the hotel guest choice', { tabId: 7, maxSteps: 5 });
assert.deepEqual(events, ['correction queued', 'model read correction', 'typed NEW']);
assert(enumerations >= 3, 'a held action and its batch are replaced after a fresh page read');

events.length = 0;
globalThis.Validation.allow = async () => { throw new Error('checker unavailable'); };
const failure = await _bhAgentExec(7, { action: 'type', text: 'UNSAFE' }, 'test');
assert.equal(failure.stopped, true); assert.deepEqual(events, []);

globalThis.Validation.allow = async () => ({ allowed: false, waitingOn: ['guests'] });
local.set('aa.validation', { gate: { allowed: false } });
let pending;
await assert.rejects(_bhWithActionTimeout('held action', 20, signal => {
  pending = _bhAgentExec(7, { action: 'type', text: 'LATE' }, 'test', { signal });
  return pending;
}), /timed out/);
local.set('aa.validation', { gate: { allowed: true } });
await pending;
assert.deepEqual(events, [], 'an aborted executor cannot wake up and act later');

// A correction received during the model call also invalidates its batch.
globalThis.Validation.allow = async () => ({ allowed: true });
turns = 0; events.length = 0;
S.setGeminiCaller(async () => {
  if (++turns === 1) { A.bhAgentInterject('Use the corrected guests.');
    return JSON.stringify({ action: 'type', text: 'OUTDATED MODEL RESPONSE' }); }
  return JSON.stringify({ action: 'done', summary: 'finished' });
});
await A.bhAgentRun('change guests', { tabId: 7, maxSteps: 3 });
assert.deepEqual(events, []);
// A model can put its answer in memory while omitting the actual response.
// Ask for a corrected action instead of ending with the generic "task complete".
turns = 0;
S.setGeminiCaller(async prompt => {
  if (++turns === 1) return JSON.stringify({action:'done',memory:'The answer is £23.88.'});
  assert(prompt.includes('done requires a nonempty summary'));
  assert(prompt.includes('The answer is £23.88.'));
  return JSON.stringify({action:'done',summary:'The price is £23.88.'});
});
await A.bhAgentRun('Read the price', {tabId:7,maxSteps:3});
assert.equal(local.get('bhAgent').summary,'The price is £23.88.');
const {_bhAgentParseAction}=await import('../extension/browser-harness/src/agent/action-extract.js');
assert.throws(()=>_bhAgentParseAction(JSON.stringify({actions:[{action:'done',summary:'  '}]})),/nonempty summary/);
// Text and links can be read through the executor without arbitrary script
// execution. Large pages remain readable in consecutive bounded pieces.
globalThis.BrowserHarness.axSnapshot=async()=>({url:'https://hotel.test/',text:'A'.repeat(6000)+'Final total $180',
  links:[{label:'Room details',href:'https://hotel.test/rooms'}]});
const firstRead=await _bhAgentExec(7,{action:'read'},'read the page');
assert.equal(firstRead.extracted.text.length,6000);assert.equal(firstRead.extracted.nextOffset,6000);
const rest=await _bhAgentExec(7,{action:'read',offset:firstRead.extracted.nextOffset},'read the rest');
assert.equal(rest.extracted.text,'Final total $180');assert.equal(rest.extracted.nextOffset,null);
const links=await _bhAgentExec(7,{action:'read',content:'links'},'read source URLs');
assert.match(links.extracted.text,/Room details\nhttps:\/\/hotel.test\/rooms/);
const {_bhAgentRenderHistory}=await import('../extension/browser-harness/src/agent/history.js');
assert(_bhAgentRenderHistory([{action:'read',extracted:firstRead.extracted}]).includes('"nextOffset":6000'),
  'the next prompt must contain the whole read and its continuation offset');
console.log('PASS corrections precede actions, held batches are discarded, checker failures stop, and aborted waits cannot act');
