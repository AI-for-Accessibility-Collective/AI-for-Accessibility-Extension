// With "Check the agent's work" off (the default), a task started from the
// popup's route runs the agent alone: no preparation, no checks, no hold.
// Real extension and CDP; only the model's replies are controlled.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import puppeteer from 'puppeteer';
import { auditDir } from './audit-dir.mjs';

const out = path.join(auditDir, 'checks-off');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Plain page</title><main><h1>Opening hours</h1><p>Open 9 to 5.</p><button>More</button></main></html>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ext = path.resolve('extension');
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 120000,
  userDataDir: fs.mkdtempSync(path.join(out, 'profile-')),
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-first-run', '--mute-audio'] });
try {
  const target = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().includes('background'), { timeout: 60000 });
  const worker = await target.worker();
  const id = new URL(target.url()).host;
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url === url).id, page.url());
  await worker.evaluate(() => {
    globalThis.offCalls = [];
    const refuse = tag => async (_p, opts) => { offCalls.push(opts?.tag || tag); throw new Error('checks must not run'); };
    ValidationReasoner.setGeminiCaller(refuse('reader'));
    ValidationGenerate.setCaller(refuse('writer'));
    BrowserAgent.setGeminiCaller(async () => { offCalls.push('actor');
      return JSON.stringify({ action: 'done', summary: 'The page says it is open 9 to 5.' }); });
  });
  assert.equal((await worker.evaluate(() => chrome.storage.sync.get('verificationLayer'))).verificationLayer, undefined, 'off unless turned on');
  const panel = await browser.newPage();
  await panel.goto(`chrome-extension://${id}/popup/popup.html`);
  const started = await panel.evaluate(tab => chrome.runtime.sendMessage({ type: 'bhAgentStart', task: 'Read the opening hours', tabId: tab }), tabId);
  assert.deepEqual(started, { started: true, checked: false });
  const end = Date.now() + 60000;
  let agent;
  while (Date.now() < end) {
    agent = (await worker.evaluate(() => chrome.storage.local.get('bhAgent'))).bhAgent;
    if (['done', 'stopped', 'error'].includes(agent?.status)) break;
    await new Promise(r => setTimeout(r, 250));
  }
  assert.equal(agent?.status, 'done', JSON.stringify(agent));
  const calls = await worker.evaluate(() => offCalls);
  assert(calls.every(c => c === 'actor'), `only the agent's own calls: ${calls}`);
  assert.equal(await worker.evaluate(() => Validation.isRunning()), false);
  console.log('PASS with checks off the agent runs alone and finishes');
} finally { await browser.close(); server.close(); }
