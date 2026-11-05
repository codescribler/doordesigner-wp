// A/B journey milestones read from funnel steps, and the device sent on expose.
// `node tests/js/milestones.test.js`
var assert = require('assert');
var store = {};
global.window = {
  location: { search: '' }, HD_DD_CONFIG: {},
  localStorage: { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } }
};
var F = require('../../assets/js/wizard/funnel.js');
var E = require('../../assets/js/experiment.js');

function flush() { return new Promise(function (r) { setTimeout(r, 0); }); }

(async function () {
  // Mapping: classic, Swipe 2, Designer 3.
  assert.strictEqual(F.milestoneFor('door-designer', 'opened'), '');
  assert.strictEqual(F.milestoneFor('door-designer', 'type'), 'started');
  assert.strictEqual(F.milestoneFor('door-designer', 'hinge'), 'started');
  assert.strictEqual(F.milestoneFor('door-designer', 'review'), 'shown');
  assert.strictEqual(F.milestoneFor('door-designer', 'details'), 'form');
  assert.strictEqual(F.milestoneFor('door-designer-v3', 'browsed'), '');
  assert.strictEqual(F.milestoneFor('door-designer-v3', 'review'), 'shown');
  assert.strictEqual(F.milestoneFor('door-designer-v4', 'style'), 'started');
  assert.strictEqual(F.milestoneFor('door-designer-v4', 'shown'), 'shown');
  assert.strictEqual(F.milestoneFor('door-designer-v4', 'quoteform'), 'form');
  assert.strictEqual(F.milestoneFor('somewhere-else', 'type'), '');

  // Not attached: nothing is sent and nothing throws.
  F.step('type', 'Front Door');

  // Attached: each milestone once, only after `ready`, through either reporter.
  var sent = [];
  var release;
  var ready = new Promise(function (r) { release = r; });
  F.attach(function (m) { sent.push(m); return Promise.resolve({ ok: true }); }, ready);
  F.step('type', 'Front Door');            // the classic module-level reporter
  F.step('hinge', 'Left');
  await flush();
  assert.deepStrictEqual(sent, [], 'held until the expose has landed');
  release(true);
  await flush();
  assert.deepStrictEqual(sent, ['started'], 'started sent once');
  F.step('review');
  F.step('review');
  F.step('details');
  await flush();
  assert.deepStrictEqual(sent, ['started', 'shown', 'form']);

  var d3 = F.create('door-designer-v4', F.ORDER_V4);
  sent = [];
  F.attach(function (m) { sent.push(m); return Promise.reject(new Error('offline')); }, Promise.reject(new Error('expose failed')));
  d3.step('opened');
  d3.step('type', 'Front Door');
  d3.step('shown');
  d3.step('quoteform');
  await flush(); await flush();
  assert.deepStrictEqual(sent, ['started', 'shown', 'form'], 'a failed expose or send still never throws');

  // Detached (forced flow, return link): nothing.
  F.attach(null, null);
  sent = [];
  d3.step('type', 'Back Door');
  await flush();
  assert.deepStrictEqual(sent, []);

  // Muted (?notrack=1 remembered): nothing.
  F.attach(function (m) { sent.push(m); }, null);
  store.hd_dd_notrack = '1';
  d3.step('type', 'Back Door');
  await flush();
  assert.deepStrictEqual(sent, [], 'muted visits send no milestones');
  delete store.hd_dd_notrack;

  // Device kind.
  assert.strictEqual(E.deviceKind({ innerWidth: 390, screen: { width: 390 } }), 'phone');
  assert.strictEqual(E.deviceKind({ innerWidth: 1280, screen: { width: 1920 } }), 'desktop');
  assert.strictEqual(E.deviceKind({ innerWidth: 700, screen: { width: 1920 } }), 'phone', 'a narrow window counts as a phone layout');
  assert.strictEqual(E.deviceKind({}), '');

  // Expose carries the device.
  var bodies = [];
  var api = function (path, opts) { bodies.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, body: { ok: true } }); };
  var a = { counted: true, exposed: false, experimentId: 'exp_20261105_abcdef', visitorId: 'a'.repeat(32), arm: 'challenger' };
  await E.expose(api, a, { storage: null, window: { innerWidth: 400, screen: { width: 400 } } });
  assert.strictEqual(bodies[0].device, 'phone');
  assert.strictEqual(bodies[0].arm, 'challenger');

  console.log('milestones ok');
})().catch(function (e) { console.error(e); process.exit(1); });
