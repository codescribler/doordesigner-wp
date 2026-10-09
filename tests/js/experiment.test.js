// Plain-Node tests for HD_DD_Experiment — no framework: `node tests/js/experiment.test.js`.
var assert = require('assert');
var X = require('../../assets/js/experiment.js');

var DAY = 24 * 60 * 60 * 1000;
var NOW = Date.UTC(2026, 8, 28);
var EXP = { id: 'exp_20260928_abcdef', control: 'classic', challenger: 'swipe', percent: 50 };
var CFG = { 'default': 'classic', experiment: EXP };
var HEX32 = /^[a-f0-9]{32}$/;

function seq(values) { var i = 0; return function () { return values[i++ % values.length]; }; }
function memStorage(initial) {
  var data = {};
  if (initial) { data[X.STORAGE_KEY] = JSON.stringify(initial); }
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    get: function () { return data[X.STORAGE_KEY] ? JSON.parse(data[X.STORAGE_KEY]) : null; }
  };
}
var brokenStorage = {
  getItem: function () { throw new Error('SecurityError'); },
  setItem: function () { throw new Error('QuotaExceededError'); }
};

// 1) No experiment → the default flow, not counted.
var a = X.assign({ 'default': 'swipe', experiment: null }, '', null, Math.random, NOW);
assert.strictEqual(a.flow, 'swipe2');
assert.strictEqual(a.counted, false);
assert.strictEqual(a.store, null);
assert.strictEqual(a.experimentId, null);
assert.strictEqual(X.assign(null, '', null).flow, 'classic', 'missing config falls back to classic');

// 2) Weighting: ~percent of fresh visitors go to the challenger.
[50, 20, 90].forEach(function (pct) {
  var cfg = { 'default': 'classic', experiment: { id: EXP.id, control: 'classic', challenger: 'swipe', percent: pct } };
  var n = 10000, chal = 0;
  for (var i = 0; i < n; i++) { if (X.assign(cfg, '', null, Math.random, NOW).arm === 'challenger') { chal++; } }
  var share = 100 * chal / n;
  assert.ok(Math.abs(share - pct) < 2, 'challenger share ' + share + '% ≈ ' + pct + '%');
});
assert.strictEqual(X.assign(CFG, '', null, seq([0.49]), NOW).arm, 'challenger', 'rand*100 < percent → challenger');
assert.strictEqual(X.assign(CFG, '', null, seq([0.5]), NOW).arm, 'control', 'rand*100 >= percent → control');

// 3) A fresh assignment: counted, flow from the arm, a store record with a hex visitor id.
a = X.assign(CFG, '', null, seq([0.1, 0.3, 0.7]), NOW);
assert.strictEqual(a.flow, 'swipe2');
assert.strictEqual(a.arm, 'challenger');
assert.strictEqual(a.counted, true);
assert.ok(HEX32.test(a.visitorId), 'visitor id is 32 lowercase hex');
assert.deepStrictEqual(a.store, { experimentId: EXP.id, arm: 'challenger', visitorId: a.visitorId, assignedAt: NOW });

// 4) Sticky: a stored assignment for the same experiment is reused, whatever rand says.
var stored = { experimentId: EXP.id, arm: 'control', visitorId: 'a'.repeat(32), assignedAt: NOW - 10 * DAY };
for (var k = 0; k < 20; k++) {
  a = X.assign(CFG, '', stored, Math.random, NOW);
  assert.strictEqual(a.arm, 'control');
  assert.strictEqual(a.flow, 'classic');
  assert.strictEqual(a.visitorId, 'a'.repeat(32));
  assert.strictEqual(a.store, null, 'no storage change for a returning visitor');
  assert.strictEqual(a.counted, true);
}
assert.strictEqual(X.assign(CFG, '', Object.assign({}, stored, { exposed: true }), Math.random, NOW).exposed, true, 'exposed flag carried');

// 5) A new experiment id redraws.
a = X.assign(CFG, '', { experimentId: 'exp_20260101_000000', arm: 'control', visitorId: 'b'.repeat(32), assignedAt: NOW - DAY }, seq([0.1]), NOW);
assert.ok(a.store && a.store.experimentId === EXP.id, 'old experiment → new store record');
assert.notStrictEqual(a.visitorId, 'b'.repeat(32));

// 6) 90-day expiry redraws; 89 days does not.
a = X.assign(CFG, '', Object.assign({}, stored, { assignedAt: NOW - 90 * DAY }), seq([0.1]), NOW);
assert.ok(a.store, '90-day-old assignment is redrawn');
a = X.assign(CFG, '', Object.assign({}, stored, { assignedAt: NOW - 89 * DAY }), seq([0.1]), NOW);
assert.strictEqual(a.store, null, '89-day-old assignment is kept');

// Corrupt records are redrawn.
[{ experimentId: EXP.id, arm: 'swipe', visitorId: 'a'.repeat(32), assignedAt: NOW },
 { experimentId: EXP.id, arm: 'control', visitorId: 'XYZ', assignedAt: NOW },
 { experimentId: EXP.id, arm: 'control', visitorId: 'a'.repeat(32) },
 'nonsense'].forEach(function (bad) {
  assert.ok(X.assign(CFG, '', bad, seq([0.1]), NOW).store, 'corrupt record redrawn: ' + JSON.stringify(bad));
});

