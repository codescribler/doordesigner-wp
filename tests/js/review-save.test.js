// The Review step's two-step form: email first, then the details for an exact price.
// `node tests/js/review-save.test.js`
var assert = require('assert');

function node(tag) {
  var n = {
    tag: tag, className: '', textContent: '', value: '', children: [], attrs: {}, listeners: {}, parentNode: null, focused: 0,
    appendChild: function (c) { c.parentNode = n; n.children.push(c); return c; },
    addEventListener: function (type, fn) { n.listeners[type] = fn; },
    setAttribute: function (k, v) { n.attrs[k] = v; },
    focus: function () { n.focused++; }
  };
  Object.defineProperty(n, 'innerHTML', { set: function () { n.children = []; }, get: function () { return ''; } });
  return n;
}
global.document = { createElement: node };
global.window = { location: { origin: 'https://example.test', pathname: '/door-designer/' } };
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
function submit(box) { find(box, 'hd-dd__form').listeners.submit({ preventDefault: function () {} }); }

// ---- Pure helpers ---------------------------------------------------------------------
assert.strictEqual(RS.cleanEmail('  Jo@Example.com '), 'Jo@Example.com');
['jo@example.com', ' Jo@Example.co.uk ', 'a.b+c@d-e.org'].forEach(function (e) { assert.ok(RS.validEmail(e), e); });
['', 'jo', 'jo@', 'jo@example', 'jo example@x.com', '@x.com', null, undefined].forEach(function (e) { assert.ok(!RS.validEmail(e), String(e)); });
assert.strictEqual(RS.designKey({ A: { label: 'x' }, _ui: 1 }), RS.designKey({ A: { label: 'x' } }), 'UI-only keys do not count as a change');
assert.notStrictEqual(RS.designKey({ A: { label: 'x' } }), RS.designKey({ A: { label: 'y' } }));
assert.strictEqual(RS.COPY.saveButton, 'Email me my design');
assert.strictEqual(RS.COPY.quoteButton, 'Get my exact price');

function harness(over) {
  var h = { calls: [], saved: [], quoted: [], design: { 'Door Design': { label: 'Ketu', id: 1 } }, reply: null };
  h.api = function (path, opts) {
    h.calls.push([path, JSON.parse(opts.body)]);
    var r = typeof h.reply === 'function' ? h.reply(path) : h.reply;
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  var o = {
    api: h.api, cfg: { restUrl: 'https://example.test/wp-json/x/' }, flow: 'swipe2',
    getDesign: function () { return h.design; }, getCanvas: function () { return null; },
    experiment: function () { return { experimentId: 'exp_1', visitorId: 'v', arm: 'challenger' }; },
    onSaved: function (r) { h.saved.push(r); }, onQuoted: function (r, img) { h.quoted.push([r, img]); }
  };
  Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; });
  h.rs = RS.create(o);
  h.box = node('div');
  h.rs.render(h.box);
  return h;
}
var OK_SAVE = { ok: true, status: 201, body: { ok: true, reference: 'HD-1', token: 'tok1234567890' } };
var OK_QUOTE = { ok: true, status: 200, body: { ok: true, reference: 'HD-1', token: 'tok1234567890' } };

