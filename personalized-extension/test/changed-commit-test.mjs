// A purchase that is no longer what was chosen (a sold-out item swapped for another) is reported
// with quotes from both pages, and a change the reviewer cannot quote on both sides is dropped.
import assert from 'node:assert/strict';
import { reviewAction } from '../extension/validation/runtime.js';

const request = 'Buy a USB-C wall charger. The total has to be under $25.';
const cart = 'Shopping cart. Pebble Power 20W USB-C charger 2-pack. $19.99. Proceed to checkout';
const checkout = 'Review your order. Hanker 30W 2-port USB-C charger. $24.99. Order total: $27.33. Place your order';
const context = { request, page: checkout, action: { action: 'click_index', index: 4 },
  target: { backendNodeId: 7, tag: 'BUTTON', label: 'Place your order' }, pending: [],
  pages: [{ id: 'page:1:https://shop.fixture/cart', at: 1, url: 'https://shop.fixture/cart', text: cart }] };
const reply = { kind: 'commit', quote: 'Place your order', label: 'Buy Hanker 30W 2-port USB-C charger for $27.33',
  expected: 'Order placed.', reason: 'Places the order.', facts: [],
  requestCheck: { status: 'consistent', quote: 'Buy a USB-C wall charger.', reason: 'Buying is what was asked.' } };
const swap = { what: 'The charger', before: 'Pebble Power 20W USB-C charger 2-pack', beforeQuote: 'Pebble Power 20W USB-C charger 2-pack. $19.99',
  now: 'Hanker 30W 2-port USB-C charger', nowQuote: 'Hanker 30W 2-port USB-C charger. $24.99' };

let prompt = '';
const kept = await reviewAction(async p => { prompt = p; return JSON.stringify({ ...reply, changes: [swap] }); }, context);
assert.equal(kept.kind, 'commit');
assert.deepEqual(kept.changes, [swap]);
assert(prompt.includes('A site swapping a sold-out item for another one'), 'the reviewer is asked to compare with the earlier cart');
console.log('PASS a quoted swap is reported before the purchase');

const invented = { ...swap, before: 'Sparrowline 20W charger', beforeQuote: 'Sparrowline 20W charger. $15.99' };
const dropped = await reviewAction(async () => JSON.stringify({ ...reply, changes: [invented] }), context);
assert.equal(dropped.kind, 'commit');
assert.deepEqual(dropped.changes, [], 'a before-quote that no earlier page has is dropped');
const unquotedNow = await reviewAction(async () => JSON.stringify({ ...reply, changes: [{ ...swap, nowQuote: 'Hanker 45W charger' }] }), context);
assert.deepEqual(unquotedNow.changes, [], 'a now-quote that the current page lacks is dropped');
const same = await reviewAction(async () => JSON.stringify({ ...reply, changes: [{ ...swap, now: swap.before }] }), context);
assert.deepEqual(same.changes, [], 'nothing changed when before and now are the same');
console.log('PASS a change that is not quoted on both pages is dropped');

const none = await reviewAction(async () => JSON.stringify({ ...reply, changes: [] }), context);
assert.deepEqual(none.changes, []);
const older = await reviewAction(async () => JSON.stringify({ ...reply, changes: undefined }), context);
assert.deepEqual(older.changes, [], 'a reply without the field means no changes');
console.log('PASS an unchanged purchase has no changes');
