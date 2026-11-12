// Designer 4 ask: email only, then updates to the same door. `node tests/js/d4-ask.test.js`
var assert = require('assert');

function node(tag) {
  var n = {
    tag: tag, className: '', textContent: '', value: '', children: [], attrs: {}, listeners: {}, parentNode: null,
    appendChild: function (c) { c.parentNode = n; n.children.push(c); return c; },
    addEventListener: function (type, fn) { n.listeners[type] = fn; },
    setAttribute: function (k, v) { n.attrs[k] = v; },
    focus: function () { global.document.activeElement = n; },
    contains: function (c) { while (c) { if (c === n) { return true; } c = c.parentNode; } return false; }
  };
  Object.defineProperty(n, 'innerHTML', { set: function () { n.children = []; }, get: function () { return ''; } });
  return n;
}
global.document = { createElement: node, activeElement: null };
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
function has(n, cls) { return (' ' + n.className + ' ').indexOf(' ' + cls + ' ') !== -1; }
function all(n, test, out) {
  out = out || [];
  if (test(n)) { out.push(n); }
  n.children.forEach(function (c) { all(c, test, out); });
  return out;
}
function byClass(n, cls) { return all(n, function (x) { return has(x, cls); }); }
function text(n) { return n.textContent + n.children.map(text).join(''); }
var SAVED = '✓ Saved. Changes save automatically.';
var SAVING = 'Saving…';
var FAILED = "Couldn't save just now. We'll try again when you change something.";
var OOPS = 'Oops, your door needs a handle to be saved.';
function lineText(box) { return byClass(box, 'hd-d4-saved__text')[0].textContent; }
function link(box) { return byClass(box, 'hd-d4-saved__next')[0]; }
function tick() { return new Promise(function (r) { setImmediate(r); }); }
function submit(box) { find(box, 'hd-d4-ask').listeners.submit({ preventDefault: function () {} }); }

