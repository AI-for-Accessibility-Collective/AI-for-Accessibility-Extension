// Page alignment means a decision is active, not that it was completed.
export function createProgress(flat, previous = null) {
  return Object.fromEntries(flat.nodeIds.map(id => [String(id), {
    id: String(id), label: flat.labels[id], status: 'unchecked', evidence: null,
    ...(previous?.[id] || {}),
    ...(flat.applicability?.[id] ? { status: 'not-applicable',
      evidence: { quote: flat.applicability[id].quote, source: 'request' } } : {}),
  }]));
}

// The full tree remains in storage and the interface. Model prompts already
// contain every HTA question; repeating empty progress records adds no evidence.
export function progressContext(progress = {}) {
  return Object.fromEntries(Object.entries(progress || {}).flatMap(([id,node]) => {
    if (node.status === 'unchecked' && !node.evidence && !Object.keys(node.checks || {}).length) return [];
    const {id: _id, ...context} = node;
    return [[id,context]];
  }));
}

export function updateProgress(previous, flat, result, observation) {
  const next = createProgress(flat, previous);
  const active = new Set(result.alignedNodes || []);
  for (const node of Object.values(next)) {
    if (node.status === 'active' && !active.has(node.id)) node.status = 'unresolved';
    if (active.has(node.id) && !['completed', 'not-applicable'].includes(node.status)) node.status = 'active';
  }
  for (const state of result.nodeStates || []) {
    if (!next[state.nodeId] || !['completed', 'not-applicable'].includes(state.status)) continue;
    if (!state.quote || !result.pageText?.includes(state.quote)) continue;
    next[state.nodeId] = { ...next[state.nodeId], status: state.status,
      evidence: { quote: state.quote, ...observation } };
  }
  for (const answer of result.answers || []) {
    if (!next[answer.node] || !answer.verify?.startsWith('verified_')) continue;
    const node = next[answer.node];
    node.checks = { ...(node.checks || {}), [answer.id]: {
      question: answer.question, answer: answer.answer, quote: answer.quote,
      contradicts: answer.contradictsAsk === true, ...observation,
    } };
    if (answer.contradictsAsk) node.status = 'unresolved';
  }
  return next;
}
