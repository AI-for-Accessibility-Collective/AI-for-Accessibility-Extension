// Which model each verification call uses, and how hard it thinks.
//
// None of these calls set a thinking level, so every one ran at the model's
// default, which thinks at length. Replaying recorded calls from the September
// 20 runs, a page read spent a median 2,700 thinking tokens and took 14 s; at
// 'low' it took 4 s. Each setting below is the one that kept its decisions on
// the labelled cases, not simply the fastest.
//
// Each entry is { thinking, model }; '*' covers any call not listed. A call
// that names its own model or thinking level keeps it.
const PROFILES = {
  // On the 24 labelled cases in test/audit-live-attention.mjs, three runs each
  // (2026-09-28): default thinking passed 67 of 72 at a median 18 s a case,
  // 'low' passed 67 of 72 at 7-10 s, 'minimal' passed 46.
  'read-page': { thinking: 'low' },
  'review-evidence': { thinking: 'low' },
  // Writing the task model (quick-model.js). On the four gold task models,
  // gemini-3.8-flash at 'low' covered as much as the old staged generator
  // (26% against 25%, same judge) in 14 s instead of about a minute;
  // gemini-3.5-flash took 35 s for the same coverage.
  'quick-model': { thinking: 'low', model: 'gemini-3.8-flash' },
  // The action check keeps its default thinking: at 'low' it wrongly blocked 6
  // of 39 allowed actions in test/audit-live-actions.mjs. gemini-3.8-flash
  // passed all 39 at a median 2.7 s against 4.3 s, and this check sits on
  // every step's critical path, between the agent's plan and its action.
  'verify-action': { model: 'gemini-3.8-flash' },
};
let override = null;
/** Replace the profiles, or with merge: true, change only the ones given. */
export function setProfiles(profiles, { merge = false } = {}) {
  override = profiles && merge ? { ...PROFILES, ...profiles } : profiles;
}
export function profileFor(tag) {
  const all = override || PROFILES;
  return (Object.hasOwn(all, tag) ? all[tag] : all['*']) || {};
}
export function thinkingFor(tag) { return profileFor(tag).thinking ?? null; }

// Models this key turned out not to reach. Not every Gemini key can use every
// model, so a profile's model is a preference: once it answers "not found",
// calls fall back to the caller's default model for the rest of the session.
const unreachable = new Set();
const NOT_FOUND = /\b404\b|not[ _]found|is not supported|not available/i;

/** The call options a profile adds, never overriding what the caller set. */
export function withProfile(tag, options = {}) {
  const p = profileFor(tag);
  return { ...(p.model && !options.model && !unreachable.has(p.model) ? { model: p.model } : {}),
    ...(p.thinking && !options.thinking ? { thinking: p.thinking } : {}), ...options };
}

// Retry model reads only. Browser actions never pass through this helper.
export async function callWithRetry(call, prompt, options = {}, parse = value => value) {
  const timeoutMs = options.timeoutMs ?? 45000;
  const deadline = Date.now() + 75000;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (options.signal?.aborted) throw new Error('Task-model request was stopped.');
    const sent = withProfile(options.tag, options);
    try {
      const value = await call(prompt, { ...sent,
        timeoutMs: Math.max(1, Math.min(timeoutMs, deadline - Date.now())) });
      return parse(value);
    } catch (error) {
      const preferred = sent.model && sent.model !== options.model ? sent.model : null;
      if (preferred && NOT_FOUND.test(error?.message || '') && !options.signal?.aborted) {
        unreachable.add(preferred);
        if (!attempt) continue;
      }
      const transient = error instanceof SyntaxError || ['AbortError', 'TimeoutError'].includes(error?.name)
        || /(?:aborted|timed? out|timeout|fetch failed|network error|Gemini(?: API)? error:?\s*(?:429|500|502|503|504)\b)/i.test(error?.message || '');
      if (attempt || !transient || options.signal?.aborted || Date.now() >= deadline) throw error;
    }
  }
}
