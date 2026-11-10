// Designer 4 ask: email only, then updates to the same door. `node tests/js/d4-ask.test.js`
var assert = require('assert');

function node(tag) {
  var n = {
    tag: tag, className: '', textContent: '', value: '', children: [], attrs: {}, listeners: {}, parentNode: null,
    appendChild: function (c) { c.parentNode = n; n.children.push(c); return c; },
    addEventListener: function (type, fn) { n.listeners[type] = fn; },
    setAttribute: function (k, v) { n.attrs[k] = v; }
  };
  Object.defineProperty(n, 'innerHTML', { set: function () { n.children = []; }, get: function () { return ''; } });
  return n;
}
global.document = { createElement: node };
global.window = { location: { origin: 'https://example.test', pathname: '/door-designer/' } };
var Ask = require('../../assets/js/designer4/d4-ask.js');
var RS = require('../../assets/js/swipe/review-save.js');

function find(n, cls) {
  if (n.className === cls) { return n; }
  for (var i = 0; i < n.children.length; i++) { var r = find(n.children[i], cls); if (r) { return r; } }
  return null;
}
function input(n, name) {
  if (n.tag === 'input' && n.name === name) { return n; }
  for (var i = 0; i < n.children.length; i++) { var r = input(n.children[i], name); if (r) { return r; } }
  return null;
}
function text(n) { return n.textContent + n.children.map(text).join(''); }
function tick() { return new Promise(function (r) { setImmediate(r); }); }
function submit(box) { find(box, 'hd-d4-ask').listeners.submit({ preventDefault: function () {} }); }

function harness(over) {
  var h = { calls: [], leads: [], noHandle: 0, emails: [], handle: true };
  h.design = { 'Door Type': { label: 'Single Door', id: 1 }, 'Door Design': { label: 'Etna', id: 2 } };
  h.reply = { ok: true, status: 200, body: { ok: true, token: 'tok123', reference: 'HD-1' } };
  var store = {
    lead: function (b) { h.calls.push(['lead', b]); return Promise.resolve(h.reply); },
    addDoor: function (b) { h.calls.push(['addDoor', b]); return Promise.resolve(h.reply); },
    update: function (t, b) { h.calls.push(['update', t, b]); return Promise.resolve(h.updateReply || { ok: true, status: 200, body: { ok: true } }); },
    setEmail: function (e) { h.emails.push(e); }
  };
  var o = {
    store: store, cfg: { restUrl: 'https://example.test/wp-json/hd/' },
    getDesign: function () { return h.design; }, getCanvas: function () { return null; },
    experiment: function () { return { experimentId: 'exp_1', visitorId: 'v', arm: 'challenger' }; },
    hasHandle: function () { return h.handle; }, onNoHandle: function () { h.noHandle++; },
    onLead: function (b) { h.leads.push(b); }
  };
  Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; });
  h.s = Ask.create(o);
  h.box = node('div');
  h.s.render(h.box);
  return h;
}

