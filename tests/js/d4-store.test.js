// Designer 4 session store. `node tests/js/d4-store.test.js`
var assert = require('assert');
var Store = require('../../assets/js/designer4/d4-store.js');

function mem() {
  var d = {};
  return { d: d, getItem: function (k) { return k in d ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); } };
}
function harness(storage, reply) {
  var h = { calls: [] };
  h.reply = reply || { ok: true, status: 200, body: { ok: true } };
  h.s = Store.create({
    api: function (path, opts) { h.calls.push([path, JSON.parse(opts.body), opts.method]); return Promise.resolve(h.reply); },
    storage: storage, pageUrl: 'https://example.test/door-designer/'
  });
  return h;
}

(async function () {
  var st = mem();
  var h = harness(st);
  assert.deepStrictEqual(h.s.auth(), { tokens: [] });
  h.s.addToken('aaa'); h.s.addToken('bbb'); h.s.addToken('aaa');
  assert.deepStrictEqual(h.s.auth(), { tokens: ['bbb', 'aaa'] }, 'no duplicates, newest last');

  // Tokens and email survive a new create() on the same storage.
  h.s.setEmail('jo@example.com');
  var again = harness(st);
  assert.deepStrictEqual(again.s.auth(), { tokens: ['bbb', 'aaa'] });
  assert.strictEqual(again.s.email(), 'jo@example.com');

  // The owner pair wins, is memory only, and is never stored.
  h.s.setOwner('own', 'key');
  assert.deepStrictEqual(h.s.auth(), { token: 'own', k: 'key' });
  h.s.addToken('ccc'); // forces another write after the owner was set
  assert.ok(st.d.hd_dd_d4_session.indexOf('own') === -1 && st.d.hd_dd_d4_session.indexOf('key') === -1, 'owner pair not written');
  assert.deepStrictEqual(harness(st).s.auth(), { tokens: ['bbb', 'aaa', 'ccc'] }, 'a new store has no owner');

  // At most the 50 most recent tokens.
  var big = harness(mem());
  for (var i = 0; i < 60; i++) { big.s.addToken('t' + i); }
  var t = big.s.auth().tokens;
  assert.strictEqual(t.length, 50);
  assert.strictEqual(t[0], 't10'); assert.strictEqual(t[49], 't59');

  // A throwing storage is tolerated.
  var bad = { getItem: function () { throw new Error('no'); }, setItem: function () { throw new Error('no'); } };
  var b = harness(bad);
  b.s.addToken('x'); b.s.setEmail('a@b.co');
  assert.deepStrictEqual(b.s.auth(), { tokens: ['x'] });
  assert.strictEqual(b.s.email(), 'a@b.co');
  var none = harness(null); none.s.addToken('y');
  assert.deepStrictEqual(none.s.auth(), { tokens: ['y'] });

  // lead: no auth, pageUrl filled in, token remembered.
  var l = harness(mem(), { ok: true, status: 200, body: { ok: true, token: 'new1', reference: 'HD-1' } });
  var res = await l.s.lead({ email: 'jo@example.com', design: { a: 1 } });
  assert.strictEqual(res.body.token, 'new1');
  assert.strictEqual(l.calls[0][0], 'd4/lead');
  assert.strictEqual(l.calls[0][2], 'POST');
  assert.strictEqual(l.calls[0][1].pageUrl, 'https://example.test/door-designer/');
  assert.strictEqual(l.calls[0][1].auth, undefined);
  assert.deepStrictEqual(l.s.auth(), { tokens: ['new1'] });

  // A failed lead stores nothing.
  var f = harness(mem(), { ok: false, status: 422, body: { ok: false } });
  await f.s.lead({ email: 'x' });
  assert.deepStrictEqual(f.s.auth(), { tokens: [] });

  // addDoor with an owner set: owner auth sent, but the new door is still a session token.
  var a = harness(mem(), { ok: true, status: 200, body: { ok: true, token: 'door2', reference: 'HD-2' } });
  a.s.setOwner('own', 'key');
  await a.s.addDoor({ design: { a: 1 } });
  assert.strictEqual(a.calls[0][0], 'd4/door');
  assert.deepStrictEqual(a.calls[0][1].auth, { token: 'own', k: 'key' });
  a.s.setOwner(null);
  assert.deepStrictEqual(a.s.auth(), { tokens: ['door2'] });

  // The other routes.
  var r = harness(mem());
  r.s.addToken('tk');
  await r.s.update('tk', { design: { a: 2 }, doorway: 'picked' });
  await r.s.remove('tk');
  await r.s.details({ name: 'Jo', postcode: 'AL1 1AA' });
  await r.s.list();
  assert.deepStrictEqual(r.calls.map(function (c) { return c[0]; }), ['d4/door/tk', 'd4/door/tk/remove', 'd4/details', 'd4/designs']);
  r.calls.forEach(function (c) { assert.deepStrictEqual(c[1].auth, { tokens: ['tk'] }); });
  assert.strictEqual(r.calls[0][1].doorway, 'picked');
  assert.strictEqual(r.calls[2][1].postcode, 'AL1 1AA');

  console.log('d4-store.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
