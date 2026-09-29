// Page evidence for verification: rendered sentences, additional accessible
// names, actual form states, and source links. The extension's own UI is
// excluded so its findings cannot become evidence for themselves.
// AX rendering lives in ax-render.js and is testable from saved captures.

import { bhCdp } from './lifecycle.js';
import { bhRenderAx } from './ax-render.js';

const AX_TIMEOUT_MS = 8000;
const OWN_UI = '[data-bh-ignore],[data-ai4a11y-ui],#ai4a11y-agent-watch,#ai4a11y-announcer';

/**
 * Fetch the full accessibility tree for a tab.
 * @returns {Promise<Array<Object>>} raw AX nodes, or [] if unavailable.
 */
export async function bhAxTree(tabId) {
  try {
    await bhCdp(tabId, 'Accessibility.enable', {}, { timeoutMs: 2000 });
  } catch {
    // Already enabled, or the domain is unavailable on this target. Either way
    // getFullAXTree below is still worth attempting.
  }
  try {
    const r = await bhCdp(tabId, 'Accessibility.getFullAXTree', {},
                          { timeoutMs: AX_TIMEOUT_MS });
    return (r && r.nodes) || [];
  } catch {
    return [];
  }
}

/**
 * Read a tab's accessibility tree and render it. This is the call the
 * validation layer's reader consumes.
 *
 * @returns {Promise<{url: string|null, text: string, nodeCount: number}>}
 */
export async function bhAxSnapshot(tabId, opts = {}) {
  const nodes = await bhAxTree(tabId);
  // The extension's own findings are not independent website evidence. Leave
  // its overlay accessible to the person, but exclude that subtree from this
  // read so an announcement cannot verify itself or change the page hash.
  const excluded = new Set(opts.excludeBackendNodeIds || []);
  for (const id of ['ai4a11y-agent-watch', 'ai4a11y-announcer']) {
    const overlay = await bhCdp(tabId, 'Runtime.evaluate', {
      expression: `document.getElementById(${JSON.stringify(id)})`, objectGroup: 'verification-ui',
    }, { timeoutMs: 1500 });
    const objectId = overlay?.result?.objectId;
    if (objectId) {
      try {
        const result = await bhCdp(tabId, 'DOM.describeNode', { objectId }, { timeoutMs: 1500 });
        if (result.node?.backendNodeId) excluded.add(result.node.backendNodeId);
      } finally {
        try { await bhCdp(tabId, 'Runtime.releaseObject', { objectId }, { timeoutMs: 1500 }); } catch {}
      }
    }
  }
  let url = opts.url || null;
  if (!url) {
    try {
      const info = await bhCdp(tabId, 'Runtime.evaluate',
        { expression: 'location.href', returnByValue: true },
        { timeoutMs: 1500 });
      url = info?.result?.value || null;
    } catch { /* url is a convenience, not a requirement */ }
  }
  const semantics = await bhCdp(tabId, 'Runtime.evaluate', {
    expression: `(() => {
      const ownUI=${JSON.stringify(OWN_UI)};
      const read=e=>{
        if(!e || e.matches(ownUI))return '';
        const style=getComputedStyle(e);
        if(style.display==='none' || style.visibility==='hidden')return '';
        if(!e.querySelector(ownUI))return e.innerText || '';
        return [...e.childNodes].map(n=>n.nodeType===3?n.textContent:n.nodeType===1?read(n):'').filter(text=>text.trim()).join('\\n');
      };
      const body=read(document.body).trim(), primary=read(document.querySelector('main,[role="main"]')).trim();
      const readable=primary && body.includes(primary)
        ? primary+'\\n\\nOther page content:\\n'+body.replace(primary,'').trim() : body;
      return JSON.stringify({readable,links:[...document.querySelectorAll('a[href]')]
        .filter(e=>!e.closest(ownUI) && e.getClientRects().length && /^https?:/.test(e.href))
        .slice(0,500).map(e=>({label:e.getAttribute('aria-label') || e.title || e.innerText,href:e.href})),
      controls: [...document.querySelectorAll('input,select,textarea,button')]
      .filter(e => !e.closest(ownUI) && e.getClientRects().length)
      .slice(0,160).map(e => ({tag:e.tagName.toLowerCase(),id:e.id,name:e.name,type:e.type,
        label: e.getAttribute('aria-label') || [...(e.labels || [])].map(l=>l.textContent.trim()).join(' ') || e.textContent.trim().slice(0,180),
        value: e.type === 'password' || e.type === 'file' ? null : e.value,
        checked: e.type === 'checkbox' || e.type === 'radio' ? e.checked : null,
        disabled:e.disabled,required:e.required,
        options:e.options ? [...e.options].map(o=>({text:o.text,value:o.value,selected:o.selected,disabled:o.disabled})).slice(0,60):null,
        form:e.form ? {id:e.form.id,action:e.form.action,method:e.form.method}:null})),
      visualNeeded: !!document.querySelector('canvas,[role="img"]:not(img)')});})()`, returnByValue: true,
  }, { timeoutMs: 2000 }).catch(() => null);
  let dom = { controls: [], visualNeeded: false };
  try { if (semantics?.result?.value) dom = JSON.parse(semantics.result.value); } catch {}
  const text = bhRenderAx(nodes, { ...opts, url, excludeBackendNodeIds: excluded });
  // AX trees split sentences into many nodes and often repeat a label on a
  // parent and its children. That overhead was cutting MDN's actual button
  // instructions out of the page guard. Preserve rendered sentences first,
  // plus accessible names absent from them and the actual form states.
  let evidence = text;
  if (dom.readable?.trim()) {
    const normalize = s => String(s).replace(/\s+/g, ' ').trim();
    const rendered = normalize(dom.readable), seen = new Set();
    const names = [];
    const excludedNodes = new Set();
    const byId = new Map(nodes.map(n => [n.nodeId,n]));
    const excludeTree = n => {if (!n || excludedNodes.has(n.nodeId)) return; excludedNodes.add(n.nodeId);for(const id of n.childIds||[])excludeTree(byId.get(id));};
    for(const n of nodes)if(excluded.has(n.backendDOMNodeId))excludeTree(n);
    for(const n of nodes) {
      const name = n.name?.value, norm = normalize(name || '');
      if(n.ignored || excludedNodes.has(n.nodeId) || !norm || seen.has(norm) || rendered.includes(norm))continue;
      seen.add(norm);names.push(`${n.role?.value || 'element'} ${JSON.stringify(name)}`);
    }
    evidence = `URL: ${url || ''}\n\nRENDERED PAGE TEXT:\n${dom.readable}`
      + (names.length ? '\n\nADDITIONAL ACCESSIBLE NAMES:\n'+names.join('\n') : '');
  }
  return { url, text: evidence + (dom.controls.length ? '\nFORM CONTROLS:\n' + JSON.stringify(dom.controls) : ''),
    axChars: text.length, readableChars: dom.readable?.length || 0,
    controls: dom.controls, links: dom.links || [], visualNeeded: dom.visualNeeded || nodes.length < 8, nodeCount: nodes.length };
}