(async function () {
  // The agreed wording and fields.
  var h = harness();
  assert.strictEqual(find(h.box, 'hd-d4-ask__btn').textContent, 'Email me this design and its price');
  assert.ok(text(h.box).indexOf("We'll send a link to your design now. Your price follows by email within 1 working day.") !== -1, 'note verbatim');
  assert.ok(input(h.box, 'hd_hp'), 'honeypot present');
  assert.ok(input(h.box, 'email'), 'email input present');

  // No handle: nothing sent, email kept, onNoHandle once.
  h.handle = false;
  input(h.box, 'email').value = 'jo@example.com';
  submit(h.box);
  assert.strictEqual(h.calls.length, 0);
  assert.strictEqual(find(h.box, 'hd-d4-ask__error').textContent, 'Oops, your door needs a handle to be saved.');
  assert.strictEqual(h.noHandle, 1);
  assert.strictEqual(input(h.box, 'email').value, 'jo@example.com');
  h.handle = true;

  // Bad email.
  input(h.box, 'email').value = 'nope';
  submit(h.box);
  assert.strictEqual(h.calls.length, 0);
  assert.strictEqual(find(h.box, 'hd-d4-ask__error').textContent, RS.COPY.badEmail);

  // Valid: one lead; a second submit while busy is ignored.
  input(h.box, 'email').value = '  jo@example.com ';
  submit(h.box); submit(h.box);
  await tick();
  assert.strictEqual(h.calls.length, 1, 'busy lock');
  assert.strictEqual(h.calls[0][0], 'lead');
  var b = h.calls[0][1];
  assert.strictEqual(b.email, 'jo@example.com');
  assert.strictEqual(b.hd_hp, '');
  assert.deepStrictEqual(b.design, h.design);
  assert.strictEqual(b.pageUrl, 'https://example.test/door-designer/');
  assert.deepStrictEqual(b.experiment, { experimentId: 'exp_1', visitorId: 'v', arm: 'challenger' });
  assert.strictEqual(h.leads.length, 1);
  assert.strictEqual(h.leads[0].token, 'tok123');
  assert.deepStrictEqual(h.emails, ['jo@example.com']);
  assert.strictEqual(h.s.saved(), true);
  assert.strictEqual(h.s.token(), 'tok123');

  // Redrawn after the lead: the sent line and a way on, no input, no second lead.
  h.s.render(h.box);
  assert.strictEqual(input(h.box, 'email'), null);
  assert.strictEqual(find(h.box, 'hd-d4-ask__done').textContent, '✓ Sent. Any changes you make here are saved too.');
  var next = find(h.box, 'hd-d4-ask__btn');
  assert.strictEqual(next.textContent, 'Next: your doorway');
  // With the handle taken off after the lead: the same check as the email button.
  h.handle = false;
  var noHandleBefore = h.noHandle;
  next.listeners.click();
  await tick();
  assert.strictEqual(h.noHandle, noHandleBefore + 1, 'Next without a handle calls onNoHandle');
  assert.strictEqual(find(h.box, 'hd-d4-ask__error').textContent, 'Oops, your door needs a handle to be saved.');
  assert.strictEqual(h.leads.length, 1, 'Next without a handle does not call onLead');
  assert.strictEqual(h.calls.length, 1, 'Next without a handle sends no update');
  h.handle = true;
  next.listeners.click();
  await tick();
  assert.strictEqual(h.leads[1].again, true);
  assert.strictEqual(h.calls.length, 1);

  // update(): only when the design changed; a 409 resolves false and keeps the token.
  assert.strictEqual(await h.s.update(), true);
  assert.strictEqual(h.calls.length, 1, 'unchanged: nothing sent');
  h.design = { 'Door Type': { label: 'Single Door', id: 1 }, 'Door Design': { label: 'Bruce', id: 3 } };
  assert.strictEqual(await h.s.update(), true);
  assert.strictEqual(h.calls.length, 2);
  assert.deepStrictEqual(h.calls[1].slice(0, 2), ['update', 'tok123']);
  assert.deepStrictEqual(h.calls[1][2].design, h.design);
  assert.strictEqual(await h.s.update(), true);
  assert.strictEqual(h.calls.length, 2, 'now in step');
  h.design = { 'Door Type': { label: 'Single Door', id: 1 }, 'Door Design': { label: 'Alto', id: 4 } };
  h.updateReply = { ok: false, status: 409, body: { ok: false, code: 'closed' } };
  assert.strictEqual(await h.s.update(), false);
  assert.strictEqual(h.s.token(), 'tok123', '409 clears nothing');
  assert.strictEqual(h.s.saved(), true);

  // A 422 about the handle shows its message and allows another try.
  var f = harness();
  f.reply = { ok: false, status: 422, body: { ok: false, data: { fields: { handle: 'Server handle message.' } } } };
  input(f.box, 'email').value = 'jo@example.com';
  submit(f.box);
  await tick();
  assert.strictEqual(find(f.box, 'hd-d4-ask__error').textContent, 'Server handle message.');
  assert.strictEqual(f.leads.length, 0);
  assert.strictEqual(find(f.box, 'hd-d4-ask__btn').disabled, false);

  // Known mode: no input, its own button, store.addDoor, handle still required.
  var k = harness({ known: true });
  assert.strictEqual(input(k.box, 'email'), null);
  assert.strictEqual(find(k.box, 'hd-d4-ask__btn').textContent, 'Add this door to my estimate');
  k.handle = false;
  submit(k.box);
  assert.strictEqual(k.calls.length, 0);
  assert.strictEqual(k.noHandle, 1);
  k.handle = true;
  submit(k.box);
  await tick();
  assert.strictEqual(k.calls.length, 1);
  assert.strictEqual(k.calls[0][0], 'addDoor');
  assert.strictEqual(k.calls[0][1].email, undefined);
  assert.strictEqual(k.s.token(), 'tok123');

  // setToken on a reopened door marks the design on screen as stored; later changes are sent to it.
  var s = harness();
  s.s.setToken('old9');
  assert.strictEqual(await s.s.update(), true);
  assert.strictEqual(s.calls.length, 0, 'current design counts as stored');
  s.design = { 'Door Type': { label: 'Single Door', id: 1 }, 'Door Design': { label: 'Zed', id: 9 } };
  assert.strictEqual(await s.s.update(), true);
  assert.deepStrictEqual(s.calls[0].slice(0, 2), ['update', 'old9']);

  console.log('d4-ask.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