// 7) A forced flow wins, is not counted, and leaves storage alone.
a = X.assign(CFG, 'swipe2', stored, Math.random, NOW);
assert.deepStrictEqual([a.flow, a.counted, a.store, a.experimentId], ['swipe2', false, null, null]);
a = X.assign({ 'default': 'classic', experiment: null }, 'swipe2', null, Math.random, NOW);
assert.deepStrictEqual([a.flow, a.counted], ['swipe2', false]);
a = X.assign(CFG, 'bogus', null, seq([0.9]), NOW);
assert.strictEqual(a.counted, true, 'an unknown forced flow is ignored');

// 8) forcedFlow(): ?flow= first, then data-flow; '' when absent/unknown.
function el(v) { return { getAttribute: function (n) { return n === 'data-flow' ? v : null; } }; }
assert.strictEqual(X.forcedFlow('?flow=swipe', el('')), 'swipe2');
assert.strictEqual(X.forcedFlow('?door_type=Single&flow=Classic', el('swipe')), 'classic', 'query beats data-flow, case-insensitive');
assert.strictEqual(X.forcedFlow('', el('swipe')), 'swipe2');
assert.strictEqual(X.forcedFlow('?flow=nope', el('')), '');
assert.strictEqual(X.forcedFlow('?flow=nope', el('classic')), 'classic');
assert.strictEqual(X.forcedFlow('', null), '');
assert.strictEqual(X.forcedFlow(undefined, {}), '');
assert.strictEqual(X.forcedFlow('?flow=cards', el(''), { 'default': 'classic', experiment: { id: 'x', control: 'classic', challenger: 'cards' } }), 'cards', 'config flows are known');

// 9) resolve(): persists a new assignment, reuses it next load (crypto id when available).
var store = memStorage();
var fakeCrypto = { getRandomValues: function (arr) { for (var i = 0; i < arr.length; i++) { arr[i] = i * 17 % 256; } return arr; } };
a = X.resolve(CFG, '', { storage: store, rand: seq([0.9]), now: NOW, crypto: fakeCrypto });
assert.strictEqual(a.arm, 'control');
assert.strictEqual(a.visitorId, '00112233445566778899aabbccddeeff', 'crypto visitor id preferred');
assert.deepStrictEqual(store.get(), { experimentId: EXP.id, arm: 'control', visitorId: a.visitorId, assignedAt: NOW });
var again = X.resolve(CFG, '', { storage: store, rand: seq([0.0]), now: NOW + DAY, crypto: null });
assert.deepStrictEqual([again.arm, again.visitorId, again.store], ['control', a.visitorId, null], 'second load is sticky');
assert.strictEqual(X.resolve(CFG, 'swipe2', { storage: store }).counted, false);
assert.strictEqual(store.get().arm, 'control', 'forced load leaves storage alone');

// 10) Storage unavailable (throws, or absent): assigned fresh each load, still counted.
[brokenStorage, null].forEach(function (s) {
  var r1 = X.resolve(CFG, '', { storage: s, rand: seq([0.1]), now: NOW, crypto: null });
  var r2 = X.resolve(CFG, '', { storage: s, rand: seq([0.9]), now: NOW, crypto: null });
  assert.strictEqual(r1.counted, true);
  assert.strictEqual(r1.arm, 'challenger');
  assert.strictEqual(r2.arm, 'control', 'no storage → a fresh draw each load');
});
assert.doesNotThrow(function () { X.resolve(null, null, { storage: brokenStorage }); });

// 11) enquiryRef()
assert.deepStrictEqual(X.enquiryRef(a), { experimentId: EXP.id, visitorId: a.visitorId, arm: 'control' });
assert.strictEqual(X.enquiryRef(X.assign(CFG, 'swipe2', null)), null, 'forced → no ref');
assert.strictEqual(X.enquiryRef(null), null);

// 12) Swipe 2: the old swipe key is an alias; saved designs reopen in their own flow.
var EX = require('../../assets/js/experiment.js');
assert.strictEqual(EX.canonical('swipe'), 'swipe2');
assert.strictEqual(EX.canonical(' Swipe '), 'swipe2');
assert.strictEqual(EX.canonical('classic'), 'classic');
assert.strictEqual(EX.canonical(undefined), '');
assert.strictEqual(EX.forcedFlow('?flow=swipe', null), 'swipe2');
assert.strictEqual(EX.forcedFlow('?flow=swipe2', null), 'swipe2');
assert.strictEqual(EX.forcedFlow('', { getAttribute: function () { return 'swipe'; } }), 'swipe2');
assert.strictEqual(EX.storedFlow({ flow: 'swipe' }, true), 'swipe2');
assert.strictEqual(EX.storedFlow({ flow: 'swipe2' }, true), 'swipe2');
assert.strictEqual(EX.storedFlow({ flow: 'swipe2' }, false), 'classic', 'no render model: fall back');
assert.strictEqual(EX.storedFlow({ flow: 'classic' }, true), 'classic');
assert.strictEqual(EX.storedFlow({ flow: '' }, true), '', "old rows: caller keeps today's behaviour");
assert.strictEqual(EX.storedFlow(null, true), '');
assert.strictEqual(EX.storedFlow({ flow: 'made-up' }, true), '');

