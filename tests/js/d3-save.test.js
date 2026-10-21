// Designer 3's "Save my design" box: email only, then updates to the same record.
// `node tests/js/d3-save.test.js`
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
var D3Save = require('../../assets/js/designer3/d3-save.js');

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
function submit(box) { find(box, 'hd-d3-save').listeners.submit({ preventDefault: function () {} }); }

function harness(over) {
  var h = { calls: [], saved: [], design: { 'Door Type': { label: 'Single Door', id: 1 }, 'Door Design': { label: 'Etna', id: 2 } } };
  h.reply = { ok: true, status: 201, body: { ok: true, token: 'tok123' } };
  var o = {
    api: function (path, opts) { h.calls.push([path, JSON.parse(opts.body)]); return Promise.resolve(typeof h.reply === 'function' ? h.reply(path) : h.reply); },
    cfg: { restUrl: 'https://example.test/wp-json/hd/' }, flow: 'designer3',
    getDesign: function () { return h.design; }, getCanvas: function () { return null; },
    experiment: function () { return { experimentId: 'exp_1', visitorId: 'v', arm: 'challenger' }; },
    onSaved: function (b) { h.saved.push(b); }
  };
  Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; });
  h.s = D3Save.create(o);
  h.box = node('div');
  h.s.render(h.box);
  return h;
}

(async function () {
  // The agreed wording.
  var h = harness();
  assert.strictEqual(find(h.box, 'hd-d3-save__btn').textContent, 'Save my design');
  assert.ok(text(h.box).indexOf('Just your email. We’ll send you a link to it.') !== -1, 'save note verbatim');
  assert.ok(input(h.box, 'hd_hp'), 'honeypot field present');
  assert.strictEqual(input(h.box, 'name'), null, 'email only');

  // An invalid email is blocked.
  input(h.box, 'email').value = 'nope';
  submit(h.box);
  assert.strictEqual(h.calls.length, 0, 'no request for a bad address');
  assert.strictEqual(find(h.box, 'hd-d3-save__error').textContent, 'Please enter a valid email address.');

  // A save posts `save` with flow designer3 and the trimmed email.
  input(h.box, 'email').value = '  jo@example.com ';
  submit(h.box);
  await tick();
  assert.strictEqual(h.calls.length, 1);
  assert.strictEqual(h.calls[0][0], 'save');
  var body = h.calls[0][1];
  assert.strictEqual(body.flow, 'designer3');
  assert.strictEqual(body.email, 'jo@example.com');
  assert.strictEqual(body.hd_hp, '');
  assert.deepStrictEqual(body.design, h.design);
  assert.deepStrictEqual(body.experiment, { experimentId: 'exp_1', visitorId: 'v', arm: 'challenger' });
  assert.strictEqual(h.saved.length, 1, 'onSaved once');
  assert.strictEqual(h.s.saved(), true);
  assert.strictEqual(h.s.token(), 'tok123');

  // Drawn again once saved (back from the saved screen): no second email, a way on instead.
  h.s.render(h.box);
  assert.strictEqual(input(h.box, 'email'), null, 'no email field once saved');
  assert.ok(find(h.box, 'hd-d3-save__done'), 'says it is saved');
  find(h.box, 'hd-d3-save__btn').listeners.click();
  await tick();
  assert.strictEqual(h.saved.length, 2);
  assert.strictEqual(h.saved[1].again, true, 'moving on again is flagged, so `saved` is not reported twice');
  assert.strictEqual(h.calls.length, 1, 'no new save row');

  // After a save, update() posts save/{token} — only when the design has changed.
  assert.strictEqual(await h.s.update(), true, 'unchanged design: nothing to send');
  assert.strictEqual(h.calls.length, 1);
  h.design = { 'Door Type': { label: 'Single Door', id: 1 }, 'Door Design': { label: 'Bruce', id: 3 } };
  h.reply = { ok: true, status: 200, body: { ok: true } };
  assert.strictEqual(await h.s.update(), true);
  assert.strictEqual(h.calls.length, 2);
  assert.strictEqual(h.calls[1][0], 'save/tok123');
  assert.deepStrictEqual(h.calls[1][1].design, h.design);
  assert.strictEqual(await h.s.update(), true, 'now in step');
  assert.strictEqual(h.calls.length, 2);

  // A 409 (already an enquiry) closes the record.
  h.design = { 'Door Type': { label: 'Single Door', id: 1 }, 'Door Design': { label: 'Alto', id: 4 } };
  h.reply = { ok: false, status: 409, body: { ok: false } };
  assert.strictEqual(await h.s.update(), false);
  assert.strictEqual(h.s.saved(), false, 'closed after 409');

  // A failed save shows a message and can be tried again.
  var f = harness();
  f.reply = { ok: false, status: 500, body: { ok: false, message: 'Server says no.' } };
  input(f.box, 'email').value = 'jo@example.com';
  submit(f.box);
  await tick();
  assert.strictEqual(find(f.box, 'hd-d3-save__error').textContent, 'Server says no.');
  assert.strictEqual(f.saved.length, 0);
  assert.strictEqual(find(f.box, 'hd-d3-save__btn').disabled, false);

  // Empty restUrl: preview mode sends nothing, and still moves on.
  var p = harness({ cfg: { restUrl: '' } });
  input(p.box, 'email').value = 'jo@example.com';
  submit(p.box);
  await tick();
  assert.strictEqual(p.calls.length, 0, 'preview sends nothing');
  assert.strictEqual(find(p.box, 'hd-d3-save__status').textContent, 'Preview mode — not sent.');
  assert.strictEqual(p.saved.length, 1);
  assert.strictEqual(p.saved[0].preview, true);
  assert.strictEqual(await p.s.update(), false);
  assert.strictEqual(p.calls.length, 0, 'update sends nothing in preview');

  console.log('d3-save.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
