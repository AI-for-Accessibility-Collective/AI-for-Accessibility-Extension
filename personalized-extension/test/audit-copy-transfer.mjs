// New copy contexts frozen before the first run. No browser or actor.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import * as R from '../extension/validation/reasoner.js';
import {decide} from '../extension/validation/policy.js';
import { auditDir } from './audit-dir.mjs';

if (!process.argv.includes('--live') || !process.env.GEMINI_API_KEY) throw Error('Requires --live and GEMINI_API_KEY');
const fixtures = [
  {id: 'map-delivery', request: 'Prepare an order for printed maps in Montréal. I need them by October 8. Ask me which delivery method to use before selecting it. Do not place the order.',
    question: 'Which delivery method should be selected?',
    page: 'Map printing checkout. Maps subtotal CAD 26.00 including tax. Delivery method: not selected. Courier: CAD 7.25 including tax, arrives October 7. Select courier. Shop pickup: free, ready October 5 at 12 Rue des Pins, Montréal. Select shop pickup. Continue to order review. Nothing has been ordered.'},
  {id: 'storage-billing', request: 'Compare these two 200 GB storage plans. Ask me which plan to prepare before selecting it. I have not chosen between monthly and annual billing. Do not subscribe or enter payment details.',
    question: 'Which storage plan and billing period should be selected?',
    page: 'Storage plans. No plan selected. Monthly plan: 200 GB, €6 for the first month, then €14 each month. Automatically renews monthly. Select monthly plan. Annual plan: 200 GB, €120 charged now for one year. Automatically renews each year at €120. Select annual plan. Selection only opens a review page; it does not start a subscription. Subscribe is on the next page.'},
];
const root = auditDir;
fs.mkdirSync(root, { recursive: true });
const background = fs.readFileSync('extension/background.js', 'utf8');
const model = background.match(/const GEMINI_MODEL = '([^']+)'/)[1];
const a = background.indexOf('async function callGemini('), b = background.indexOf('\n/**', a);
const provider = new Function('getApiUrl', background.slice(a, b) + ';return callGemini;')(
  (key, m) => `https://generativelanguage.googleapis.com/v1beta/models/${m || model}:generateContent?key=${key}`);
const report = {mode: 'copy-transfer', started: new Date().toISOString(), model, actingAgentTested: false,
  syntheticPages: true, fixtures, cases: [],
  sourceHash: createHash('sha256').update(fs.readFileSync('extension/validation/runtime.js')).digest('hex'),
  fixtureHash: createHash('sha256').update(JSON.stringify(fixtures)).digest('hex'),
  limitation: 'Two new authored pages with small task models. Not real websites, long tasks, or participant evaluation. A required choice is checked automatically; wording and facts require manual assessment.'};
const file = path.join(root, `copy-transfer-${Date.now()}.json`);
const save = () => fs.writeFileSync(file, JSON.stringify(report, null, 2));
save();
for (const fixture of fixtures) {
  const row = {...fixture, calls: []}; report.cases.push(row); save();
  R.setGeminiCaller(async (prompt, opts) => {
    const call = {tag: opts.tag, prompt, responseSchema: opts.responseSchema, at: Date.now()}; row.calls.push(call);
    try { call.reply = await provider(prompt, process.env.GEMINI_API_KEY, opts); return call.reply; }
    catch (e) { call.error = e.message; throw e; }
    finally { call.ms = Date.now() - call.at; save(); }
  });
  try {
    const flat = R.flattenModel({task: fixture.request, tree: {id: '0', label: 'Choose',
      questions: [{question: fixture.question, cluster: 'facts', moment: 'Now', speak: 'gate'}]}});
    row.result = await R.readPage(flat, fixture.page, {runtime: true, ask: fixture.request, routing: 'utility'});
    row.findings = R.toFindings(row.result, 'Choose').map(f => ({...f, level: decide(f, {routing: 'utility'}).level}));
    row.after = row.findings.filter(f => f.level === 'stop').map(f => f.runtime?.decision).filter(Boolean);
    row.structurePassed = row.result.ok && row.after.length === 1 && row.after[0].kind === 'choose'
      && row.after[0].choices.length === 2 && row.after[0].choices.every(c => c.action === 'select');
  } catch (e) { row.error = e.message; row.structurePassed = false; }
  save(); console.log(row.id, row.structurePassed ? 'STRUCTURE PASS' : 'FAIL', JSON.stringify(row.after));
}
report.finished = new Date().toISOString(); save(); console.log(file);
if (report.cases.some(c => !c.structurePassed)) process.exitCode = 1;
