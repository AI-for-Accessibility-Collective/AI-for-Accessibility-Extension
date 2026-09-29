import assert from 'node:assert/strict';

const KEY = 'aa.validation';
const MODEL_KEY = 'aa.validation.model';
const clone = value => structuredClone(value);
const model = taskId => ({ taskId, task: 'Book a hotel', request: 'Book a hotel',
  tree: { id: '0', label: 'Book a hotel', children: [{ id: '1', label: 'Review',
    questions: [{ question: 'Is the guest count correct?', moment: 'Now',
      cluster: 'facts', moneyMoving: false }] }] } });
const saved = () => ({ contract: { said: 'Book a hotel' },
  opts: { taskId: 'old-task', requireModel: true, request: 'Book a hotel' },
  modelState: { status: 'ready', taskId: 'old-task' }, modelSource: 'generated',
  holds: [{ widget: 'Guest count', ask: 'How many guests?', phase: 'Review' }],
  acknowledged: ['Guest count|Review|Two guests'], node: '1', nodeLabel: 'Review',
  phase: 'Review', activeNodes: ['1'], holder: 'person', handOverNode: '1',
  handOverAt: 1234, handOverTab: 7,
  progress: { '1': { id: '1', status: 'active', label: 'Review' } },
  evidencePages: [{ id: 'page:7:review', text: 'Two guests', url: 'https://fixture.test/review' }],
});
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
let imports = 0;
async function fresh({ session = saved(), savedModel = model('old-task') } = {}) {
  const store = { [KEY]: clone(session), [MODEL_KEY]: clone(savedModel) };
  const reads = [];
  const local = {
    async get(keys) {
      reads.push(keys);
      return Object.fromEntries([].concat(keys).map(key => [key, clone(store[key])]));
    },
    async set(values) { Object.assign(store, clone(values)); },
    async remove(keys) { for (const key of [].concat(keys)) delete store[key]; },
  };
  globalThis.chrome = { storage: { local, sync: { async get() { return {}; }, async set() {} } },
    runtime: { async sendMessage() {}, getURL: path => `https://extension.test/${path}` } };
  globalThis.BrowserAgent = { stop() {} };
  delete globalThis.Librarian;
  const url = new URL('../extension/validation/session.js', import.meta.url);
  url.searchParams.set('hydration-test', String(++imports));
  const { default: V } = await import(url);
  return { V, store, local, reads };
}

// Stop must win even when the first storage read already captured an old task.
{
  const { V, store, local } = await fresh();
  const read = deferred();
  const originalGet = local.get;
  let first = true;
  local.get = async keys => {
    if (keys === KEY && first) {
      first = false;
      const snapshot = await originalGet(keys);
      await read.promise;
      return snapshot;
    }
    return originalGet(keys);
  };
  const pending = V.ensureRunning();
  await V.stop();
  read.resolve();
  assert.equal(await pending, false);
  assert.equal(V.isRunning(), false);
  assert.equal(V.taskId(), null);
  assert.equal(store[KEY].contract, null);
  assert.equal(globalThis.ValidationTaskModel.loaded(), false);
}

// A caller arriving while Stop is still writing cannot restore its old record.
{
  const { V, local } = await fresh();
  const write = deferred();
  const reached = deferred();
  const originalSet = local.set;
  local.set = async values => {
    if (KEY in values) { reached.resolve(); await write.promise; }
    return originalSet(values);
  };
  const stopped = V.stop();
  await reached.promise;
  assert.equal(await V.ensureRunning(), false);
  assert.equal(V.isRunning(), false);
  write.resolve();
  await stopped;
}

// All callers wait for one complete restoration, including its model and holds.
{
  const { V, store, local, reads } = await fresh();
  const read = deferred();
  const reached = deferred();
  const originalGet = local.get;
  local.get = async keys => {
    const snapshot = await originalGet(keys);
    if (keys === MODEL_KEY) { reached.resolve(); await read.promise; }
    return snapshot;
  };
  const first = V.ensureRunning();
  await reached.promise;
  let secondResolved = false;
  const second = V.ensureRunning().then(result => { secondResolved = true; return result; });
  await Promise.resolve();
  assert.equal(V.isRunning(), false, 'a partially restored run must remain invisible');
  assert.equal(V.isTaskReady('old-task'), false);
  assert.equal(V.taskId(), null);
  assert.equal(secondResolved, false);
  read.resolve();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(reads.filter(key => key === KEY).length, 1);
  assert.equal(reads.filter(key => key === MODEL_KEY).length, 1);
  assert.equal(V.isTaskReady('old-task'), true);
  assert.equal(V.isTaskReady('another-task'), false);
  assert.equal(V.isTaskReady(''), false);
  assert.equal(V.summary().waiting, 1);
  assert.equal(V.summary().holds[0].widget, 'Guest count');
  assert.deepEqual(V.where(), { node: '1', label: 'Review', phase: 'Review' });
  assert.equal(V.status().holder, 'person');
  assert.equal(V.status().watching, true);
  await V.annotate({ test: 'restored' });
  assert.deepEqual(store[KEY].acknowledged, saved().acknowledged);
  assert.equal(store[KEY].progress['1'].status, 'active');
  assert.equal(store[KEY].evidencePages[0].text, 'Two guests');
  await V.stop();
  assert.equal(V.status().watching, false);
}