export async function bhVerificationScreenshot(tabId) {
  const { bhCaptureScreenshot } = await import('./screenshot.js');
  const expression = `(() => {const s=document.createElement('style');s.id='verification-capture-mask';s.textContent='${OWN_UI}{visibility:hidden!important}';document.documentElement.append(s)})()`;
  await bhCdp(tabId, 'Runtime.evaluate', { expression });
  try { return await bhCaptureScreenshot(tabId, { maxDim: 1600, attempts: 1 }); }
  finally { await bhCdp(tabId, 'Runtime.evaluate', { expression: "document.getElementById('verification-capture-mask')?.remove()" }).catch(() => {}); }
}

// Read and activation share one descriptor so destinations and form overrides
// cannot change between approval and a click while preserving its label.
const targetDetails = `function(e) {
  const ownUI=${JSON.stringify(OWN_UI)};
  if(!e?.isConnected || !e.closest || e.closest(ownUI))return null;
  const identities=globalThis.__bhVerificationFieldIdentities ||= {files:new WeakMap(),secrets:new WeakMap()};
  const identity=(map,key,value)=>{
    let prior=map.get(key);
    if(!prior || prior.value!==value) {prior={value,token:crypto.randomUUID()};map.set(key,prior)}
    return prior.token;
  };
  const valueOf=n=>n.type==='file'
    ? [...n.files].map(f=>({name:f.name,size:f.size,type:f.type,lastModified:f.lastModified,
        identity:identity(identities.files,f,f)}))
    : ['password','hidden'].includes(n.type)
      ? {masked:true,identity:identity(identities.secrets,n,n.value)} : n.value;
  const doc=e.ownerDocument, body=doc.body?.cloneNode(true);
  body?.querySelectorAll(ownUI+',script,style,noscript').forEach(n=>n.remove());
  const pageState=JSON.stringify([body?.textContent, [...doc.querySelectorAll('input,select,textarea')]
    .filter(n=>!n.closest(ownUI))
    .map(n=>[n.id,n.name,n.type,valueOf(n),n.checked,n.disabled])]);
  const attachments=[...doc.querySelectorAll('input[type="file"]')].filter(n=>!n.closest(ownUI))
    .flatMap(n=>[...n.files].map(f=>({name:f.name,size:f.size,type:f.type})));
  return {pageState,attachments,tag:e.tagName,role:e.getAttribute('role'),type:e.type,id:e.id,name:e.name,
    label:e.getAttribute('aria-label') || [...(e.labels||[])].map(l=>l.textContent.trim()).join(' ') || e.textContent.trim().slice(0,240),
    value:['password','file','hidden'].includes(e.type)?null:e.value,checked:e.checked,disabled:e.disabled,
    href:e.href,formAction:e.formAction,formMethod:e.formMethod,formEnctype:e.formEnctype,
    formTarget:e.formTarget,formNoValidate:e.formNoValidate,documentUrl:e.ownerDocument.URL,
    form:e.form?{id:e.form.id,action:e.form.action,method:e.form.method,enctype:e.form.enctype,target:e.form.target}:null};
}`;

