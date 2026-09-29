// The validation panel.
//
// Renders the run's findings for someone who can see the page. Two rules shape
// everything here:
//
//   Quiet by default. This persona has not lost perception — they can look at
//   the page. A finding is a mark beside the thing it concerns, not an
//   announcement, because interrupting someone who could simply look is pure
//   cost. The only loud element is the gate, and it is loud because the agent
//   is genuinely held.
//
//   Controls, not descriptions. What delegation took from this person is the
//   doing: re-sort, open a different one, change the size, remove the extras.
//   Telling them what is wrong without handing back the control is just bad
//   news delivered on time.
//
// It reads chrome.storage rather than keeping its own copy, so the panel and
// the spoken channel can never disagree about what the run found.

import { decisionContext, decisionPayload, decisionMessage, wireDecisionKeys, findingKey } from '@ai4a11y/tools/utils/verification-decisions.js';
import { renderDecisionChoices } from '@ai4a11y/tools/utils/verification-decision-view.js';

const KEY = 'aa.validation';

export function mountValidationPanel(root, { onControl } = {}) {
  root.classList.add('va');
  root.setAttribute('aria-live', 'polite');
  // The spoken channel is the primary one for a screen-reader user; this
  // surface is secondary, so its live region is polite and its updates never
  // steal focus. The gate is the exception and manages focus explicitly.
  root.setAttribute('aria-relevant', 'additions text');

  let state = null;
  let checksOn = false;     // the one setting: is the agent's work checked?
  let lastPainted = null;   // skip rebuilds when nothing changed
  let focusedGate = null;   // focus the gate once per new hold, not per render

  // Storage is shared with the service worker, so a field can arrive as a type
  // this view did not expect. One such value used to throw mid-render and
  // erase the whole panel — every finding gone, no error visible, looking
  // exactly like "nothing was found". A surface whose job is to report
  // problems must never fail silently, so a wrong type costs one section.
  const asList = (v) => (Array.isArray(v) ? v : []);

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (tag === 'summary' && text) n.dataset.vaKey = `disclosure:${text}`;
    return n;
  };

  function render() {
    // A storage write that changes nothing must not cost the person their
    // scroll position, their focus, or the text they are mid-typing.
    // `updated` is a timestamp that changes on every publish - leaving it in
    // meant the guard never matched and every publish rebuilt the panel.
    const now = JSON.stringify([checksOn, state ? { ...state, updated: 0 } : null]);
    if (now === lastPainted) return;
    lastPainted = now;

    // What the person had before the rebuild, restored after it.
    const openKeys = new Map([...root.querySelectorAll('details > summary')]
      .map((n) => [n.dataset.vaKey || n.textContent, n.parentElement.open]));
    const active = document.activeElement;
    // A stable key beats button text: several gap sections all say "Answer",
    // and matching by text sent focus to the first one - the wrong question,
    // for exactly the keyboard and screen reader users this panel serves.
    const activeKey = root.contains(active) ? (active.dataset?.vaKey || null) : null;
    const activeText = root.contains(active) ? active.textContent : null;
    const drafts = new Map([...root.querySelectorAll('input[data-va-key]')]
      .map(input => [input.dataset.vaKey, input.value]));
    const typing = root.contains(active) && active.tagName === 'INPUT'
      ? { value: active.value, start: active.selectionStart, end: active.selectionEnd }
      : null;
    const scroll = root.scrollTop;

    root.textContent = '';
    if (!state || !state.contract) {
      root.append(settingCard());
      if (checksOn) root.append(startForm());
      for (const input of root.querySelectorAll('input[type="text"][data-va-key]')) {
        if (drafts.has(input.dataset.vaKey)) input.value = drafts.get(input.dataset.vaKey);
      }
      const again = activeKey && [...root.querySelectorAll('[data-va-key]')].find(n => n.dataset.vaKey === activeKey);
      if (again) again.focus();
      return;
    }

    const held = state.gate?.allowed === false;
    // The current decision comes first; the full request stays inspectable.
    const c = state.contract;
    const ask = el(held ? 'details' : 'section', 'va-ask');
    ask.append(el(held ? 'summary' : 'h2', null, 'What you asked for'));
    ask.append(el('p', null, state.opts?.request || describe(c)));
    const edit = el('button', 'va-edit', 'Change something');
    edit.addEventListener('click', () => onControl?.(state.opts?.requireModel
      ? { action: 'edit-ask', field: 'request', value: state.opts.request || c.said }
      : { action: 'edit-ask' }));
    ask.append(edit);
    root.append(ask);

    if (state.modelState?.status === 'preparing' || state.modelState?.status === 'failed') {
      const preparing = state.modelState.status === 'preparing';
      const preparation = el('section', 'va-preparation');
      preparation.setAttribute('role', 'status');
      preparation.append(el('h2', null, preparing ? 'Getting the checks ready' : 'The task did not start'));
      preparation.append(el('p', null, preparing
        ? 'I’m reading your request and deciding what to watch for. This usually takes about 15 seconds, and the agent starts right after.'
        : (state.modelState.error || 'I could not prepare checks for this request.')));
      if (!preparing && state.opts?.request) {
        const retry = el('button', 'va-do primary', 'Try again');
        retry.dataset.vaKey = 'retry-preparation';
        retry.addEventListener('click', () => onControl?.({ action: 'retry', task: state.opts.request, tabId: state.opts.tabId }));
        preparation.append(retry);
      }
      root.append(preparation);
    }
    if (state.completion) {
      const result = el('section', 'va-completion');
      result.setAttribute('role', 'status');
      result.append(el('h2', null, state.completion.complete ? 'Completion verified' : 'Completion not verified'));
      result.append(el('p', null, state.completion.reason));
      for (const check of asList(state.completion.checks)) {
        result.append(el('p', null, `${check.goal}: ${check.status === 'complete' ? 'Verified' : 'Not verified'}`));
        if (check.quote) result.append(el('blockquote', null, check.quote));
        if (check.url) result.append(el('p', 'va-muted', `Source: ${check.url}`));
      }
      root.append(result);
    }

    if (state.taskModel || state.progress) {
      const model = el('details', 'va-plan');
      model.setAttribute('aria-live', 'off');
      model.append(el('summary', null, 'Task model and progress'));
      for (const selected of asList(state.taskModel?.selection)) {
        model.append(el('p', null, selected.id.replace(/[+_-]/g, ' ').replace(/^./, c => c.toUpperCase())));
      }
      const requirements = asList(state.taskModel?.requirements);
      if (requirements.length) {
        model.append(el('h3', null, 'From your request'));
        const list = el('ul');
        for (const requirement of requirements) list.append(el('li', null, requirement.quote));
        model.append(list);
      }
      const statusText = { unchecked: 'Not checked yet', active: 'On this page',
        unresolved: 'Still unresolved', completed: 'Completed', 'not-applicable': 'Not needed' };
      const nodes = Object.values(state.progress || {});
      const list = el('ul');
      for (const node of nodes.filter(n => n.status !== 'unchecked' || !String(n.id).includes('.'))) {
        const item = el('li', null, `${node.label}: ${statusText[node.status] || 'Not checked yet'}`);
        if (node.evidence?.quote) item.append(el('blockquote', null, node.evidence.quote));
        list.append(item);
      }
      model.append(list);
      if (state.observation?.status === 'failed') model.append(el('p', null, 'I could not check this page.'));
      root.append(model);
    }

    // ── what wasn't said ────────────────────────────────────────────────────
    // A field left blank silently switches off the checks that depend on it.
    // Showing which ones is the difference between a layer that quietly does
    // less and one that says so — and it turns the omission into a question
    // the person can answer in one tap rather than a gap only we can see.
    for (const g of asList(state.unspecified)) {
      const q = el('section', 'va-gap');
      q.append(el('p', 'va-text', g.ask));
      q.append(el('p', 'va-where', `without it I can't check ${g.unchecked[0]}`));
      const b = el('button', 'va-do', 'Answer');
      b.dataset.vaKey = `gap:${g.field}`;
      b.addEventListener('click', () => onControl?.({ action: 'fill-gap', field: g.field }));
      q.append(b);
      root.append(q);
    }

    // ── the gate, when the agent is held ────────────────────────────────────
    if (state.gate && state.gate.allowed === false) {
      const gate = el('section', 'va-gate');
      gate.setAttribute('role', 'alertdialog');
      gate.setAttribute('aria-label', 'The agent is waiting for you');
      gate.append(el('h2', null, 'Waiting for you'));
      const message = el('p', null, decisionMessage(state));
      message.id = 'va-decision-message';
      gate.setAttribute('aria-describedby', message.id);
      gate.append(message);

      const gateState = state;
      const answers = renderDecisionChoices(gateState, { buttonClass: 'va-do', keyAttribute: 'data-va-key',
        onChoice: payload => onControl?.({ action: 'answer', ...payload }) });
      gate.append(answers);
      const form = el('form', 'va-decision-answer');
      const input = el('input', 'va-ask-input');
      input.placeholder = 'Or tell me something else';
      input.setAttribute('aria-label', 'Or tell me something else');
      input.dataset.vaKey = `answer-text:${decisionContext(gateState).decisionKey}`;
      const send = el('button', 'va-do', 'Send');
      send.type = 'submit';
      form.append(input, send);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!input.value.trim()) return;
        onControl?.({ action: 'answer', ...decisionPayload(gateState,
          { kind: 'custom', response: input.value.trim() }) });
      });
      gate.append(form);
      wireDecisionKeys(gate);
      root.append(gate);
      // The one place focus moves on its own, because the run cannot proceed
      // until this is answered - and only when the hold is new, so re-renders
      // while the person reads elsewhere do not keep dragging them back.
      const gateKey = decisionContext(gateState).decisionKey;
      if (gateKey !== focusedGate) {
        focusedGate = gateKey;
        const focusBeforeFrame = document.activeElement;
        requestAnimationFrame(() => {
          if (gate.isConnected && focusedGate === gateKey && document.activeElement === focusBeforeFrame
            && !gate.contains(document.activeElement)) gate.querySelector('.va-do')?.focus();
        });
      }
    }

    // ── who has the wheel, while the person has it ──────────────────────────
    //
    // handOver() and handBack() shipped without a surface, so the layer could
    // be handed a part of the task and had no way to be given it back. Two
    // things acting on one page with no shared record of which one is acting
    // is how the agent once spent ten steps trying to dismiss its own overlay.
    if (state.holder === 'person') {
      const wheel = el('section', 'va-wheel');
      wheel.setAttribute('role', 'status');
      const at = state.handOverNodeLabel || state.handOverNode;
      wheel.append(el('h2', null, 'You have this part'));
      wheel.append(el('p', null, at
        ? `The agent is paused at ${at} and still reading the page.`
        : 'The agent is paused and still reading the page.'));
      const row = el('div', 'va-answers');
      const back = el('button', 'va-do primary', 'Give it back');
      back.dataset.vaKey = 'hand-back';
      back.addEventListener('click', () => onControl?.({
        action: 'hand-back', node: state.handOverNode || null,
      }));
      row.append(back);
      wheel.append(row);
      root.append(wheel);
    }

    // ── ask about this page ─────────────────────────────────────────────────
    //
    // The one control here that does NOT touch the agent. Every other press in
    // this panel becomes an instruction, which is why asking a question used to
    // mean changing what the agent does next. Validation.ask() reads the page
    // and answers; nothing is steered and nothing is held.
    //
    // It shipped with the route, the schema and the tests and no surface at
    // all, so the capability existed and could not be reached.
    // ── going back to a decision ────────────────────────────────────────────
    // `Trace.why()` shipped with a route, 39 assertions and no surface, so the
    // record could be queried by nothing. Findings carry `node`, `cluster`,
    // `moment` and `verified` for exactly this and nothing read them.
    //
    // This is a lookup. Pressing one of these re-opens a decision so it can be
    // looked at again; it does not undo anything that has already happened on
    // the site, and the answer says so.
    const decisions = state.decisions || [];
    if (decisions.length) {
      const box = el(held ? 'details' : 'section', 'va-back');
      box.append(el(held ? 'summary' : 'h2', null, 'Go back to a decision'));
      const list = el('ul', 'va-steps');
      for (const d of decisions.slice(-8).reverse()) {
        const li = el('li');
        const b = el('button', 'va-do', d.label || `step ${d.nodeId}`);
        b.dataset.vaKey = `why:${d.nodeId}`;
        b.addEventListener('click', () => onControl?.({ action: 'why', nodeId: d.nodeId }));
        li.append(b);
        if (d.phase) li.append(el('span', 'va-where', d.phase));
        list.append(li);
      }
      box.append(list);

      const back = state.lookedBack;
      if (back && back.found) {
        const ans = el('div', 'va-looked');
        ans.append(el('p', 'va-text',
          `${back.label || back.nodeId}${back.phase ? ` - ${back.phase}` : ''}`));
        for (const f of back.findings || []) {
          ans.append(el('p', 'va-where', `checked: ${f.widget}`));
        }
        if ((back.actions || []).length) {
          ans.append(el('p', 'va-where', `did: ${back.actions.join(', ')}`));
        }
        ans.append(el('p', 'va-note', back.note));
        box.append(ans);
      } else if (back) {
        box.append(el('p', 'va-where', back.say || 'Nothing on the record for that.'));
      }
      root.append(box);
    }

    {
      const box = el(held ? 'details' : 'section', 'va-ask-page');
      box.append(el(held ? 'summary' : 'h2', null, 'Ask about this page'));

      const form = document.createElement('form');
      form.className = 'va-answers';
      const input = el('input', 'va-ask-input');
      input.type = 'text';
      input.placeholder = 'ask about something on this page';
      input.setAttribute('aria-label', 'Ask a question about this page');
      input.dataset.vaKey = 'ask-input';
      const go = el('button', 'va-do primary', 'Ask');
      go.type = 'submit';
      form.append(input, go);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;
        input.value = '';
        onControl?.({ action: 'ask', question: q });
      });
      box.append(form);

      // Newest first, and each answer carries the page's own words underneath,
      // the same as every other claim this layer makes.
      for (const a of (state.asked || []).slice(-3).reverse()) {
        const item = el('div', 'va-asked');
        item.append(el('p', 'va-text', a.question));
        item.append(el('p', null, a.say || a.answer || 'This page does not say.'));
        if (a.quote) item.append(el('p', 'va-where', a.quote));
        box.append(item);
      }
      root.append(box);
    }

    // ── the run, in review ──────────────────────────────────────────────────
    // Rendered once the run has wrapped up. Pull, not push: the outcome first
    // in full, then the kept findings as counted groups by what kind of thing
    // each is, expandable one group at a time. The counted-inventory shape is
    // the eyes-free one: a screen reader user hears "3 kept about the price"
    // and opens the group they care about instead of listening to a serial
    // dump of everything.
    if (state.wrapUp) {
      const rev = el('section', 'va-review');
      rev.append(el('h2', null, 'The run, in review'));
      const kept = (state.findings || [])
        .filter((f) => f.level === 'ambient' && !f.confirming);
      const outcome = kept.filter((f) => f.moment === 'Completion');
      const rest = kept.filter((f) => f.moment !== 'Completion');
      for (const f of outcome) {
        const item = el('div', 'va-asked');
        item.append(el('p', 'va-text', f.say));
        if (f.from) item.append(el('p', 'va-where', f.from));
        if (f.surface) item.append(el('p', 'va-surface', surfaceLine(f)));
        rev.append(item);
      }
      if (!outcome.length && !state.completion) {
        rev.append(el('p', null, 'No outcome question was answerable from the pages seen.'));
      }
      // Grouped by the question's own kind, strongest first inside a group.
      const strength = (f) => (f.eu
        ? Math.max(...Object.values(f.eu).filter((x) => typeof x === 'number')) : 0);
      const groups = new Map();
      for (const f of rest) {
        const k = f.cluster || 'other';
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(f);
      }
      for (const [k, fs] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
        fs.sort((a, b) => strength(b) - strength(a));
        const d = el('details', 'va-revgroup');
        const sum = el('summary', null,
          `${fs.length} kept about ${k === 'facts' ? 'what the pages said' : k}`);
        d.append(sum);
        for (const f of fs) {
          const item = el('div', 'va-asked');
          item.append(el('p', 'va-text', f.say));
          if (f.from) item.append(el('p', 'va-where', f.from));
          if (f.surface) item.append(el('p', 'va-surface', surfaceLine(f)));
          d.append(item);
        }
        rev.append(d);
      }
      root.append(rev);
    }

    // ── findings ────────────────────────────────────────────────────────────
    // The finding the gate is holding for renders in the gate block above,
    // with the gate's own answers - listing it again below gave the same
    // question two different button rows. One question, one place.
    // Only the one the gate block is actually showing. Excluding everything the
    // gate waits on hid every finding behind a single summary line.
    const heldNow = new Set(
      (state.gate && state.gate.allowed === false && state.gate.leading)
        ? [state.gate.leading] : []);
    const findings = (state.findings || [])
      .filter((f) => f.level !== 'ambient' || f.confirming)
      .filter((f) => !heldNow.has(f.widget));
    if (!findings.length) {
      if (state.gate?.allowed !== false) root.append(el('div', 'va-empty', 'Nothing to flag yet.'));
    } else {
      // What has already been waved past. Without this a finding kept its live
      // buttons after being dismissed, so pressing "Got it" changed nothing on
      // screen and the same two items were dismissed over and over for the
      // length of a recorded Amazon run. The finding stays visible — it is part
      // of the record of what was checked — it just stops asking.
      const seenAlready = new Set(state.acknowledged || []);
      const list = el('ul', 'va-list');
      // Grouped by the step of the task each finding belongs to, so a node's
      // questions read as one moment rather than an interleaved list. The
      // group header is the node's own label; findings with no node fall
      // under their phase.
      let lastGroup = null;
      for (const f of findings) {
        const group = f.nodeLabel || f.phase || null;
        if (group && group !== lastGroup) {
          const h = el('li', 'va-nodehead');
          h.append(el('span', null, group));
          list.append(h);
          lastGroup = group;
        }
        const done = seenAlready.has(findingKey(f));
        const li = el('li', `va-item ${tone(f)}${done ? ' va-read' : ''}`);
        li.append(el('span', 'va-dot'));
        const body = el('div', 'va-body');
        body.append(el('p', 'va-text', f.say));
        if (f.from) body.append(el('p', 'va-where', f.from));
        if (f.surface) body.append(el('p', 'va-surface', surfaceLine(f)));
        if (done) {
          li.append(body);
          list.append(li);
          continue;
        }
        const row = el('div', 'va-answers');
        // The page's own values for this choice, one button each. Pressing one
        // sends the agent "Choose X, then read back what changed" and marks
        // the finding dealt with. This is the option set being real: values
        // read off the page and quote-verified, never invented.
        if (Array.isArray(f.options) && f.options.length) {
          for (const opt of f.options.slice(0, 4)) {
            const b = el('button', 'va-do primary', `Pick ${opt}`);
            b.dataset.vaKey = `opt:${f.widget}:${opt}`;
            b.addEventListener('click', () => {
              onControl?.({ ...(f.control || {}), action: f.control?.action || 'select-options',
                node: f.node ?? null, widget: f.widget, option: opt });
              onControl?.({ action: 'ack', key: findingKey(f) });
            });
            row.append(b);
          }
        }
        if (f.control) {
          const b = el('button', 'va-do', f.control.label);
          b.dataset.vaKey = `do:${f.widget}`;
          b.addEventListener('click', () => {
            onControl?.(f.control);
            onControl?.({ action: 'ack', key: findingKey(f) });
          });
          row.append(b);
        }
        // Without a way to wave a finding past, this surface could only act -
        // and the agent stayed held on findings a panel-only user had no
        // rendered way to dismiss.
        const skip = el('button', 'va-do', f.control?.decline || 'Got it');
        skip.dataset.vaKey = `ack:${f.widget}`;
        skip.addEventListener('click', () =>
          onControl?.({ action: 'ack', key: findingKey(f) }));
        row.append(skip);
        body.append(row);
        li.append(body);
        list.append(li);
      }
      if (held) {
        const history = el('details', 'va-history');
        history.append(el('summary', null, 'Earlier updates'), list);
        root.append(history);
      } else root.append(list);
    }

    // ── footer ──────────────────────────────────────────────────────────────
    const foot = el('div', 'va-foot');
    const n = (state.said || []).length;
    foot.append(el('span', null,
      `${n} said aloud, ${state.spokenWords || 0} words`));
    const more = el('button', null, 'What else did you check?');
    more.addEventListener('click', () => onControl?.({ action: 'on-request' }));
    foot.append(more);
    root.append(foot);

    // ── restore what the rebuild would otherwise have taken ────────────────
    for (const sum of root.querySelectorAll('details > summary')) {
      const key = sum.dataset.vaKey || sum.textContent;
      if (openKeys.has(key)) sum.parentElement.open = openKeys.get(key);
    }
    for (const input of root.querySelectorAll('input[data-va-key]')) {
      if (drafts.has(input.dataset.vaKey)) input.value = drafts.get(input.dataset.vaKey);
    }
    const byKey = activeKey
      ? [...root.querySelectorAll('[data-va-key]')].find(node => node.dataset.vaKey === activeKey)
      : null;
    if (typing) {
      const input = byKey;
      if (input) {
        input.value = typing.value;
        input.focus();
        try { input.setSelectionRange(typing.start, typing.end); } catch { /* number inputs */ }
      }
    } else if (activeKey || activeText) {
      if (byKey) byKey.focus();
      else if (!activeKey && activeText) {
        for (const b of root.querySelectorAll('button')) {
          if (b.textContent === activeText) { b.focus(); break; }
        }
      }
    }
    root.scrollTop = scroll;
  }

  // Checking without delegating.
  //
  // The layer's job is to hold a page to what someone said they wanted, and
  // that is worth doing whether or not an agent is the one clicking. Someone
  // shopping themselves still cannot see that the size on the page stopped
  // matching the size they asked for.
  // The switch for checking the agent's work. Off unless the person turns it
  // on; the popup shows the same setting.
  function settingCard() {
    const s = el('section', 'va-setting');
    const id = 'va-checks-switch';
    const row = el('div', 'va-setting-row');
    const box = el('input');
    box.type = 'checkbox';
    box.id = id;
    box.setAttribute('role', 'switch');
    box.checked = checksOn;
    box.dataset.vaKey = 'checks-switch';
    box.setAttribute('aria-describedby', 'va-checks-hint');
    const label = el('label', null, 'Check the agent’s work');
    label.setAttribute('for', id);
    box.addEventListener('change', () => chrome.storage.sync.set({ verificationLayer: box.checked }));
    row.append(box, label);
    s.append(row);
    const hint = el('p', 'va-hint', checksOn
      ? 'On. Before the agent acts I read your request and each page, ask you before choices it should not make for you, and hold payments, bookings and messages until you say yes. Tasks take about 15 seconds longer to start.'
      : 'Off. The agent works on its own. Turn this on to have its work checked as it goes.');
    hint.id = 'va-checks-hint';
    s.append(hint);
    return s;
  }

  function startForm() {
    const s = el('section', 'va-start');
    const id = 'va-ask-input';
    const label = el('label', null, 'Or check a page you are browsing yourself:');
    label.setAttribute('for', id);
    s.append(label);

    const row = el('div', 'va-start-row');
    const input = el('input');
    input.id = id;
    input.type = 'text';
    input.dataset.vaKey = 'start-input';
    input.placeholder = 'e.g. a refundable hotel near Stanford under $700';
    const go = el('button', 'va-do primary', 'Start checking');

    const submit = () => {
      const said = input.value.trim();
      if (!said) { input.focus(); return; }
      onControl?.({ action: 'start', said });
    };
    go.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

    row.append(input, go);
    s.append(row);
    s.append(el('p', 'va-hint',
      'Say it however you like. Anything you leave out, I’ll ask about — '
      + 'I won’t assume it.'));
    return s;
  }

  const tone = (f) => (f.confirming ? 'ok'
    : f.level === 'stop' ? 'stop' : f.level === 'aside' ? 'note' : 'quiet');

  // Explain how the finding was presented without internal routing labels.
  const surfaceLine = (f) => [
    { widget: 'Paused for your answer', checkpoint: 'Said while continuing', log: 'Kept for review' }[f.surface],
    f.surfaceWhy || null,
  ].filter(Boolean).join(' · ');

  function describe(c) {
    const bits = [c.item];
    if (c.mustHaves?.length) bits.push(c.mustHaves.join(' and '));
    if (c.size) bits.push(`size ${c.size}`);
    if (c.budget) bits.push(`under ${c.budget}`);
    if (c.deadline) bits.push(`by ${c.deadline}`);
    return `${bits.filter(Boolean).join(', ')}.`;
  }

  Promise.all([chrome.storage.local.get(KEY), chrome.storage.sync?.get?.('verificationLayer') ?? {}]).then(([r, s]) => {
    state = r[KEY] || null; checksOn = s.verificationLayer === true; render();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.verificationLayer) { checksOn = changes.verificationLayer.newValue === true; render(); return; }
    if (area !== 'local' || !changes[KEY]) return;
    state = changes[KEY].newValue;
    render();
  });

  return { render, get state() { return state; } };
}