// A config still naming the retired key resolves to swipe2, and is still counted.
assert.strictEqual(X.assign({ 'default': 'swipe', experiment: null }, '', null, Math.random, NOW).flow, 'swipe2');
assert.strictEqual(X.resolve({ 'default': 'swipe', experiment: null }, '', { storage: null }).flow, 'swipe2');
var oldCfg = { 'default': 'classic', experiment: { id: EXP.id, control: 'classic', challenger: 'swipe', percent: 50 } };
a = X.assign(oldCfg, '', null, seq([0.1]), NOW);
assert.deepStrictEqual([a.flow, a.arm, a.counted], ['swipe2', 'challenger', true]);
a = X.assign(oldCfg, '', null, seq([0.9]), NOW);
assert.deepStrictEqual([a.flow, a.arm, a.counted], ['classic', 'control', true]);

// 12b) canRunSwipe(): Swipe 2 starts only when the render model and every script it needs are
// there (a cached page from before an update can be missing a script tag).
var ALL = { HD_DD_SwipeApp: function () {}, HD_DD_ReviewSave: {}, HD_DD_SwipeHint: {} };
assert.strictEqual(typeof X.canRunSwipe, 'function', 'canRunSwipe is exported');
assert.strictEqual(X.canRunSwipe(ALL, { any: 'model' }), true, 'everything loaded: Swipe 2 may start');
assert.strictEqual(X.canRunSwipe(ALL, null), false, 'no render model');
assert.strictEqual(X.canRunSwipe(null, { any: 'model' }), false, 'no window');
Object.keys(ALL).forEach(function (k) {
  var w = {};
  Object.keys(ALL).forEach(function (j) { if (j !== k) { w[j] = ALL[j]; } });
  assert.strictEqual(X.canRunSwipe(w, { any: 'model' }), false, 'missing ' + k + ': classic instead');
});

// 13) expose(): posts once per visitor per experiment; never throws.
(async function () {
  var calls = [];
  function api(res) { return function (path, opts) { calls.push([path, opts]); return Promise.resolve(res); }; }
  var s = memStorage();
  var r = X.resolve(CFG, '', { storage: s, rand: seq([0.1]), now: NOW, crypto: null });
  var ok = await X.expose(api({ ok: true, status: 200, body: { ok: true } }), r, { storage: s });
  assert.strictEqual(ok, true);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][0], 'experiment/expose');
  assert.strictEqual(calls[0][1].method, 'POST');
  assert.deepStrictEqual(JSON.parse(calls[0][1].body), { experimentId: EXP.id, visitorId: r.visitorId, arm: 'challenger' });
  assert.strictEqual(s.get().exposed, true, 'exposed remembered in storage');

  var next = X.resolve(CFG, '', { storage: s, now: NOW + DAY, crypto: null });
  assert.strictEqual(await X.expose(api({ ok: true, body: { ok: true } }), next, { storage: s }), false);
  assert.strictEqual(calls.length, 1, 'no second POST on a later load');

  // Forced / uncounted: nothing posted.
  assert.strictEqual(await X.expose(api({ ok: true }), X.resolve(CFG, 'swipe', { storage: memStorage() })), false);
  assert.strictEqual(calls.length, 1);

  // Rate-limited: not remembered, so the next load retries.
  var s2 = memStorage();
  var r2 = X.resolve(CFG, '', { storage: s2, rand: seq([0.1]), now: NOW, crypto: null });
  assert.strictEqual(await X.expose(api({ ok: false, status: 429, body: { ok: false } }), r2, { storage: s2 }), false);
  assert.ok(!s2.get().exposed, '429 is retried next load');

  // Storage unavailable: posts every load (the server dedupes).
  var r3 = X.resolve(CFG, '', { storage: brokenStorage, rand: seq([0.1]), now: NOW, crypto: null });
  calls.length = 0;
  await X.expose(api({ ok: true, body: { ok: true } }), r3, { storage: brokenStorage });
  var r4 = X.resolve(CFG, '', { storage: brokenStorage, rand: seq([0.1]), now: NOW, crypto: null });
  await X.expose(api({ ok: true, body: { ok: true } }), r4, { storage: brokenStorage });
  assert.strictEqual(calls.length, 2);

  // A failing / throwing client never reaches the caller.
  assert.strictEqual(await X.expose(function () { return Promise.reject(new Error('offline')); }, X.resolve(CFG, '', { storage: null, crypto: null })), false);
  assert.strictEqual(await X.expose(function () { throw new Error('boom'); }, X.resolve(CFG, '', { storage: null, crypto: null })), false);
  assert.strictEqual(await X.expose(null, r), false);

  console.log('experiment.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
