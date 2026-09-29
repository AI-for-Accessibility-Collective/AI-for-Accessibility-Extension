// Every offline test of the verification layer, one process each. None of them
// calls a model or opens a browser; the live audits are the audit:* scripts.
// Run: npm test (from personalized-extension/)
import { spawnSync } from 'node:child_process';

const TESTS = [
  'test/quick-model-test.mjs',
  'test/verifier-test.mjs',
  'test/reasoner-test.mjs',
  'test/widget-press-test.mjs',
  'test/hold-timeout-test.mjs',
  'test/pause-resume-test.mjs',
  'test/interrogate-ask-test.mjs',
  'test/trace-test.mjs',
  'test/hand-over-test.mjs',
  'test/watch-test.mjs',
  'test/probe-test.mjs',
  'test/control-instruction-test.mjs',
  'test/panel-test.mjs',
  'test/adopt-test.mjs',
  'test/utility-test.mjs',
  'test/wrapup-test.mjs',
  'test/stress-test.mjs',
  'test/stream-test.mjs',
  'test/speech-bundle-test.mjs',
  'test/blind-commit-test.mjs',
  'test/marginal-bundle-test.mjs',
  'test/experience-test.mjs',
  'test/surface-test.mjs',
  'test/variant-test.mjs',
  'test/speak-test.mjs',
  'test/execution-boundary-test.mjs',
  'test/hotel-workflow-test.mjs',
  'test/task-integration-test.mjs',
  'test/session-hydration-test.mjs',
  'test/task-entrypoints-test.mjs',
  'test/decision-test.mjs',
  'test/runtime-test.mjs',
  'test/long-horizon-test.mjs',
  'test/attention-test.mjs',
  'test/decision-quality-test.mjs',
  'test/input-acknowledgement-test.mjs',
  'test/completion-archive-test.mjs',
  'test/workflow-oracle-test.mjs',
  'test/planning-overlap-test.mjs',
  'test/progress-context-test.mjs'
];

let failed = 0, skipped = 0;
for (const test of TESTS) {
  const r = spawnSync(process.execPath, ['--no-warnings', test], { encoding: 'utf8', env: { ...process.env } });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const skip = /^SKIP /m.test(out);
  if (r.status !== 0) { failed++; console.log(`FAIL ${test}\n${out.split('\n').slice(-25).join('\n')}`); }
  else if (skip) { skipped++; console.log(`SKIP ${test}`); }
  else console.log(`PASS ${test}`);
}
console.log(`\n${TESTS.length - failed - skipped} passed, ${skipped} skipped, ${failed} failed`);
if (failed) process.exitCode = 1;
