// What went wrong, in words the person can act on.
//
// Errors reach the person from several layers: the Gemini API, fetch, the
// model's own output, and our checks on it. Their raw text ("Gemini API error
// 503: {...}", "Failed to fetch", "Unexpected token") says nothing to someone
// who asked for a hotel. Each is mapped to what happened and what to do next.
// The raw text is kept for the record, never shown in its place.

const RULES = [
  [/no gemini api key|no verification provider|no task-model provider|api key not/i,
    'Add your Gemini API key in the extension settings first. The checks use the same key as the agent.'],
  [/api[_ ]key[_ ]invalid|api key not valid|gemini api error (400|401|403)\b.*key|permission denied/i,
    'Google did not accept your Gemini API key. Check it in the extension settings.'],
  [/gemini api error 429|resource[_ ]exhausted|quota|rate limit/i,
    'Google’s AI service is busy, or today’s free allowance is used up. Wait a minute and try again.'],
  [/gemini api error (500|502|503|504)|unavailable|overloaded|internal error/i,
    'Google’s AI service is having trouble right now. Try again in a minute.'],
  [/failed to fetch|network ?error|fetch failed|err_internet/i,
    'I could not reach Google’s AI service. Check your internet connection and try again.'],
  [/timed? ?out|timeout|aborterror/i,
    'Getting the checks ready took too long. Try again. A shorter request can help.'],
  [/stopped|superseded/i, 'Stopped.'],
  [/already running|being prepared/i, 'The agent is already working on a task. Stop it first, or wait for it to finish.'],
];

/** A sentence the person can act on, for any error or error message. */
export function plainError(error) {
  const raw = String(error?.message ?? error ?? '');
  for (const [pattern, text] of RULES) if (pattern.test(raw)) return text;
  return 'I could not prepare checks for this request. Try again, or say it a different way.';
}