// A task-bound Watch press is also a first call after worker restart.
{
  const session = { ...saved(), holder: 'agent' };
  const { V, store } = await fresh({ session });
  const result = await V.watch({ taskId: 'old-task', tabId: 7, nodeId: '1', widget: 'Guest count',
    quote: 'Two guests', url: 'https://fixture.test/review' });
  assert.equal(result.watching, true, JSON.stringify(result));
  assert.equal(V.taskId(), 'old-task');
  assert.equal((await V.watches()).length, 1);
  await V.stop();
}

// Starting another task invalidates a model retrieval already in flight.
{
  const { V, local } = await fresh();
  const read = deferred();
  const reached = deferred();
  const originalGet = local.get;
  local.get = async keys => {
    const snapshot = await originalGet(keys);
    if (keys === MODEL_KEY) { reached.resolve(); await read.promise; }
    return snapshot;
  };
  const pending = V.ensureRunning();
  await reached.promise;
  await V.start('Find a library', { taskId: 'new-task', requireModel: true, request: 'Find a library' });
  globalThis.ValidationTaskModel.load(model('new-task'), 'generated');
  await V.setModelState({ status: 'ready', taskId: 'new-task' });
  read.resolve();
  assert.equal(await pending, false);
  assert.equal(V.taskId(), 'new-task');
  assert.equal(V.request(), 'Find a library');
  assert.equal(V.isTaskReady('new-task'), true);
  assert.equal(V.isTaskReady('old-task'), false);
  assert.equal(V.status().holder, 'agent');
  assert.equal(V.status().watching, false);
  assert.equal(V.summary().waiting, 0);
  await V.stop();
}

// Stop also wins after the session read, while its model is still restoring.
{
  const { V, local } = await fresh();
  const read = deferred();
  const reached = deferred();
  const originalGet = local.get;
  local.get = async keys => {
    const snapshot = await originalGet(keys);
    if (keys === MODEL_KEY) { reached.resolve(); await read.promise; }
    return snapshot;
  };
  const pending = V.ensureRunning();
  await reached.promise;
  await V.stop();
  read.resolve();
  assert.equal(await pending, false);
  assert.equal(V.isRunning(), false);
  assert.equal(globalThis.ValidationTaskModel.loaded(), false);
  assert.equal(V.status().watching, false);
}

// A missing model or one belonging to another task never becomes ready.
for (const savedModel of [null, model('another-task')]) {
  const session = saved();
  session.holder = 'agent';
  const { V, store } = await fresh({ session, savedModel });
  assert.equal(await V.ensureRunning(), true, 'the held session survives even if its model is unavailable');
  assert.equal(V.isTaskReady('old-task'), false);
  assert.equal(globalThis.ValidationTaskModel.loaded(), false);
  assert.equal((await V.beforeAction(7, 'click')).allowed, false);
  assert.equal(V.summary().waiting, 1);
  await V.annotate({ test: 'missing model' });
  assert.equal(store[KEY].modelState.status, 'failed');
  await V.stop();
}

// A pre-fix session that enabled runtime verification without requireModel
// must not revive into the legacy URL extractor after a worker restart.
{
  const session = { ...saved(), holder: 'agent',
    opts: { ...saved().opts, requireModel: false, runtimeVerification: true },
    modelState: { status: 'optional', taskId: 'old-task' } };
  const { V } = await fresh({ session, savedModel: null });
  assert.equal(await V.ensureRunning(), true);
  assert.equal((await V.observe(7)).skipped, 'task checks are not ready');
  await V.stop();
}

console.log('PASS session hydration: Stop and new tasks supersede restoration; concurrent callers wait for the bound model; holds and hand-over survive.');
