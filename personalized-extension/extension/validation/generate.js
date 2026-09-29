// The task model: what this task involves and what to check at each step.
//
// Written from the person's own request at the moment they ask, so the checks
// are always about the task they asked for (quick-model.js writes it in one
// call). codeCandidate() fills in any coding a model arrives without, because
// the gate relies on it: `moneyMoving` is what stops the agent before a step
// that is hard to undo.

import { callWithRetry } from './model-call.js';
import { quickModel } from './quick-model.js';

let caller = null;

/** The LLM. Same injection point as the reasoner, for the same reason. */
export function setCaller(fn) { caller = fn; }
export function hasCaller() { return typeof caller === 'function'; }

/** The task model for a request, in one call (quick-model.js). */
export function writeModel(request, opts = {}) {
  return quickModel(request, { caller: opts.caller ?? caller, signal: opts.signal, page: opts.page, person: opts.person });
}

const MOMENTS = new Set(['Now', 'After', 'Completion', 'On demand']);
const COST_DIMS = ['money', 'privacy', 'thirdParty', 'safety', 'reversibility', 'recovery'];
const CLUSTERS = ['facts','select','refine','approve','receipts','undo','watch','hand over','compare','photos'];
const validCost = v => Number.isInteger(v) && v >= 0 && v <= 3;
const validCoding = q => q && MOMENTS.has(q.moment) && CLUSTERS.includes(q.cluster)
  && typeof q.moneyMoving === 'boolean' && COST_DIMS.every(d => validCost(q.costDims?.[d]));
function fillCoding(q, c) {
  if (!CLUSTERS.includes(q.cluster)) q.cluster = c.cluster;
  if (!MOMENTS.has(q.moment)) q.moment = c.moment;
  if (typeof q.moneyMoving !== 'boolean') q.moneyMoving = c.moneyMoving;
  q.costDims = { ...(q.costDims || {}) };
  for (const d of COST_DIMS) if (!validCost(q.costDims[d])) q.costDims[d] = c.costDims[d];
}

function hasProtectedChecks(node) {
  return [...walk(node)].some(n => (n.questions || []).some(q =>
    q.moneyMoving !== false || q.cluster === 'approve' || String(q.speak || '').trim().toLowerCase() === 'gate'));
}

export async function codeCandidate(source, callFn = caller, opts = {}) {
  const model = structuredClone(source);
  const dims = COST_DIMS;
  const clusters = CLUSTERS;
  const schema = { type: 'object', properties: { codings: { type: 'array', items: {
    type: 'object', properties: { id: { type: 'string' }, cluster: { type: 'string', enum: clusters },
      moment: { type: 'string', enum: [...MOMENTS] }, moneyMoving: { type: 'boolean' },
      costDims: { type: 'object', properties: Object.fromEntries(dims.map(d => [d, { type: 'integer', minimum: 0, maximum: 3 }])), required: dims } },
    required: ['id', 'cluster', 'moment', 'moneyMoving', 'costDims'],
  } } }, required: ['codings'] };
  const questions = [...walk(model.tree)].flatMap(n => (n.questions || []).map((q, i) => ({ id: `${n.id}#${i}`, q })))
    .filter(({ q }) => q.speak !== 'DROP' && !validCoding(q));
  if (questions.length && !callFn) throw new Error('This task model needs coding before it can be used.');
  let next = 0;
  const chunks = [];
  for (let i = 0; i < questions.length; i += 24) chunks.push(questions.slice(i, i + 24));
  const worker = async () => {
    while (next < chunks.length) {
      if (opts.signal?.aborted) throw new Error('Task-model coding was stopped.');
      const chunk = chunks[next++];
      let remaining = chunk;
      for (let attempt = 0; attempt < 2 && remaining.length; attempt++) {
        if (opts.signal?.aborted) throw new Error('Task-model coding was stopped.');
        const responseSchema = structuredClone(schema);
        responseSchema.properties.codings.items.properties.id.enum = remaining.map(({ id }) => id);
        const raw = await callWithRetry(callFn, `Code these existing HTA questions without changing or dropping their text.
Task: ${JSON.stringify(model.task)}
Questions: ${JSON.stringify(remaining.map(({ id, q }) => ({ ...q, id })))}
Return JSON {"codings":[{"id":"exact id","cluster":"facts|select|refine|approve|receipts|undo|watch|hand over|compare|photos","moment":"Now|After|Completion|On demand","moneyMoving":true,"costDims":{"money":0,"privacy":0,"thirdParty":0,"safety":0,"reversibility":0,"recovery":0}}]}.
Include every id once. moneyMoving means the guarded step commits money, sends/submits something, deletes data, or otherwise becomes hard to undo. Cost dimensions are integers 0–3 for the cost of an undetected error. Do not infer that missing input coding means safe.`,
        { tag: 'code-hta', temperature: 0, mimeType: 'application/json', responseSchema, signal: opts.signal,
          maxOutputTokens: 16384, timeoutMs: 55000 });
        let parsed;
        try { parsed = parseJson(raw); } catch { parsed = null; }
        remaining = remaining.filter(({ id, q }) => {
          const rows = (Array.isArray(parsed?.codings) ? parsed.codings : []).filter(c => c.id === id);
          if (rows.length !== 1 || !validCoding(rows[0])) return true;
          fillCoding(q, rows[0]);
          return false;
        });
      }
      if (remaining.length) throw new Error(`Incomplete HTA coding: ${remaining.map(({ id }) => id).join(', ')}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, worker));
  if (opts.signal?.aborted) throw new Error('Task-model coding was stopped.');
  // A branch may have been excluded before its questions were fully coded.
  // Recheck after coding so no parent can conceal a newly identified commit.
  for (const node of walk(model.tree)) {
    if (node.applicability?.applicable === false && hasProtectedChecks(node)) {
      delete node.applicability;
      if (model.adaptation) model.adaptation.changes.push({ kind: 'branch-restored',
        nodeId: String(node.id), reason: 'Approval and irreversible-action checks remain active.' });
    }
  }
  model.runtimeCoding = { status: 'model-coded', questions: questions.length };
  return model;
}

export function* walk(node) {
  yield node;
  for (const c of node.children || []) yield* walk(c);
}

/**
 * The first complete JSON value in a reply, tolerating prose and fences.
 *
 * The rig's parser keeps the longest complete decode rather than the first,
 * because a truncated trailing object otherwise wins over a complete one.
 */
export function parseJson(text) {
  const s = String(text || '').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(s); } catch { /* tolerate surrounding prose below */ }
  let best = null;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] !== '{' && s[i] !== '[') continue;
    for (let j = s.length; j > i; j -= 1) {
      const c = s[j - 1];
      if (c !== '}' && c !== ']') continue;
      try {
        const v = JSON.parse(s.slice(i, j));
        if (best === null || j - i > best.len) best = { v, len: j - i };
        break;
      } catch { /* keep shrinking */ }
    }
  }
  if (!best) throw new Error('no JSON in reply');
  return best.v;
}