(async function () {
  // ---- Step 1 shows one field ---------------------------------------------------------
  var h = harness();
  assert.ok(input(h.box, 'email'), 'step 1 has an email field');
  assert.strictEqual(input(h.box, 'name'), null, 'and no name field yet');
  assert.strictEqual(find(h.box, 'hd-dd__submit').textContent, 'Email me my design');
  assert.strictEqual(h.rs.saved(), false);

  // A bad address: a message, no request.
  input(h.box, 'email').value = 'not-an-email';
  submit(h.box);
  assert.strictEqual(h.calls.length, 0);
  assert.strictEqual(find(h.box, 'hd-dd__form-error').textContent, 'Please enter a valid email address.');

  // A good address with stray spaces: one POST, trimmed, with flow, design and experiment.
  h.reply = OK_SAVE;
  input(h.box, 'email').value = '  Jo@Example.com ';
  submit(h.box);
  submit(h.box); // double tap while the first is in flight
  assert.strictEqual(h.calls.length, 1, 'a double tap sends one request');
  assert.strictEqual(find(h.box, 'hd-dd__submit').disabled, true, 'button disabled while sending');
  assert.strictEqual(h.calls[0][0], 'save');
  assert.strictEqual(h.calls[0][1].email, 'Jo@Example.com');
  assert.strictEqual(h.calls[0][1].flow, 'swipe2');
  assert.strictEqual(h.calls[0][1].pageUrl, 'https://example.test/door-designer/');
  assert.deepStrictEqual(h.calls[0][1].design, { 'Door Design': { label: 'Ketu', id: 1 } });
  assert.strictEqual(h.calls[0][1].experiment.arm, 'challenger');
  await tick();
  assert.strictEqual(h.saved.length, 1);
  assert.strictEqual(h.rs.saved(), true);

  // ---- Step 2 replaces step 1 -----------------------------------------------------------
  assert.strictEqual(input(h.box, 'email'), null, 'the email field is gone');
  assert.ok(input(h.box, 'name') && input(h.box, 'postcode') && input(h.box, 'telephone'));
  assert.strictEqual(find(h.box, 'hd-dd__submit').textContent, 'Get my exact price');
  assert.ok(text(h.box).indexOf('We\u2019ll send it within one working day.') !== -1);
  assert.ok(text(h.box).indexOf('Saved.') !== -1);

  // Empty name: a message, no request.
  submit(h.box);
  assert.strictEqual(h.calls.length, 1);

  // Server rejects the postcode: the message lands on that field and the typed values stay.
  h.reply = { ok: false, status: 422, body: { message: 'Please check the highlighted fields.', data: { fields: { postcode: 'Please enter a valid UK postcode.' } } } };
  input(h.box, 'name').value = 'Jo Bloggs';
  input(h.box, 'postcode').value = 'nope';
  submit(h.box);
  await tick();
  assert.strictEqual(h.calls[1][0], 'save/tok1234567890/quote');
  assert.strictEqual(input(h.box, 'name').value, 'Jo Bloggs', 'typed values survive a failure');
  assert.ok(text(h.box).indexOf('Please enter a valid UK postcode.') !== -1);
  assert.strictEqual(h.quoted.length, 0);
  assert.strictEqual(find(h.box, 'hd-dd__submit').disabled, false, 'button re-enabled after a failure');

  // The network drops: a plain message, values kept.
  h.reply = new Error('offline');
  input(h.box, 'postcode').value = 'AL1 1AA';
  submit(h.box);
  await tick();
  assert.ok(text(h.box).indexOf('Something went wrong') !== -1);
  assert.strictEqual(input(h.box, 'postcode').value, 'AL1 1AA');

  // Success: onQuoted, with what was typed.
  h.reply = OK_QUOTE;
  input(h.box, 'telephone').value = '01234 567890';
  submit(h.box);
  await tick();
  var last = h.calls[h.calls.length - 1];
  assert.deepStrictEqual(last, ['save/tok1234567890/quote', { name: 'Jo Bloggs', postcode: 'AL1 1AA', telephone: '01234 567890', pageUrl: 'https://example.test/door-designer/' }]);
  assert.strictEqual(h.quoted.length, 1);

  // ---- The design changed after saving: the same record is updated, once -------------------
  h = harness();
  h.reply = OK_SAVE;
  input(h.box, 'email').value = 'jo@example.com';
  submit(h.box);
  await tick();
  h.rs.render(h.box);
  assert.strictEqual(h.calls.length, 1, 'no update when nothing changed');
  h.design = { 'Door Design': { label: 'Vinson', id: 2 } };
  h.reply = { ok: true, status: 200, body: { ok: true } };
  h.rs.render(h.box);
  assert.strictEqual(h.calls[1][0], 'save/tok1234567890');
  assert.deepStrictEqual(h.calls[1][1].design, { 'Door Design': { label: 'Vinson', id: 2 } });
  await tick();
  h.rs.render(h.box);
  assert.strictEqual(h.calls.length, 2, 'the update is sent once');
  assert.ok(input(h.box, 'name'), 'still on step 2');

  // ---- Save fails: stay on step 1 with the address still typed -----------------------------
  h = harness();
  h.reply = { ok: false, status: 422, body: { message: 'Please check the highlighted fields.', data: { fields: { email: 'Please enter a valid email address.' } } } };
  input(h.box, 'email').value = 'jo@example.com';
  submit(h.box);
  await tick();
  assert.strictEqual(h.rs.saved(), false);
  assert.strictEqual(input(h.box, 'email').value, 'jo@example.com');
  assert.strictEqual(find(h.box, 'hd-dd__form-error').textContent, 'Please enter a valid email address.');
  assert.strictEqual(h.saved.length, 0);

  // ---- A returning saver starts at step 2 -------------------------------------------------
  h = harness({ token: 'tokreturning1234' });
  assert.strictEqual(h.rs.saved(), true);
  assert.ok(input(h.box, 'name'));
  assert.strictEqual(h.calls.length, 0, 'opening a saved design sends nothing');
  assert.ok(text(h.box).indexOf('Saved.') === -1, 'no "just saved" line for a return visit');
  h.rs.focus();
  assert.strictEqual(input(h.box, 'name').focused, 1);

  // ---- "Design another door": back to step 1 with what we know already filled in ------------
  h = harness();
  h.reply = OK_SAVE;
  input(h.box, 'email').value = 'jo@example.com';
  submit(h.box);
  await tick();
  h.rs.reset();
  h.rs.render(h.box);
  assert.strictEqual(h.rs.saved(), false);
  assert.strictEqual(input(h.box, 'email').value, 'jo@example.com');

  // ---- QA harness (no REST URL): nothing is posted -----------------------------------------
  h = harness({ cfg: {} });
  input(h.box, 'email').value = 'jo@example.com';
  submit(h.box);
  assert.strictEqual(h.calls.length, 0);

  console.log('review-save.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
