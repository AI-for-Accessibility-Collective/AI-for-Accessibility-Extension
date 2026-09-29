// How hard the model thinks before answering, per verification call.
//
// None of these calls set it, so every one ran at the model's default, which
// thinks at length. Replaying recorded calls from the September 20 runs, a page
// read spent a median 2,700 thinking tokens and took 14 s; at 'low' it took 4 s.
// The level for each call is the one that kept its decisions on the labelled
// cases (test/audit-live-attention.mjs), not the fastest one.
// Each entry is { thinking, model }; '*' covers any call not listed. A call
// that names its own model or thinking level keeps it.
//
// Measured on the 24 labelled cases in test/audit-live-attention.mjs, three
// runs each (2026-09-28): default thinking passed 67 of 72 at a median 18 s a
// case, 'low' passed 67 of 72 at 7-10 s, 'minimal' passed 46. The action check
// is different: at 'low' it wrongly blocked 6 of 39 allowed actions in
// test/audit-live-actions.mjs, so it keeps the default.
const PROFILES = {
  'read-page': { thinking: 'low' },
  'review-evidence': { thinking: 'low' },
  // Writing the task model (quick-model.js). On the four gold task models,
  // gemini-3.8-flash at 'low' covered as much as the old staged generator
  // (26% against 25%, same judge) in 14 s instead of about a minute;
  // gemini-3.5-flash took 35 s for the same coverage.
  'quick-model': { thinking: 'low', model: 'gemini-3.8-flash' },
};
let override = null;
export function setProfiles(profiles) { override = profiles; }
export function profileFor(tag) {
  const all = override || PROFILES;
  return (Object.hasOwn(all, tag) ? all[tag] : all['*']) || {};
}
export function thinkingFor(tag) { return profileFor(tag).thinking ?? null; }
/** The call options a profile adds, never overriding what the caller set. */
export function withProfile(tag, options = {}) {
  const p = profileFor(tag);
  return { ...(p.model && !options.model ? { model: p.model } : {}),
    ...(p.thinking && !options.thinking ? { thinking: p.thinking } : {}), ...options };
}

// Retry model reads only. Browser actions never pass through this helper.
export async function callWithRetry(call, prompt, options = {}, parse = value => value) {
  const timeoutMs = options.timeoutMs ?? 45000;
  const deadline = Date.now() + 75000;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (options.signal?.aborted) throw new Error('Task-model request was stopped.');
    try {
      const value = await call(prompt, { ...withProfile(options.tag, options),
        timeoutMs: Math.max(1, Math.min(timeoutMs, deadline - Date.now())) });
      return parse(value);
    } catch (error) {
      const transient = error instanceof SyntaxError || ['AbortError', 'TimeoutError'].includes(error?.name)
        || /(?:aborted|timed? out|timeout|fetch failed|network error|Gemini(?: API)? error:?\s*(?:429|500|502|503|504)\b)/i.test(error?.message || '');
      if (attempt || !transient || options.signal?.aborted || Date.now() >= deadline) throw error;
    }
  }
}
