(() => {
  // node_modules/@ai4a11y/tools/utils/verification-decisions.js
  var decisionIdentity = (value) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
  var findingKey = (f) => `${f.widget}|${f.phase}|${f.say}` + (f.runtime ? `|${decisionIdentity([f.runtime.decision, f.runtime.action])}` : "");
  function decisionContext(state) {
    const widget = state?.gate?.leading || state?.gate?.waitingOn?.[0];
    const finding = [...state?.findings || []].reverse().find((f) => f.widget === widget);
    const taskId = state?.taskId || null;
    return { widget, finding, taskId, decisionKey: decisionIdentity([
      taskId,
      widget,
      finding?.phase,
      finding?.say || state?.gate?.say,
      finding?.from,
      finding?.options,
      finding?.control,
      finding?.runtime,
      state?.observation?.url,
      state?.observation?.hash
    ]) };
  }
  function decisionChoices(state) {
    const { finding } = decisionContext(state);
    if (finding?.runtime?.decision?.choices?.length) {
      return [...finding.runtime.decision.choices.map((c) => ({
        label: c.label,
        response: c.label,
        kind: "runtime",
        choiceId: c.id
      })), { label: "Stop here", response: "stop", kind: "stop" }];
    }
    const options = [...new Set((finding?.options || []).filter((o) => typeof o === "string" && o.trim()))].slice(0, 4);
    const choices = options.map((option) => ({ label: option, response: option, kind: "option" }));
    if (!choices.length) {
      choices.push(finding?.control?.label ? { label: finding.control.label, response: finding.control.label, kind: "control" } : { label: "Go on", response: "go on", kind: "continue" });
    }
    return [...choices, { label: "Stop here", response: "stop", kind: "stop" }];
  }
  function decisionPayload(state, choice) {
    const { widget, taskId, decisionKey } = decisionContext(state);
    return { widget, taskId, decisionKey, ...choice };
  }
  function decisionMessage(state) {
    const decision = decisionContext(state).finding?.runtime?.decision;
    if (!decision) return state?.gate?.say || "Something needs your decision.";
    const message = String(decision.message || "").trim();
    const question = String(decision.question || "").trim();
    if (!message) return question;
    if (!question) return message;
    const comparable = (value) => value.replace(/[.!?…]+$/u, "").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
    const messageComparable = comparable(message), questionComparable = comparable(question);
    return messageComparable === questionComparable || messageComparable.endsWith(` ${questionComparable}`) ? message : `${message} ${question}`;
  }
  function wireDecisionKeys(root) {
    root.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp"].includes(event.key) || event.target.tagName !== "BUTTON") return;
      const buttons = [...root.querySelectorAll("button:not([disabled])")];
      const index = buttons.indexOf(event.target);
      if (index < 0) return;
      event.preventDefault();
      buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
    });
  }

  // node_modules/@ai4a11y/tools/utils/verification-decision-view.js
  function decisionView(state) {
    const decision = decisionContext(state).finding?.runtime?.decision;
    const choices = decisionChoices(state);
    const candidates = (decision?.choices || []).filter((c) => c.action === "select");
    const fields = [...new Set(candidates.flatMap((c) => (c.facts || []).map((f) => f.name)))].filter((name) => !candidates.every((c) => c.facts?.find((f) => f.name === name)?.value.trim() === c.label.trim()));
    const shared = candidates.length > 1 ? (candidates[0].facts || []).filter((f) => fields.includes(f.name) && candidates.every((c) => c.facts?.some((other) => other.name === f.name && other.value === f.value))) : [];
    const differing = fields.filter((name) => !shared.some((f) => f.name === name));
    const comparison = candidates.length > 1 && differing.length > 0;
    return {
      kind: decision?.kind === "commit" ? "commitment" : comparison ? "comparison" : "choice",
      fields: differing,
      shared,
      choices: choices.map((choice) => ({
        ...choice,
        detail: decision?.choices?.find((c) => c.id === choice.choiceId) || null
      }))
    };
  }
  var css = `
.vd-options{display:grid;gap:10px;width:100%;min-width:0}
.vd-options button{min-height:44px!important;padding:9px 12px!important;white-space:normal;overflow-wrap:anywhere}
.vd-candidates{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:10px;min-width:0}
.vd-option{display:flex;flex-direction:column;gap:10px;min-width:0;container-type:inline-size;border:1px solid #d4d4d8;border-radius:10px;padding:12px;background:#fff;color:#18181b}
.vd-option dl,.vd-shared dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);gap:6px 10px;margin:0;font-size:inherit;line-height:1.5}
.vd-option dt,.vd-shared dt{color:#52525b;font-weight:400;overflow-wrap:anywhere}
.vd-option dd,.vd-shared dd{margin:0;font-weight:500;overflow-wrap:anywhere}
.vd-shared{padding:0 2px 8px;min-width:0}.vd-shared h3{font-size:inherit;margin:0 0 6px;font-weight:500}
.vd-option button{margin-top:auto!important;white-space:normal;overflow-wrap:anywhere;width:100%}
.vd-other{display:flex;gap:8px;flex-wrap:wrap}
.vd-source{font-size:.9em;overflow-wrap:anywhere;color:#52525b}
.vd-source summary{cursor:pointer;padding:4px 0}
.vd-source blockquote{margin:8px 0;padding-left:10px;border-left:2px solid #d4d4d8}
.vd-options[data-view=commitment] .vd-candidates{grid-template-columns:1fr}
@container(max-width:240px){.vd-option dl{grid-template-columns:minmax(0,1fr);gap:2px}.vd-option dt{font-size:.9em}.vd-option dd{margin-bottom:6px}}
@media(forced-colors:active){.vd-option{border-color:CanvasText;background:Canvas;color:CanvasText}}
`;
  var viewIdSequence = /* @__PURE__ */ Symbol.for("ai4a11y.verificationDecisionViewSequence");
  function renderDecisionChoices(state, { document: doc = document, buttonClass, keyAttribute, onChoice }) {
    if (!doc.getElementById("verification-decision-view-style")) {
      const style = doc.createElement("style");
      style.id = "verification-decision-view-style";
      style.textContent = css;
      doc.head.append(style);
    }
    const el = (tag, cls, text) => {
      const node = doc.createElement(tag);
      if (cls) node.className = cls;
      if (text !== void 0) node.textContent = text;
      return node;
    };
    const identify = (node) => {
      do {
        doc[viewIdSequence] = (doc[viewIdSequence] || 0) + 1;
        node.id = `verification-options-${doc[viewIdSequence]}`;
      } while (doc.getElementById(node.id));
      return node.id;
    };
    const view = decisionView(state);
    const root = el("div", "vd-options");
    root.dataset.view = view.kind;
    identify(root);
    const cards = el("div", "vd-candidates"), other = el("div", "vd-other");
    if (view.shared.length) {
      const shared = el("section", "vd-shared");
      shared.setAttribute("aria-label", "Shared details");
      shared.append(el("h3", "", "Shared details"));
      const list = el("dl");
      identify(list);
      for (const fact of view.shared) list.append(el("dt", "", fact.name), el("dd", "", fact.value));
      shared.append(list);
      root.append(shared);
    }
    for (const [index, choice] of view.choices.entries()) {
      const button = el("button", buttonClass, choice.label);
      button.type = "button";
      button.setAttribute(keyAttribute, `answer:${decisionContext(state).decisionKey}:${choice.kind}:${index}`);
      button.addEventListener("click", () => onChoice(decisionPayload(state, choice)));
      const detail = choice.detail;
      const descriptions = [];
      if (detail && (detail.action === "approve" || view.kind === "comparison" && detail.action === "select")) {
        const card = el("section", "vd-option");
        card.setAttribute("aria-label", choice.label);
        const facts = detail.facts || [];
        const shownFacts = view.kind === "comparison" ? view.fields.map((name) => ({ name, value: facts.find((f) => f.name === name)?.value || "Not stated" })) : facts;
        if (shownFacts.length) {
          const list = el("dl");
          identify(list);
          descriptions.push(list.id);
          for (const fact of shownFacts) {
            list.append(el("dt", "", fact.name), el("dd", "", fact.value));
          }
          card.append(list);
        }
        if (view.kind === "commitment" && detail.quote) {
          const source = el("details", "vd-source");
          source.open = facts.length === 0;
          const summary = el("summary", "", "What the page says");
          const sourceKey = `source:${decisionContext(state).decisionKey}:${detail.id}`;
          summary.setAttribute(keyAttribute, sourceKey);
          source.dataset.decisionDisclosure = sourceKey;
          const quotation = el("blockquote", "", detail.quote);
          identify(quotation);
          if (!shownFacts.length) descriptions.push(quotation.id);
          source.append(summary, quotation);
          card.append(source);
        }
        card.append(button);
        cards.append(card);
      } else other.append(button);
      if (descriptions.length) button.setAttribute("aria-describedby", descriptions.join(" "));
    }
    if (cards.childElementCount) root.append(cards);
    if (other.childElementCount) root.append(other);
    return root;
  }

  // extension/validation/panel.js
  var KEY = "aa.validation";
  function mountValidationPanel(root, { onControl } = {}) {
    root.classList.add("va");
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-relevant", "additions text");
    let state = null;
    let checksOn = false;
    let editing = null;
    let lastPainted = null;
    let focusedGate = null;
    const asList = (v) => Array.isArray(v) ? v : [];
    const el = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      if (tag === "summary" && text) n.dataset.vaKey = `disclosure:${text}`;
      return n;
    };
    function render() {
      const now = JSON.stringify([checksOn, editing, state ? { ...state, updated: 0 } : null]);
      if (now === lastPainted) return;
      lastPainted = now;
      const openKeys = new Map([...root.querySelectorAll("details > summary")].map((n2) => [n2.dataset.vaKey || n2.textContent, n2.parentElement.open]));
      const active = document.activeElement;
      const activeKey = root.contains(active) ? active.dataset?.vaKey || null : null;
      const activeText = root.contains(active) ? active.textContent : null;
      const drafts = new Map([...root.querySelectorAll("input[data-va-key]")].map((input) => [input.dataset.vaKey, input.value]));
      const typing = root.contains(active) && active.tagName === "INPUT" ? { value: active.value, start: active.selectionStart, end: active.selectionEnd } : null;
      const scroll = root.scrollTop;
      root.textContent = "";
      if (!state || !state.contract) {
        root.append(settingCard());
        if (checksOn) root.append(startForm());
        for (const input of root.querySelectorAll('input[type="text"][data-va-key]')) {
          if (drafts.has(input.dataset.vaKey)) input.value = drafts.get(input.dataset.vaKey);
        }
        const again = activeKey && [...root.querySelectorAll("[data-va-key]")].find((n2) => n2.dataset.vaKey === activeKey);
        if (again) again.focus();
        return;
      }
      const held = state.gate?.allowed === false;
      const c = state.contract;
      const ask = el(held ? "details" : "section", "va-ask");
      ask.append(el(held ? "summary" : "h2", null, "What you asked for"));
      ask.append(el("p", null, state.opts?.request || describe(c)));
      if (state.opts?.requireModel && editing === "request") {
        ask.append(inlineEditor("request", "Your request", state.opts.request || c.said || ""));
      } else {
        const edit = el("button", "va-edit", "Change something");
        edit.dataset.vaKey = "edit-request";
        edit.addEventListener("click", () => {
          if (!state.opts?.requireModel) {
            onControl?.({ action: "edit-ask" });
            return;
          }
          editing = "request";
          render();
          root.querySelector('[data-va-key="editor:request"]')?.focus();
        });
        ask.append(edit);
      }
      root.append(ask);
      if (state.modelState?.status === "preparing" || state.modelState?.status === "failed") {
        const preparing = state.modelState.status === "preparing";
        const preparation = el("section", "va-preparation");
        preparation.setAttribute("role", "status");
        preparation.append(el("h2", null, preparing ? "Getting the checks ready" : "The task did not start"));
        preparation.append(el("p", null, preparing ? "I\u2019m reading your request and deciding what to watch for. This usually takes about 15 seconds, and the agent starts right after." : state.modelState.error || "I could not prepare checks for this request."));
        if (!preparing && state.opts?.request) {
          const retry = el("button", "va-do primary", "Try again");
          retry.dataset.vaKey = "retry-preparation";
          retry.addEventListener("click", () => onControl?.({ action: "retry", task: state.opts.request, tabId: state.opts.tabId }));
          preparation.append(retry);
        }
        root.append(preparation);
      }
      if (state.completion) {
        const result = el("section", "va-completion");
        result.setAttribute("role", "status");
        result.append(el("h2", null, state.completion.complete ? "Completion verified" : "Completion not verified"));
        result.append(el("p", null, state.completion.reason));
        for (const check of asList(state.completion.checks)) {
          result.append(el("p", null, `${check.goal}: ${check.status === "complete" ? "Verified" : "Not verified"}`));
          if (check.quote) result.append(el("blockquote", null, check.quote));
          if (check.url) result.append(el("p", "va-muted", `Source: ${check.url}`));
        }
        root.append(result);
      }
      if (state.taskModel || state.progress) {
        const model = el("details", "va-plan");
        model.setAttribute("aria-live", "off");
        model.append(el("summary", null, "Task model and progress"));
        for (const selected of asList(state.taskModel?.selection)) {
          model.append(el("p", null, selected.id.replace(/[+_-]/g, " ").replace(/^./, (c2) => c2.toUpperCase())));
        }
        const requirements = asList(state.taskModel?.requirements);
        if (requirements.length) {
          model.append(el("h3", null, "From your request"));
          const list2 = el("ul");
          for (const requirement of requirements) list2.append(el("li", null, requirement.quote));
          model.append(list2);
        }
        const statusText = {
          unchecked: "Not checked yet",
          active: "On this page",
          unresolved: "Still unresolved",
          completed: "Completed",
          "not-applicable": "Not needed"
        };
        const nodes = Object.values(state.progress || {});
        const list = el("ul");
        for (const node of nodes.filter((n2) => n2.status !== "unchecked" || !String(n2.id).includes("."))) {
          const item = el("li", null, `${node.label}: ${statusText[node.status] || "Not checked yet"}`);
          if (node.evidence?.quote) item.append(el("blockquote", null, node.evidence.quote));
          list.append(item);
        }
        model.append(list);
        if (state.observation?.status === "failed") model.append(el("p", null, "I could not check this page."));
        root.append(model);
      }
      for (const g of asList(state.unspecified)) {
        const q = el("section", "va-gap");
        q.append(el("p", "va-text", g.ask));
        q.append(el("p", "va-where", `without it I can't check ${g.unchecked[0]}`));
        if (editing === `gap:${g.field}`) {
          q.append(inlineEditor(g.field, "Your answer", ""));
        } else {
          const b = el("button", "va-do", "Answer");
          b.dataset.vaKey = `gap:${g.field}`;
          b.addEventListener("click", () => {
            editing = `gap:${g.field}`;
            render();
            root.querySelector(`[data-va-key="editor:${g.field}"]`)?.focus();
          });
          q.append(b);
        }
        root.append(q);
      }
      if (state.gate && state.gate.allowed === false) {
        const gate = el("section", "va-gate");
        gate.setAttribute("role", "alertdialog");
        gate.setAttribute("aria-label", "The agent is waiting for you");
        gate.append(el("h2", null, "Waiting for you"));
        const message = el("p", null, decisionMessage(state));
        message.id = "va-decision-message";
        gate.setAttribute("aria-describedby", message.id);
        gate.append(message);
        const gateState = state;
        const answers = renderDecisionChoices(gateState, {
          buttonClass: "va-do",
          keyAttribute: "data-va-key",
          onChoice: (payload) => onControl?.({ action: "answer", ...payload })
        });
        gate.append(answers);
        const form = el("form", "va-decision-answer");
        const input = el("input", "va-ask-input");
        input.placeholder = "Or tell me something else";
        input.setAttribute("aria-label", "Or tell me something else");
        input.dataset.vaKey = `answer-text:${decisionContext(gateState).decisionKey}`;
        const send2 = el("button", "va-do", "Send");
        send2.type = "submit";
        form.append(input, send2);
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          if (!input.value.trim()) return;
          onControl?.({ action: "answer", ...decisionPayload(
            gateState,
            { kind: "custom", response: input.value.trim() }
          ) });
        });
        gate.append(form);
        wireDecisionKeys(gate);
        root.append(gate);
        const gateKey = decisionContext(gateState).decisionKey;
        if (gateKey !== focusedGate) {
          focusedGate = gateKey;
          const focusBeforeFrame = document.activeElement;
          requestAnimationFrame(() => {
            if (gate.isConnected && focusedGate === gateKey && document.activeElement === focusBeforeFrame && !gate.contains(document.activeElement)) gate.querySelector(".va-do")?.focus();
          });
        }
      }
      if (state.holder === "person") {
        const wheel = el("section", "va-wheel");
        wheel.setAttribute("role", "status");
        const at = state.handOverNodeLabel || state.handOverNode;
        wheel.append(el("h2", null, "You have this part"));
        wheel.append(el("p", null, at ? `The agent is paused at ${at} and still reading the page.` : "The agent is paused and still reading the page."));
        const row = el("div", "va-answers");
        const back = el("button", "va-do primary", "Give it back");
        back.dataset.vaKey = "hand-back";
        back.addEventListener("click", () => onControl?.({
          action: "hand-back",
          node: state.handOverNode || null
        }));
        row.append(back);
        wheel.append(row);
        root.append(wheel);
      }
      const decisions = state.decisions || [];
      if (decisions.length) {
        const box = el(held ? "details" : "section", "va-back");
        box.append(el(held ? "summary" : "h2", null, "Go back to a decision"));
        const list = el("ul", "va-steps");
        for (const d of decisions.slice(-8).reverse()) {
          const li = el("li");
          const b = el("button", "va-do", d.label || `step ${d.nodeId}`);
          b.dataset.vaKey = `why:${d.nodeId}`;
          b.addEventListener("click", () => onControl?.({ action: "why", nodeId: d.nodeId }));
          li.append(b);
          if (d.phase) li.append(el("span", "va-where", d.phase));
          list.append(li);
        }
        box.append(list);
        const back = state.lookedBack;
        if (back && back.found) {
          const ans = el("div", "va-looked");
          ans.append(el(
            "p",
            "va-text",
            `${back.label || back.nodeId}${back.phase ? ` - ${back.phase}` : ""}`
          ));
          for (const f of back.findings || []) {
            ans.append(el("p", "va-where", `checked: ${f.widget}`));
          }
          if ((back.actions || []).length) {
            ans.append(el("p", "va-where", `did: ${back.actions.join(", ")}`));
          }
          ans.append(el("p", "va-note", back.note));
          box.append(ans);
        } else if (back) {
          box.append(el("p", "va-where", back.say || "Nothing on the record for that."));
        }
        root.append(box);
      }
      {
        const box = el(held ? "details" : "section", "va-ask-page");
        box.append(el(held ? "summary" : "h2", null, "Ask about this page"));
        const form = document.createElement("form");
        form.className = "va-answers";
        const input = el("input", "va-ask-input");
        input.type = "text";
        input.placeholder = "ask about something on this page";
        input.setAttribute("aria-label", "Ask a question about this page");
        input.dataset.vaKey = "ask-input";
        const go = el("button", "va-do primary", "Ask");
        go.type = "submit";
        form.append(input, go);
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const q = input.value.trim();
          if (!q) return;
          input.value = "";
          onControl?.({ action: "ask", question: q });
        });
        box.append(form);
        for (const a of (state.asked || []).slice(-3).reverse()) {
          const item = el("div", "va-asked");
          item.append(el("p", "va-text", a.question));
          item.append(el("p", null, a.say || a.answer || "This page does not say."));
          if (a.quote) item.append(el("p", "va-where", a.quote));
          box.append(item);
        }
        root.append(box);
      }
      if (state.wrapUp) {
        const rev = el("section", "va-review");
        rev.append(el("h2", null, "The run, in review"));
        const kept = (state.findings || []).filter((f) => f.level === "ambient" && !f.confirming);
        const outcome = kept.filter((f) => f.moment === "Completion");
        const rest = kept.filter((f) => f.moment !== "Completion");
        for (const f of outcome) {
          const item = el("div", "va-asked");
          item.append(el("p", "va-text", f.say));
          if (f.from) item.append(el("p", "va-where", f.from));
          if (f.surface) item.append(el("p", "va-surface", surfaceLine(f)));
          rev.append(item);
        }
        if (!outcome.length && !state.completion) {
          rev.append(el("p", null, "No outcome question was answerable from the pages seen."));
        }
        const strength = (f) => f.eu ? Math.max(...Object.values(f.eu).filter((x) => typeof x === "number")) : 0;
        const groups = /* @__PURE__ */ new Map();
        for (const f of rest) {
          const k = f.cluster || "other";
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(f);
        }
        for (const [k, fs] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
          fs.sort((a, b) => strength(b) - strength(a));
          const d = el("details", "va-revgroup");
          const sum = el(
            "summary",
            null,
            `${fs.length} kept about ${k === "facts" ? "what the pages said" : k}`
          );
          d.append(sum);
          for (const f of fs) {
            const item = el("div", "va-asked");
            item.append(el("p", "va-text", f.say));
            if (f.from) item.append(el("p", "va-where", f.from));
            if (f.surface) item.append(el("p", "va-surface", surfaceLine(f)));
            d.append(item);
          }
          rev.append(d);
        }
        root.append(rev);
      }
      const heldNow = new Set(
        state.gate && state.gate.allowed === false && state.gate.leading ? [state.gate.leading] : []
      );
      const findings = (state.findings || []).filter((f) => f.level !== "ambient" || f.confirming).filter((f) => !heldNow.has(f.widget));
      if (!findings.length) {
        if (state.gate?.allowed !== false) root.append(el("div", "va-empty", "Nothing to flag yet."));
      } else {
        const seenAlready = new Set(state.acknowledged || []);
        const list = el("ul", "va-list");
        let lastGroup = null;
        for (const f of findings) {
          const group = f.nodeLabel || f.phase || null;
          if (group && group !== lastGroup) {
            const h = el("li", "va-nodehead");
            h.append(el("span", null, group));
            list.append(h);
            lastGroup = group;
          }
          const done = seenAlready.has(findingKey(f));
          const li = el("li", `va-item ${tone(f)}${done ? " va-read" : ""}`);
          li.append(el("span", "va-dot"));
          const body = el("div", "va-body");
          body.append(el("p", "va-text", f.say));
          if (f.from) body.append(el("p", "va-where", f.from));
          if (f.surface) body.append(el("p", "va-surface", surfaceLine(f)));
          if (done) {
            li.append(body);
            list.append(li);
            continue;
          }
          const row = el("div", "va-answers");
          if (Array.isArray(f.options) && f.options.length) {
            for (const opt of f.options.slice(0, 4)) {
              const b = el("button", "va-do primary", `Pick ${opt}`);
              b.dataset.vaKey = `opt:${f.widget}:${opt}`;
              b.addEventListener("click", () => {
                onControl?.({
                  ...f.control || {},
                  action: f.control?.action || "select-options",
                  node: f.node ?? null,
                  widget: f.widget,
                  option: opt
                });
                onControl?.({ action: "ack", key: findingKey(f) });
              });
              row.append(b);
            }
          }
          if (f.control) {
            const b = el("button", "va-do", f.control.label);
            b.dataset.vaKey = `do:${f.widget}`;
            b.addEventListener("click", () => {
              onControl?.(f.control);
              onControl?.({ action: "ack", key: findingKey(f) });
            });
            row.append(b);
          }
          const skip = el("button", "va-do", f.control?.decline || "Got it");
          skip.dataset.vaKey = `ack:${f.widget}`;
          skip.addEventListener("click", () => onControl?.({ action: "ack", key: findingKey(f) }));
          row.append(skip);
          body.append(row);
          li.append(body);
          list.append(li);
        }
        if (held) {
          const history = el("details", "va-history");
          history.append(el("summary", null, "Earlier updates"), list);
          root.append(history);
        } else root.append(list);
      }
      const foot = el("div", "va-foot");
      const n = (state.said || []).length;
      foot.append(el(
        "span",
        null,
        `${n} said aloud, ${state.spokenWords || 0} words`
      ));
      const more = el("button", null, "What else did you check?");
      more.addEventListener("click", () => onControl?.({ action: "on-request" }));
      foot.append(more);
      root.append(foot);
      for (const sum of root.querySelectorAll("details > summary")) {
        const key = sum.dataset.vaKey || sum.textContent;
        if (openKeys.has(key)) sum.parentElement.open = openKeys.get(key);
      }
      for (const input of root.querySelectorAll("input[data-va-key]")) {
        if (drafts.has(input.dataset.vaKey)) input.value = drafts.get(input.dataset.vaKey);
      }
      const byKey = activeKey ? [...root.querySelectorAll("[data-va-key]")].find((node) => node.dataset.vaKey === activeKey) : null;
      if (typing) {
        const input = byKey;
        if (input) {
          input.value = typing.value;
          input.focus();
          try {
            input.setSelectionRange(typing.start, typing.end);
          } catch {
          }
        }
      } else if (activeKey || activeText) {
        if (byKey) byKey.focus();
        else if (!activeKey && activeText) {
          for (const b of root.querySelectorAll("button")) {
            if (b.textContent === activeText) {
              b.focus();
              break;
            }
          }
        }
      }
      root.scrollTop = scroll;
    }
    function inlineEditor(field, labelText, value) {
      const form = el("form", "va-inline-edit");
      const id = `va-edit-${field}`;
      const label = el("label", null, labelText);
      label.setAttribute("for", id);
      const input = el("input");
      input.type = "text";
      input.id = id;
      input.value = value;
      input.dataset.vaKey = `editor:${field}`;
      const row = el("div", "va-start-row");
      const save = el("button", "va-do primary", "Save");
      save.type = "submit";
      const cancel = el("button", "va-do", "Cancel");
      cancel.type = "button";
      const close = () => {
        editing = null;
        render();
        root.querySelector(field === "request" ? '[data-va-key="edit-request"]' : `[data-va-key="gap:${field}"]`)?.focus();
      };
      cancel.addEventListener("click", close);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      });
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) {
          input.focus();
          return;
        }
        editing = null;
        onControl?.({ action: field === "request" ? "edit-ask" : "fill-gap", field, value: text, inline: true });
        render();
      });
      row.append(input, save, cancel);
      form.append(label, row);
      return form;
    }
    function settingCard() {
      const s = el("section", "va-setting");
      const id = "va-checks-switch";
      const row = el("div", "va-setting-row");
      const box = el("input");
      box.type = "checkbox";
      box.id = id;
      box.setAttribute("role", "switch");
      box.checked = checksOn;
      box.dataset.vaKey = "checks-switch";
      box.setAttribute("aria-describedby", "va-checks-hint");
      const label = el("label", null, "Check the agent\u2019s work");
      label.setAttribute("for", id);
      box.addEventListener("change", () => chrome.storage.sync.set({ verificationLayer: box.checked }));
      row.append(box, label);
      s.append(row);
      const hint = el("p", "va-hint", checksOn ? "On. Before the agent acts I read your request and each page, ask you before choices it should not make for you, and hold payments, bookings and messages until you say yes. Tasks take about 15 seconds longer to start." : "Off. The agent works on its own. Turn this on to have its work checked as it goes.");
      hint.id = "va-checks-hint";
      s.append(hint);
      return s;
    }
    function startForm() {
      const s = el("section", "va-start");
      const id = "va-ask-input";
      const label = el("label", null, "Or check a page you are browsing yourself:");
      label.setAttribute("for", id);
      s.append(label);
      const row = el("div", "va-start-row");
      const input = el("input");
      input.id = id;
      input.type = "text";
      input.dataset.vaKey = "start-input";
      input.placeholder = "e.g. a refundable hotel near Stanford under $700";
      const go = el("button", "va-do primary", "Start checking");
      const submit = () => {
        const said = input.value.trim();
        if (!said) {
          input.focus();
          return;
        }
        onControl?.({ action: "start", said });
      };
      go.addEventListener("click", submit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
      row.append(input, go);
      s.append(row);
      s.append(el(
        "p",
        "va-hint",
        "Say it however you like. Anything you leave out, I\u2019ll ask about \u2014 I won\u2019t assume it."
      ));
      return s;
    }
    const tone = (f) => f.confirming ? "ok" : f.level === "stop" ? "stop" : f.level === "aside" ? "note" : "quiet";
    const surfaceLine = (f) => [
      { widget: "Paused for your answer", checkpoint: "Said while continuing", log: "Kept for review" }[f.surface],
      f.surfaceWhy || null
    ].filter(Boolean).join(" \xB7 ");
    function describe(c) {
      const bits = [c.item];
      if (c.mustHaves?.length) bits.push(c.mustHaves.join(" and "));
      if (c.size) bits.push(`size ${c.size}`);
      if (c.budget) bits.push(`under ${c.budget}`);
      if (c.deadline) bits.push(`by ${c.deadline}`);
      return `${bits.filter(Boolean).join(", ")}.`;
    }
    Promise.all([chrome.storage.local.get(KEY), chrome.storage.sync?.get?.("verificationLayer") ?? {}]).then(([r, s]) => {
      state = r[KEY] || null;
      checksOn = s.verificationLayer === true;
      render();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.verificationLayer) {
        checksOn = changes.verificationLayer.newValue === true;
        render();
        return;
      }
      if (area !== "local" || !changes[KEY]) return;
      state = changes[KEY].newValue;
      render();
    });
    return { render, get state() {
      return state;
    } };
  }

  // extension/sidepanel/src/store.js
  var STATE_KEY = "voiceState";
  var RESUME_HANDLE_KEY = "voiceResumeHandle";
  var _store = {
    connection: "disconnected",
    recording: false,
    speaking: false,
    micActivity: false,
    backgroundMode: false,
    error: null,
    transcript: [],
    // True when chrome.storage holds a session-resumption handle from a
    // prior offscreen instance. Drives the "Resume" vs "Start" button
    // label so the user knows the conversation will pick up where it
    // left off.
    hasResumeHandle: false
  };
  var _listeners = /* @__PURE__ */ new Set();
  function get() {
    return { ..._store, transcript: _store.transcript.slice() };
  }
  function subscribe(fn) {
    _listeners.add(fn);
    try {
      fn(get());
    } catch {
    }
    return () => _listeners.delete(fn);
  }
  function _emit() {
    const snap = get();
    for (const fn of _listeners) {
      try {
        fn(snap);
      } catch {
      }
    }
  }
  async function hydrate() {
    const data = await chrome.storage.local.get([STATE_KEY, RESUME_HANDLE_KEY]);
    const s = data[STATE_KEY];
    _store.hasResumeHandle = !!data[RESUME_HANDLE_KEY];
    if (s) {
      _store.connection = s.connection || "disconnected";
      _store.recording = !!s.recording;
      _store.speaking = !!s.speaking;
      _store.backgroundMode = !!s.backgroundMode;
      _store.error = s.error || null;
      _store.transcript = Array.isArray(s.transcript) ? s.transcript.slice() : [];
    }
    _emit();
  }
  function installListener() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "voiceState" && msg.state) {
        Object.assign(_store, msg.state);
        _emit();
        return;
      }
      if (msg.type === "voiceTranscript" && msg.delta) {
        _appendTranscript(msg.delta);
        _emit();
        return;
      }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (RESUME_HANDLE_KEY in changes) {
        _store.hasResumeHandle = !!changes[RESUME_HANDLE_KEY].newValue;
        _emit();
      }
      if (STATE_KEY in changes) {
        const s = changes[STATE_KEY].newValue;
        if (s) {
          const differs = s.connection !== _store.connection || !!s.recording !== _store.recording || !!s.speaking !== _store.speaking || !!s.backgroundMode !== _store.backgroundMode || (s.error || null) !== _store.error || Array.isArray(s.transcript) && _transcriptDiffers(s.transcript, _store.transcript);
          _store.connection = s.connection || "disconnected";
          _store.recording = !!s.recording;
          _store.speaking = !!s.speaking;
          _store.backgroundMode = !!s.backgroundMode;
          _store.error = s.error || null;
          if (Array.isArray(s.transcript)) _store.transcript = s.transcript.slice();
          if (differs) _emit();
        }
      }
    });
  }
  function _transcriptDiffers(a, b) {
    if (a.length !== b.length) return true;
    if (!a.length) return false;
    const x = a[a.length - 1], y = b[b.length - 1];
    return x.ts !== y.ts || x.text !== y.text || x.role !== y.role;
  }
  function _appendTranscript({ role, text, finished, details, ts, tool, ok, undoable, actionId }) {
    if (role === "event") {
      _store.transcript.push({
        role,
        text,
        details: Array.isArray(details) ? details : [],
        ts: ts || Date.now()
      });
      return;
    }
    if (role === "action") {
      _store.transcript.push({
        role,
        text,
        tool: tool || null,
        ok: ok !== false,
        undoable: !!undoable,
        actionId: actionId || null,
        ts: ts || Date.now()
      });
      return;
    }
    const last = _store.transcript[_store.transcript.length - 1];
    if (last && last.role === role && last.partial) {
      if (text.startsWith(last.text) && text.length >= last.text.length) {
        last.text = text;
      } else {
        last.text += text;
      }
      if (finished) last.partial = false;
    } else {
      _store.transcript.push({ role, text, ts: ts || Date.now(), partial: !finished });
    }
  }

  // extension/sidepanel/src/ui/transcript.js
  var _openDetails = /* @__PURE__ */ new Set();
  function mountTranscript(rootEl, emptyEl, { onUndo } = {}) {
    function render(snap) {
      const list = snap.transcript || [];
      const last = list[list.length - 1];
      const hasUserPartial = last && last.role === "user" && last.partial;
      const showListening = !!snap.micActivity && !hasUserPartial;
      if (!list.length && !showListening) {
        emptyEl.hidden = false;
        rootEl.innerHTML = "";
        return;
      }
      emptyEl.hidden = true;
      let newestUndoable = null;
      if (snap.connection === "live" && !snap.undoInFlight) {
        for (let i = list.length - 1; i >= 0; i--) {
          const e = list[i];
          if (e.role === "action" && e.undoable && e.ok) {
            newestUndoable = e;
            break;
          }
          if (e.role === "action" && e.tool === "undo_last_change") break;
        }
      }
      const scroller = rootEl.parentElement;
      const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;
      const frag = document.createDocumentFragment();
      for (const entry of list) {
        frag.appendChild(_renderEntry(entry, { canUndo: entry === newestUndoable, onUndo }));
      }
      if (showListening) {
        frag.appendChild(_renderListeningPlaceholder());
      }
      rootEl.replaceChildren(frag);
      if (atBottom) scroller.scrollTop = scroller.scrollHeight;
    }
    return { render };
  }
  function _renderListeningPlaceholder() {
    const li = document.createElement("li");
    li.className = "vp-msg vp-msg-user vp-msg-listening";
    const icon = document.createElement("span");
    icon.className = "vp-listening-icon";
    icon.textContent = "\u{1F3A4}";
    const text = document.createElement("span");
    text.textContent = " Listening\u2026";
    li.appendChild(icon);
    li.appendChild(text);
    return li;
  }
  function _renderEntry(entry, opts = {}) {
    if (entry.role === "event") return _renderEventBubble(entry);
    if (entry.role === "action") return _renderActionChip(entry, opts);
    return _renderSpeechBubble(entry);
  }
  function _renderActionChip(entry, { canUndo, onUndo } = {}) {
    const li = document.createElement("li");
    li.className = "vp-msg vp-msg-action" + (entry.ok ? "" : " vp-msg-action-failed");
    const icon = document.createElement("span");
    icon.className = "vp-action-icon";
    icon.textContent = entry.ok ? "\u2713" : "\u26A0";
    icon.setAttribute("aria-hidden", "true");
    li.appendChild(icon);
    const text = document.createElement("span");
    text.className = "vp-action-text";
    text.textContent = entry.text || "(action)";
    li.appendChild(text);
    if (canUndo && typeof onUndo === "function") {
      const btn = document.createElement("button");
      btn.className = "vp-btn vp-undo-btn";
      btn.textContent = "Undo";
      btn.setAttribute("aria-label", `Undo: ${entry.text || "last change"}`);
      btn.addEventListener("click", () => {
        btn.disabled = true;
        onUndo(entry);
      });
      li.appendChild(btn);
    }
    li.appendChild(_timeEl(entry.ts));
    return li;
  }
  function _renderSpeechBubble(entry) {
    const li = document.createElement("li");
    li.className = `vp-msg vp-msg-${entry.role}` + (entry.partial ? " vp-msg-partial" : "");
    li.textContent = entry.text;
    li.appendChild(_timeEl(entry.ts));
    return li;
  }
  function _renderEventBubble(entry) {
    const li = document.createElement("li");
    li.className = "vp-msg vp-msg-event";
    const det = document.createElement("details");
    det.open = _openDetails.has(entry.ts);
    det.addEventListener("toggle", () => {
      if (det.open) _openDetails.add(entry.ts);
      else _openDetails.delete(entry.ts);
    });
    const summary = document.createElement("summary");
    summary.className = "vp-event-summary";
    const icon = document.createElement("span");
    icon.className = "vp-event-icon";
    icon.textContent = "\u{1F310}";
    summary.appendChild(icon);
    const title = document.createElement("span");
    title.className = "vp-event-title";
    title.textContent = entry.text || "(event)";
    summary.appendChild(title);
    det.appendChild(summary);
    if (entry.details && entry.details.length) {
      const ul = document.createElement("ul");
      ul.className = "vp-event-details";
      for (const row of entry.details) {
        const item = document.createElement("li");
        item.className = "vp-event-row";
        const tag = document.createElement("span");
        tag.className = "vp-event-tag";
        tag.textContent = row.action || row.sub || row.kind || "\xB7";
        const txt = document.createElement("span");
        txt.className = "vp-event-text";
        txt.textContent = row.text || "";
        item.appendChild(tag);
        item.appendChild(txt);
        ul.appendChild(item);
      }
      det.appendChild(ul);
    }
    li.appendChild(det);
    li.appendChild(_timeEl(entry.ts));
    return li;
  }
  function _timeEl(ts) {
    const t = document.createElement("span");
    t.className = "vp-msg-time";
    t.textContent = _fmtTime(ts);
    return t;
  }
  function _fmtTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  // extension/sidepanel/src/ui/status.js
  function mountStatus(statusEl, errorEl) {
    function render(snap) {
      statusEl.className = `vp-status ${snap.connection || "disconnected"}`;
      statusEl.textContent = snap.connection || "disconnected";
      if (snap.error) {
        errorEl.hidden = false;
        errorEl.textContent = snap.error;
      } else {
        errorEl.hidden = true;
        errorEl.textContent = "";
      }
    }
    return { render };
  }

  // extension/sidepanel/src/ui/controls.js
  function mountControls({
    startBtn,
    micBtn,
    endBtn,
    restartBtn,
    bgWrapper,
    bgToggle,
    textForm,
    onStart,
    onEnd,
    onRestart,
    onMicToggle,
    onBackgroundChange
  }) {
    startBtn.addEventListener("click", () => onStart());
    endBtn.addEventListener("click", () => onEnd());
    restartBtn.addEventListener("click", () => onRestart());
    micBtn.addEventListener("click", () => onMicToggle());
    bgToggle.addEventListener("change", (e) => onBackgroundChange(!!e.target.checked));
    function render(snap) {
      const live = snap.connection === "live" || snap.connection === "connecting";
      if (textForm) {
        textForm.hidden = snap.connection !== "live";
      }
      const showRestart = live || !live && !!snap.hasResumeHandle;
      startBtn.hidden = live;
      micBtn.hidden = !live;
      endBtn.hidden = !live;
      restartBtn.hidden = !showRestart;
      bgWrapper.hidden = !live;
      const connecting = snap.connection === "connecting";
      restartBtn.disabled = connecting;
      micBtn.disabled = connecting;
      if (live) {
        micBtn.classList.toggle("muted", !snap.recording);
        micBtn.title = snap.recording ? "Mute mic" : "Unmute mic";
        bgToggle.checked = !!snap.backgroundMode;
      }
      if (connecting) {
        startBtn.textContent = snap.hasResumeHandle ? "Resuming\u2026" : "Connecting\u2026";
        startBtn.disabled = true;
      } else {
        startBtn.textContent = snap.hasResumeHandle ? "Resume" : "Start";
        startBtn.disabled = false;
      }
    }
    return { render };
  }

  // extension/sidepanel/src/index.js
  var $ = (id) => document.getElementById(id);
  async function main() {
    chrome.runtime.connect({ name: "voice-ui" });
    await hydrate();
    installListener();
    let undoInFlight = false;
    let undoTimer = null;
    const transcript = mountTranscript($("vp-transcript"), $("vp-empty"), {
      onUndo: async () => {
        if (undoInFlight) return;
        undoInFlight = true;
        transcript.render({ ...get(), undoInFlight });
        if (undoTimer) clearTimeout(undoTimer);
        undoTimer = setTimeout(() => {
          undoInFlight = false;
          transcript.render({ ...get(), undoInFlight });
        }, 8e3);
        await send({ type: "voiceUndoLast" });
      }
    });
    const status = mountStatus($("vp-status"), $("vp-error"));
    const controls = mountControls({
      startBtn: $("vp-start"),
      micBtn: $("vp-mic"),
      endBtn: $("vp-end"),
      restartBtn: $("vp-restart"),
      bgWrapper: $("vp-bg-wrapper"),
      bgToggle: $("vp-bg-toggle"),
      textForm: $("vp-text-form"),
      onStart: handleStart,
      onEnd: handleEnd,
      onRestart: handleRestart,
      onMicToggle: handleMicToggle,
      onBackgroundChange: handleBackgroundChange
    });
    const textForm = $("vp-text-form");
    const textInput = $("vp-text-input");
    textForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = textInput.value.trim();
      if (!text) return;
      textInput.value = "";
      const resp = await send({ type: "voiceTextTurn", text });
      if (resp && resp.error) await _writeError(`Send failed: ${resp.error}`);
    });
    const proposalPill = $("vp-proposals");
    async function refreshProposalPill() {
      const resp = await send({ type: "librarianListProposals", status: "pending" });
      const n = resp && resp.proposals && resp.proposals.length || 0;
      proposalPill.hidden = n === 0;
      proposalPill.textContent = n === 1 ? "1 suggestion" : `${n} suggestions`;
    }
    proposalPill.addEventListener("click", async () => {
      if (get().connection === "live") {
        await send({ type: "voiceTextTurn", text: "What suggestions are waiting for me?" });
      }
    });
    refreshProposalPill();
    setInterval(refreshProposalPill, 6e4);
    const micSettingsBtn = $("vp-open-mic-settings");
    micSettingsBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: "chrome://settings/content/microphone" });
    });
    let _lastMemoryActionId = null;
    let _lastUndoActionId = null;
    subscribe((snap) => {
      const newestAction = [...snap.transcript].reverse().find((e) => e.role === "action");
      if (undoInFlight && newestAction && newestAction.tool === "undo_last_change" && newestAction.actionId !== _lastUndoActionId) {
        _lastUndoActionId = newestAction.actionId;
        undoInFlight = false;
        if (undoTimer) {
          clearTimeout(undoTimer);
          undoTimer = null;
        }
      }
      transcript.render({ ...snap, undoInFlight });
      status.render(snap);
      controls.render(snap);
      const showMic = !!snap.error && /micropho|mic settings/i.test(snap.error);
      micSettingsBtn.hidden = !showMic;
      const memoryTools = /* @__PURE__ */ new Set(["respond_to_proposal", "forget_memory", "remember"]);
      for (let i = snap.transcript.length - 1; i >= 0; i--) {
        const e = snap.transcript[i];
        if (e.role !== "action") continue;
        if (memoryTools.has(e.tool) && e.actionId !== _lastMemoryActionId) {
          _lastMemoryActionId = e.actionId;
          refreshProposalPill();
        }
        break;
      }
    });
  }
  async function handleStart() {
    const micResult = await _ensureMicPermission();
    if (!micResult.granted) {
      await _writeError(micResult.message);
      return;
    }
    const ensureResp = await send({ type: "voiceEnsure" });
    if (ensureResp && ensureResp.error) {
      await _writeError(`Offscreen create failed: ${ensureResp.error}`);
      return;
    }
    const ready = await _waitForOffscreenReady(5e3);
    if (!ready) {
      await _writeError("Voice engine did not start. Try clicking Start again.");
      return;
    }
    const connectResp = await send({ type: "voiceConnect" });
    if (connectResp && connectResp.error) {
      console.error("[sidepanel] voiceConnect failed:", connectResp.error, connectResp.stack || "");
      await _writeError(`Connect failed: ${connectResp.error}`);
    }
  }
  async function _ensureMicPermission() {
    try {
      const perm = await navigator.permissions.query({ name: "microphone" });
      if (perm && perm.state === "granted") return { granted: true };
    } catch {
    }
    const result = await _requestMicViaPopup();
    if (result.granted) return result;
    if (result.errorName === "CancelledByUser") {
      return {
        granted: false,
        message: "Microphone permission window closed. Click Start again to retry."
      };
    }
    let priorDenial = false;
    try {
      const perm = await navigator.permissions.query({ name: "microphone" });
      priorDenial = perm.state === "denied";
    } catch {
    }
    const name = result.errorName || "";
    let message;
    if (priorDenial || name === "NotAllowedError" || name === "SecurityError") {
      message = "Microphone access is blocked for this extension. Open mic settings below, find this extension, set it to Allow, then click Start again.";
    } else if (name === "NotFoundError" || name === "OverconstrainedError") {
      message = "No microphone found. Plug one in and try again.";
    } else if (name === "NotReadableError") {
      message = "Microphone is in use by another app. Close it and try again.";
    } else if (name === "TimeoutError") {
      message = "Permission iframe did not respond. Reload the extension and try again.";
    } else {
      message = `Microphone access failed: ${result.errorMessage || name || "unknown error"}`;
    }
    return { granted: false, message, showSettings: true };
  }
  function _requestMicViaPopup() {
    return new Promise((resolve) => {
      let resolved = false;
      let popupWinId = null;
      const safeResolve = (val) => {
        if (resolved) return;
        resolved = true;
        chrome.runtime.onMessage.removeListener(onMessage);
        chrome.windows.onRemoved.removeListener(onWinClosed);
        clearTimeout(timer);
        resolve(val);
      };
      const onMessage = (msg) => {
        if (!msg || msg.type !== "micPermissionResult") return;
        safeResolve({
          granted: !!msg.granted,
          errorName: msg.errorName,
          errorMessage: msg.errorMessage
        });
      };
      const onWinClosed = (winId) => {
        if (popupWinId != null && winId === popupWinId) {
          safeResolve({ granted: false, errorName: "CancelledByUser" });
        }
      };
      chrome.runtime.onMessage.addListener(onMessage);
      chrome.windows.onRemoved.addListener(onWinClosed);
      chrome.windows.create({
        url: chrome.runtime.getURL("permission/permission.html"),
        type: "popup",
        width: 460,
        height: 280
      }, (win) => {
        if (chrome.runtime.lastError || !win) {
          safeResolve({
            granted: false,
            errorName: "PopupOpenError",
            errorMessage: chrome.runtime.lastError?.message || "could not open permission window"
          });
          return;
        }
        popupWinId = win.id;
      });
      const timer = setTimeout(() => {
        safeResolve({ granted: false, errorName: "TimeoutError" });
      }, 12e4);
    });
  }
  async function _waitForOffscreenReady(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const resp = await send({ type: "voicePing" });
      if (resp && resp.ok) return true;
      await wait(150);
    }
    return false;
  }
  async function _writeError(text) {
    await chrome.storage.local.set({
      voiceState: {
        ...(await chrome.storage.local.get("voiceState")).voiceState,
        connection: "error",
        error: text
      }
    });
  }
  async function handleEnd() {
    await send({ type: "voiceTeardown" });
  }
  async function handleRestart() {
    const snap = get();
    if (snap.connection === "live" || snap.connection === "connecting") {
      await send({ type: "voiceRestart" });
      return;
    }
    const micResult = await _ensureMicPermission();
    if (!micResult.granted) {
      await _writeError(micResult.message);
      return;
    }
    const ensureResp = await send({ type: "voiceEnsure" });
    if (ensureResp && ensureResp.error) {
      await _writeError(`Offscreen create failed: ${ensureResp.error}`);
      return;
    }
    const ready = await _waitForOffscreenReady(5e3);
    if (!ready) {
      await _writeError("Voice engine did not start. Try clicking Restart again.");
      return;
    }
    const restartResp = await send({ type: "voiceRestart" });
    if (restartResp && restartResp.error) {
      console.error("[sidepanel] voiceRestart failed:", restartResp.error, restartResp.stack || "");
      await _writeError(`Restart failed: ${restartResp.error}`);
    }
  }
  async function handleMicToggle() {
    await send({ type: "voiceMicToggle" });
  }
  async function handleBackgroundChange(enabled) {
    await send({ type: "voiceBackgroundMode", enabled });
  }
  function send(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (resp) => {
        const _ = chrome.runtime.lastError;
        resolve(resp || {});
      });
    });
  }
  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  main().catch((e) => {
    console.error("[sidepanel] init failed", e);
  });
  var vaRoot = document.getElementById("va-panel");
  if (vaRoot) {
    mountValidationPanel(vaRoot, {
      onControl: (c) => {
        if (c.action === "start") {
          chrome.runtime.sendMessage({ type: "validationStart", contract: c.said });
          return;
        }
        if (c.action === "retry") {
          chrome.runtime.sendMessage({ type: "bhAgentStart", task: c.task, tabId: c.tabId });
          return;
        }
        if (c.action === "answer") {
          chrome.runtime.sendMessage({
            type: "validationAnswer",
            widget: c.widget,
            response: c.response,
            kind: c.kind,
            choiceId: c.choiceId,
            taskId: c.taskId,
            decisionKey: c.decisionKey
          });
          return;
        }
        if (c.action === "on-request") {
          chrome.runtime.sendMessage({ type: "validationOnRequest" }, (r) => {
            for (const i of r?.items || []) console.log("[also checked]", i.say);
          });
          return;
        }
        if (c.action === "ask") {
          chrome.runtime.sendMessage({ type: "validationAsk", question: c.question });
          return;
        }
        if (c.action === "ack") {
          chrome.runtime.sendMessage({ type: "validationAck", key: c.key });
          return;
        }
        if (c.action === "why") {
          chrome.runtime.sendMessage({ type: "validationWhy", nodeId: c.nodeId });
          return;
        }
        if ((c.action === "edit-ask" || c.action === "fill-gap") && c.inline && c.field && c.value?.trim()) {
          chrome.runtime.sendMessage({ type: "validationEdit", field: c.field, value: c.value.trim() });
          return;
        }
        if (c.action === "edit-ask" || c.action === "fill-gap") {
          const field = c.field || window.prompt(
            "Which part? (buying, must have, size, budget, how many, needed by)"
          );
          if (!field) return;
          const value = window.prompt(field === "request" ? "Update your request:" : `New value for ${field}:`, c.value || "");
          if (value == null || !value.trim()) return;
          chrome.runtime.sendMessage({ type: "validationEdit", field, value: value.trim() });
          return;
        }
        chrome.runtime.sendMessage({ type: "validationControl", control: c });
      }
    });
  }
})();