export async function bhDescribeActionTarget(tabId, action) {
  const r = await bhCdp(tabId, 'Runtime.evaluate', {
    expression: `(() => {const a=${JSON.stringify(action)};let e;
      if(Number.isInteger(a.index)) e=window.__bhInteractive?.[a.index];
      else if(a.selector) {try{e=document.querySelector(a.selector)}catch{}}
      else if(Number.isFinite(a.x)&&Number.isFinite(a.y)) e=document.elementFromPoint(a.x,a.y)?.closest('button,a,input,select,textarea,[role="button"]');
      else if(['type','press_key'].includes(a.action)) e=document.activeElement;
      return (${targetDetails})(e) ? e : null;})()` }, { timeoutMs: 2000 });
  const objectId = r?.result?.objectId;
  if (!objectId) return null;
  try {
    const node = await bhCdp(tabId, 'DOM.describeNode', { objectId });
    const details = await bhCdp(tabId, 'Runtime.callFunctionOn', { objectId,
      functionDeclaration: `function(){return (${targetDetails})(this)}`, returnByValue: true });
    return details?.result?.value ? { ...details.result.value, backendNodeId: node.node.backendNodeId } : null;
  } finally { await bhCdp(tabId, 'Runtime.releaseObject', { objectId }).catch(() => {}); }
}

// No snapping or stale-index recovery for reviewed clicks. The retained DOM
// node is checked and activated in the same page call. If a site requires a
// trusted physical click, failure is observed instead of clicking a substitute.
export async function bhActivateVerifiedTarget(tabId, binding, isCurrent) {
  const { backendNodeId, ...expected } = binding.target || {};
  if (!backendNodeId || !['click','click_index'].includes(binding.action.action)) throw new Error('Missing reviewed click target');
  const resolved = await bhCdp(tabId, 'DOM.resolveNode', { backendNodeId });
  const objectId = resolved.object?.objectId;
  if (!objectId) throw new Error('The reviewed control is no longer available');
  try {
    if (!isCurrent()) throw new Error('The reviewed action was superseded');
    const result = await bhCdp(tabId, 'Runtime.callFunctionOn', { objectId, returnByValue: true,
      arguments: [{ value: expected }], functionDeclaration: `function(expected) {
        const actual=(${targetDetails})(this);
        const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
          ?Object.fromEntries(Object.keys(v).filter(k=>v[k]!=null).sort().map(k=>[k,canonical(v[k])])):v;
        if(!actual || actual.disabled || !this.getClientRects().length || typeof this.click!=='function') return {performed:false,reason:'Control unavailable'};
        if(JSON.stringify(canonical(actual))!==JSON.stringify(canonical(expected))) return {performed:false,
          reason:'Changed fields: '+Object.keys(actual).filter(k=>JSON.stringify(canonical(actual[k]))!==JSON.stringify(canonical(expected[k]))).join(', ')};
        this.click(); return {performed:true};
      }` });
    if (result.exceptionDetails || result.result?.value?.performed !== true) throw new Error(
      `The reviewed control changed before the click (${result.exceptionDetails?.text || result.result?.value?.reason || 'Unavailable'})`);
    return result.result.value;
  } finally { await bhCdp(tabId, 'Runtime.releaseObject', { objectId }).catch(() => {}); }
}

export { bhRenderAx };