function harness(over) {
  var h = { calls: [], leads: [], noHandle: 0, emails: [], handle: true, next: 'doorway' };
  h.design = { 'Door Type': { label: 'Single Door', id: 1 }, 'Door Design': { label: 'Etna', id: 2 } };
  h.reply = { ok: true, status: 200, body: { ok: true, token: 'tok123', reference: 'HD-1' } };
  var store = {
    lead: function (b) { h.calls.push(['lead', b]); return Promise.resolve(h.reply); },
    addDoor: function (b) { h.calls.push(['addDoor', b]); return Promise.resolve(h.reply); },
    update: function (t, b) { h.calls.push(['update', t, b]); return h.later ? h.later.p : Promise.resolve(h.updateReply || { ok: true, status: 200, body: { ok: true } }); },
    setEmail: function (e) { h.emails.push(e); }
  };
  var o = {
    store: store, cfg: { restUrl: 'https://example.test/wp-json/hd/' },
    getDesign: function () { return h.design; }, getCanvas: function () { return null; },
    experiment: function () { return { experimentId: 'exp_1', visitorId: 'v', arm: 'challenger' }; },
    hasHandle: function () { return h.handle; }, onNoHandle: function () { h.noHandle++; },
    nextStep: function () { return h.next; },
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
  // The error line (no handle, bad email) is a polite live region, there before any text is set.
  var errLine = find(h.box, 'hd-d4-ask__error');
  assert.strictEqual(errLine.textContent, '', 'empty at first');
  assert.ok(errLine.attrs['aria-live'] === 'polite' || errLine.attrs.role === 'alert', 'the error line is announced (aria-live="polite")');

  // No handle: nothing sent, email kept, onNoHandle once.
  h.handle = false;
  input(h.box, 'email').value = 'jo@example.com';
  submit(h.box);
  assert.strictEqual(h.calls.length, 0);
  assert.strictEqual(find(h.box, 'hd-d4-ask__error').textContent, 'Oops, your door needs a handle to be saved.');
  assert.strictEqual(h.noHandle, 1);
  assert.strictEqual(input(h.box, 'email').value, 'jo@example.com');
  // The handle check comes first: an empty or bad email with no handle still gets the handle
  // message and the bubble, not the email message.
  ['', 'nope'].forEach(function (v, i) {
    input(h.box, 'email').value = v;
    submit(h.box);
    assert.strictEqual(h.calls.length, 0);
    assert.strictEqual(find(h.box, 'hd-d4-ask__error').textContent, 'Oops, your door needs a handle to be saved.', 'handle first for email "' + v + '"');
    assert.strictEqual(h.noHandle, 2 + i, 'bubble shown for email "' + v + '"');
  });
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

  // Redrawn after the lead: the email box is gone; one slim saved line and a text link in its place.
  h.s.render(h.box);
  assert.strictEqual(all(h.box, function (x) { return x.tag === 'input'; }).length, 0, 'no input of any kind');
  assert.strictEqual(byClass(h.box, 'hd-d4-ask__btn').length, 0, 'no big button');
  assert.strictEqual(byClass(h.box, 'hd-d4-ask__note').length, 0, 'no note');
  assert.strictEqual(byClass(h.box, 'hd-d4-ask').length, 0, 'no box around them');
  assert.strictEqual(h.box.children.length, 1);
  assert.ok(has(h.box.children[0], 'hd-d4-saved'), 'the slim line');
  assert.strictEqual(lineText(h.box), SAVED);
  var st = byClass(h.box, 'hd-d4-saved__text')[0];
  assert.strictEqual(st.attrs.role, 'status');
  assert.strictEqual(st.attrs['aria-live'], 'polite');
  assert.strictEqual(all(h.box, function (x) { return x.tag === 'button'; }).length, 1, 'one button');
  var next = link(h.box);
  assert.ok(has(next, 'hd-d3-textlink'), 'a text-style link');
  assert.strictEqual(next.type, 'button');
  assert.strictEqual(next.textContent, 'Next: your doorway');
  // With the handle taken off after the lead: the same check as the email button.
  h.handle = false;
  var noHandleBefore = h.noHandle;
  next.listeners.click();
  await tick();
  assert.strictEqual(h.noHandle, noHandleBefore + 1, 'Next without a handle calls onNoHandle');
  assert.strictEqual(lineText(h.box), OOPS);
  assert.ok(has(byClass(h.box, 'hd-d4-saved__text')[0], 'hd-d4-saved__text--error'), 'in the error style');
  assert.strictEqual(h.leads.length, 1, 'Next without a handle does not call onLead');
  assert.strictEqual(h.calls.length, 1, 'Next without a handle sends no update');
  h.handle = true;
  next.listeners.click();
  await tick();
  assert.strictEqual(h.leads[1].again, true);
  assert.strictEqual(h.calls.length, 1);
  assert.strictEqual(lineText(h.box), SAVED, 'nothing to send: saved again');
  // The link says where it goes: "See my designs" when the doorway is answered or not offered.
  h.next = 'designs';
  h.s.render(h.box);
  assert.strictEqual(link(h.box).textContent, 'See my designs');
  link(h.box).listeners.click();
  assert.strictEqual(h.leads[2].again, true, 'the app routes it (to My designs)');
  h.next = 'doorway';

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

  // ---- The slim line shows what autosave is doing, without moving focus ----------------------
  function deferred() { var d = {}; d.p = new Promise(function (r) { d.resolve = r; }); return d; }
  function change(x, label) { x.design = { 'Door Type': { label: 'Single Door', id: 1 }, 'Door Design': { label: label, id: 7 } }; }
  var a = harness();
  a.s.setToken('tokA');
  a.s.render(a.box);
  assert.strictEqual(lineText(a.box), SAVED, 'a reopened door shows the saved line');
  var keep = link(a.box);
  keep.focus();
  // In flight: "Saving…"; resolved true: saved again.
  change(a, 'Bruce');
  a.later = deferred();
  var p = a.s.update();
  await tick();
  assert.strictEqual(a.calls.length, 1);
  assert.strictEqual(lineText(a.box), SAVING, 'Saving… while the update is pending');
  assert.strictEqual(document.activeElement, keep, 'a status change does not move focus');
  assert.strictEqual(link(a.box), keep, 'nor redraw the link');
  a.later.resolve({ ok: true, status: 200, body: { ok: true } });
  assert.strictEqual(await p, true);
  assert.strictEqual(lineText(a.box), SAVED, 'saved text back once it resolves true');
  assert.ok(!has(byClass(a.box, 'hd-d4-saved__text')[0], 'hd-d4-saved__text--error'));
  // A failed update: the could-not-save line; the next change tries again.
  change(a, 'Alto');
  a.later = null;
  a.updateReply = { ok: false, status: 500, body: { ok: false } };
  assert.strictEqual(await a.s.update(), false);
  assert.strictEqual(lineText(a.box), FAILED);
  // A 429 (the read and door routes' per-IP limit) is a failed save too.
  change(a, 'Rate');
  a.updateReply = { ok: false, status: 429, body: { code: 'hd_dd_rate_limited', message: 'Too many requests from this connection. Please try again later.' } };
  assert.strictEqual(await a.s.update(), false, 'a 429 is not saved');
  assert.strictEqual(lineText(a.box), FAILED, 'a 429 shows the could-not-save line');
  a.updateReply = null;
  change(a, 'Zed');
  assert.strictEqual(await a.s.update(), true);
  assert.strictEqual(a.calls.length, 4, 'the next change retried');
  assert.strictEqual(lineText(a.box), SAVED);
  // No handle: autosave is held (nothing sent), the Oops line; a handle pick sends it and recovers.
  a.handle = false;
  change(a, 'Etna');
  assert.strictEqual(await a.s.update(), false, 'held');
  assert.strictEqual(a.calls.length, 4, 'nothing sent with no handle');
  assert.strictEqual(lineText(a.box), OOPS);
  assert.ok(has(byClass(a.box, 'hd-d4-saved__text')[0], 'hd-d4-saved__text--error'));
  a.handle = true;
  change(a, 'Etna Lever');
  assert.strictEqual(await a.s.update(), true);
  assert.strictEqual(a.calls.length, 5, 'the held change is sent once a handle is picked');
  assert.strictEqual(lineText(a.box), SAVED, 'recovers after a handle pick');
  assert.strictEqual(document.activeElement, keep, 'focus never moved');
  // Drawn again with no handle on the door: the held line straight away.
  a.handle = false;
  a.s.render(a.box);
  assert.strictEqual(lineText(a.box), OOPS);
  a.handle = true;
  a.s.render(a.box);
  assert.strictEqual(lineText(a.box), SAVED);

  // Turning into the slim line in place (the screen did not move on): focus goes to the link.
  var c = harness({ onLead: function () {} });
  input(c.box, 'email').value = 'jo@example.com';
  find(c.box, 'hd-d4-ask__btn').focus();
  submit(c.box);
  await tick();
  assert.strictEqual(byClass(c.box, 'hd-d4-ask').length, 0, 'the form is gone');
  assert.strictEqual(lineText(c.box), SAVED);
  assert.strictEqual(document.activeElement, link(c.box), 'focus moved to the link');
  // Known mode ("Add this door to my estimate") turns into the same slim line.
  var k2 = harness({ known: true, onLead: function () {} });
  submit(k2.box);
  await tick();
  assert.strictEqual(lineText(k2.box), SAVED);
  assert.strictEqual(byClass(k2.box, 'hd-d4-ask__btn').length, 0);

  // Phones: the ask starts as just the button. The first tap opens the email field and focuses it,
  // sending nothing; the next tap sends. Desktop is open from the start and sends on the first tap.
  window.matchMedia = function () { return { matches: true }; };
  var m = harness();
  assert.strictEqual(find(m.box, 'hd-d4-ask').attrs['data-open'], 'false', 'phone: starts as the button');
  submit(m.box);
  assert.strictEqual(m.calls.length, 0, 'the first tap sends nothing');
  assert.strictEqual(find(m.box, 'hd-d4-ask').attrs['data-open'], 'true', 'the first tap opens the field');
  assert.strictEqual(document.activeElement, input(m.box, 'email'), 'the field gets focus');
  input(m.box, 'email').value = 'jo@example.com';
  submit(m.box);
  await tick();
  assert.strictEqual(m.calls.length, 1, 'the next tap sends');
  // With no handle the first tap still shows the bubble and opens nothing.
  var mh = harness();
  mh.handle = false;
  submit(mh.box);
  assert.strictEqual(mh.noHandle, 1);
  assert.strictEqual(find(mh.box, 'hd-d4-ask').attrs['data-open'], 'false');
  // Known mode has no field to open: one tap adds the door.
  var mk = harness({ known: true, onLead: function () {} });
  submit(mk.box);
  await tick();
  assert.strictEqual(mk.calls.length, 1);
  window.matchMedia = function () { return { matches: false }; };
  var dsk = harness();
  input(dsk.box, 'email').value = 'jo@example.com';
  submit(dsk.box);
  await tick();
  assert.strictEqual(dsk.calls.length, 1, 'desktop: the first tap sends');
  delete window.matchMedia;

  console.log('d4-ask.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
