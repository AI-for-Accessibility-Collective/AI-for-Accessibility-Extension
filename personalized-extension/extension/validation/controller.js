// Owns task preparation across the panel, verifier and browser agent.
import { plainError } from './plain-errors.js';
import { describePerson } from './quick-model.js';

export function createController(host = globalThis, { timeoutMs = 150000 } = {}) {
  let pending = null;
  let starting = false;
  let editing = false;
  let generation = 0;
  const V = () => host.Validation;
  const A = () => host.BrowserAgent;
  const storage = () => host.chrome.storage.local;
  // Heard only while a voice session is open; the panel and popup show the same.
  const speak = say => { if (say) host.chrome.runtime?.sendMessage?.({ type: 'validationSpeak',
    lines: [{ say, level: 'aside', live: 'polite' }] })?.catch?.(() => {}); };

  async function prepare(request, taskId, context = null) {
    if (pending) pending.aborted = true;
    const token = { aborted: false, generation };
    pending = token;
    const valid = () => !token.aborted && token.generation === generation && pending === token
      && V().isRunning() && V().taskId() === taskId;
    if (!context) host.ValidationTaskModel.unload();
    await V().setModelState({ status: 'preparing', taskId, startedAt: Date.now() });
    if (!valid()) return { ready: false, taskId, error: 'Task preparation was stopped.' };
    let timer, totalTimer, armStage;
    try {
      const deadline = new Promise((_, reject) => {
        token.cancel = () => reject(new Error('Task preparation was stopped.'));
        const expire = () => { token.aborted = true; reject(new Error('Task-model preparation timed out.')); };
        armStage = () => { clearTimeout(timer); timer = setTimeout(expire, timeoutMs); };
        armStage();
        totalTimer = setTimeout(expire, timeoutMs * 3);
      });
      const work = (async () => {
        const G = host.ValidationGenerate;
        if (!G?.hasCaller?.()) throw new Error('No task-model provider is configured.');
        // Written from the request itself, plus the page when the run has
        // moved somewhere the first model did not expect.
        let person = null;
        try { person = describePerson(await host.Librarian?.getAbilityModel?.()); } catch { /* no profile: the default reader */ }
        if (!valid()) throw new Error('Task preparation was stopped.');
        const model = await G.writeModel(request, { signal: token, person,
          page: context ? { url: context.url, evidence: context.evidence || null } : null });
        if (!valid()) throw new Error('Task preparation was superseded.');
        if (!model?.tree) throw new Error('No task model was produced.');
        armStage();
        let coded = await G.codeCandidate(model, undefined, { signal: token });
        if (!valid()) throw new Error('Task preparation was superseded.');
        coded = { ...coded, request, taskId };
        const loaded = host.ValidationTaskModel.load(coded, 'generated');
        if (!loaded?.questions) throw new Error('The task model contains no checks.');
        await host.ValidationTaskModel.save(coded);
        if (!valid()) throw new Error('Task preparation was superseded.');
        await V().setModelState({ status: 'ready', taskId, questions: loaded.questions });
        if (!valid()) throw new Error('Task preparation was superseded.');
        await V().planReview();
        return { ready: true, taskId };
      })();
      return await Promise.race([work, deadline]);
    } catch (error) {
      token.aborted = true;
      const detail = String(error.message || error);
      if (pending === token && token.generation === generation && V().isRunning() && V().taskId() === taskId) {
        host.ValidationTaskModel.unload();
        await V().setModelState({ status: 'failed', taskId, error: plainError(detail), detail });
      }
      return { ready: false, taskId, error: plainError(detail), detail };
    } finally { clearTimeout(timer); clearTimeout(totalTimer); if (pending === token) pending = null; }
  }

  return {
    prepare,
    async realign(context) {
      if (starting || editing || pending || !V().isRunning()) return { ready: false, busy: true };
      editing = true;
      const operation = generation, taskId = V().taskId();
      const wasPaused = A()?.isPaused?.() || false;
      try {
        A()?.pause?.({ reason: 'Updating the task checks for this page' });
        const result = await prepare(V().request(), taskId, context);
        if (operation !== generation || V().taskId() !== taskId) return { ready: false, stopped: true };
        if (result.ready && !wasPaused) A()?.resume?.({ rePerceive: true });
        return result;
      } finally { editing = false; }
    },
    cancel() {
      generation++;
      if (pending) {
        pending.aborted = true; pending.cancel?.();
        void V().setModelState({ status: 'failed', taskId: V().taskId(), error: 'Task preparation was stopped.' });
      }
      pending = null;
    },
    async start(msg) {
      if (starting || editing || A()?.isRunning?.()) return { error: 'An agent task is already running or being prepared.' };
      if (msg.previousTaskId && V().taskId() !== msg.previousTaskId) return { error: 'The task sequence was stopped or replaced.' };
      const startToken = {};
      starting = startToken;
      const operation = generation;
      const taskId = host.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      try {
        if (pending) pending.aborted = true;
        host.ValidationTaskModel.unload();
        const contract = msg.contract || host.ValidationAsk.contractFromAsk(msg.task);
        await V().start(contract, { taskId, request: msg.task, requireModel: true,
          routing: 'utility', runtimeVerification: true, style: msg.style, tabId: msg.tabId, checkOnly: msg.checkOnly === true });
        if (operation !== generation) { await V().stop(); return { error: 'Task preparation was stopped.' }; }
        // Shown in the popup's log while the checks are written, so pressing
        // Run is answered at once rather than by a silence of several seconds.
        await storage().set({ bhAgent: { task: msg.task, taskId, status: 'preparing', startedAt: Date.now(),
          log: [{ t: Date.now(), kind: 'info', text: 'Getting the checks ready. This usually takes about 15 seconds.' }] } });
        const ready = await prepare(msg.task, taskId);
        if (operation !== generation || !V().isRunning()) return { error: 'Task preparation was stopped.' };
        if (!ready.ready) {
          speak(ready.error === 'Stopped.' ? null : `I could not start the task. ${ready.error}`);
          await storage().set({ bhAgent: { task: msg.task, taskId, status: 'stopped',
            summary: ready.error, endedAt: Date.now(),
            log: [{ t: Date.now(), kind: 'error', text: ready.error }] } });
          return { error: ready.error };
        }
        if (msg.checkOnly) {
          if (msg.tabId != null) await V().observe(msg.tabId);
          return { started: true, taskId, checkingOnly: true };
        }
        // Running is deliberately detached: the message replies once ready,
        // while progress continues through storage.
        speak('The checks are ready. The agent is starting.');
        const rules = await V().rules?.() || [];
        if (operation !== generation || !V().isRunning()) return { error: 'Task preparation was stopped.' };
        const execution = A().run(msg.task, { taskId, tabId: msg.tabId, tabMode: msg.tabMode, maxSteps: msg.maxSteps,
          instructions: rules.filter(r => r.on !== false).map(r => r.text).filter(Boolean) })
          .catch(async error => {
            if (V().taskId() === taskId) await storage().set({ bhAgent: { task: msg.task,
              taskId, status: 'error', error: String(error.message || error), endedAt: Date.now() } });
            return { error: String(error.message || error) };
          });
        if (starting === startToken) starting = false;
        if (msg.awaitCompletion) {
          const result = await execution;
          const state = (await storage().get('bhAgent')).bhAgent;
          return { started: true, taskId, completed: operation === generation && V().taskId() === taskId
            && state?.taskId === taskId && state.status === 'done', result };
        }
        return { started: true, taskId };
      } finally { if (starting === startToken) starting = false; }
    },
    async edit(field, value, options = {}) {
      if (editing || starting) return { error: 'The task is already being updated.' };
      editing = true;
      const operation = generation;
      const wasPaused = A()?.isPaused?.() || false;
      try {
        A()?.pause?.({ reason: 'Updating your request' });
        const change = await V().editAsk(field, value, options);
        if (operation !== generation || !V().isRunning()) return { error: 'Task update was stopped.' };
        if (!change.changed) { if (!wasPaused) A()?.resume?.(); return change; }
        const ready = await prepare(change.request, V().taskId());
        if (operation !== generation || !V().isRunning()) return { error: 'Task update was stopped.' };
        if (!ready.ready) { A()?.stop?.(ready.error); return { ...change, error: ready.error }; }
        if (!wasPaused) A()?.resume?.({ rePerceive: true });
        return change;
      } catch (error) {
        A()?.stop?.('Could not update the task.');
        return { error: String(error.message || error) };
      } finally { editing = false; }
    },
  };
}
