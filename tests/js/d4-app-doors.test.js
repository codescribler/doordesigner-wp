// Designer 4's app, one door after another: a type change after the lead is a new door, a bare
// ?design= link opens a copy, startDoor disables the old saver, Back from steps reached through
// My designs, and a restyle after the lead saves.
// `node tests/js/d4-app-doors.test.js`
var assert = require('assert');

// A DOM just rich enough for the ask to render and submit.
function node(tag) {
  var n = {
    tag: tag, className: '', textContent: '', children: [], attrs: {}, style: {}, listeners: {}, parentNode: null,
    appendChild: function (c) { n.children.push(c); c.parentNode = n; return c; },
    addEventListener: function (k, f) { (n.listeners[k] = n.listeners[k] || []).push(f); },
    setAttribute: function (k, v) { n.attrs[k] = v; },
    contains: function (x) { return x === n || n.children.some(function (c) { return c.contains && c.contains(x); }); },
    scrollIntoView: function () {}
  };
  Object.defineProperty(n, 'innerHTML', { set: function () { n.children = []; }, get: function () { return ''; } });
  return n;
}
function find(n, tag) {
  if (n.tag === tag) { return n; }
  for (var i = 0; i < n.children.length; i++) { var f = find(n.children[i], tag); if (f) { return f; } }
  return null;
}
global.document = { createElement: node };

var model = require('../../data/render-model.json');
var table = require('../../data/designer3-defaults.json');
var fx = require('./fixtures/customer-view.js');
var REST = { d3Defaults: table, restUrl: 'https://example.test/wp-json/hd/v1/' };
global.window = {
  HD_DD_CONFIG: REST,
  HD_DD_StepConfig: require('../../assets/js/wizard/step-config.js'),
  HD_DD_Wizard: require('../../assets/js/wizard/wizard-controller.js'),
  HD_DD_Shared: require('../../assets/js/design-shared.js'),
  HD_DD_RenderModel: require('../../assets/js/render-model.js'),
  HD_DD_D3Defaults: require('../../assets/js/designer3/d3-defaults.js'),
  HD_DD_D3Hotspots: require('../../assets/js/designer3/d3-hotspots.js'),
  HD_DD_D3Nudge: require('../../assets/js/designer3/d3-nudge.js'),
  HD_DD_D3Frame: require('../../assets/js/designer3/d3-frame.js'),
  HD_DD_D3Screens: { type: function () {}, style: function () {}, door: function () { return { refresh: function () {} }; }, placeholder: function () {}, loading: function () {} },
  HD_DD_D4Door: { door: function () { return { refresh: function () {}, destroy: function () {} }; } },
  HD_DD_D4Steps: {},
  HD_DD_D4MyDesigns: {},
  location: { origin: 'https://example.test', pathname: '/door-designer/' }
};
window.HD_DD_D3Toolbox = require('../../assets/js/designer3/d3-toolbox.js');
window.HD_DD_D4Handle = require('../../assets/js/designer4/d4-handle.js');
window.HD_DD_D4Ask = require('../../assets/js/designer4/d4-ask.js');
require('../../assets/js/designer3/d3-app.js');
require('../../assets/js/designer4/d4-saved.js');
require('../../assets/js/designer4/d4-app.js');
var App = window.HD_DD_Designer4App;

function fakeStore() {
  var s = { tokens: [], owner: null, mail: '', updates: [], added: [], leads: [], listReply: { ok: true, body: { doors: [], missing: { name: true, postcode: true, phone: true } } } };
  s.addToken = function (t) { s.tokens.push(t); };
  s.setOwner = function (t, k) { s.owner = { token: t, k: k }; };
  s.auth = function () { return s.owner ? { token: s.owner.token, k: s.owner.k } : { tokens: s.tokens.slice() }; };
  s.email = function () { return s.mail; };
  s.setEmail = function (e) { s.mail = e; };
  s.list = function () { return Promise.resolve(s.listReply); };
  s.update = function (t, b) { s.updates.push([t, b.design['Door Type'].label]); return Promise.resolve({ ok: true }); };
  s.addDoor = function (b) { s.added.push(b.design['Door Type'].label); return Promise.resolve({ ok: true, body: { ok: true, token: 'tokNew' } }); };
  s.lead = function (b) { s.leads.push(b.email); return Promise.resolve({ ok: true, body: { ok: true, token: 'tokLead' } }); };
  return s;
}
function make(opts) {
  var o = { api: function () { return Promise.resolve({ ok: false }); }, funnel: { step: function () {}, lead: function () {} }, storage: null, store: fakeStore() };
  Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
  return new App(node('div'), fx.customerView(), model, null, o);
}
function tick() { return new Promise(function (r) { setImmediate(r); }); }
async function settle() { for (var i = 0; i < 6; i++) { await tick(); } }
function door(app, type, style) { app.select('Door Type', type || 'Single Door'); app.select('Door Design', style || 'Abbott'); return app; }
function otherColour(app) {
  var cur = app.design()['Door Colour (External)'].label;
  return app.stepFor('Door Colour (External)').choices.map(function (c) { return c.label; }).filter(function (l) { return l !== cur; })[0];
}
/** Render the ask and press its button; resolves once the send has finished. */
async function submitAsk(app) {
  var box = node('div');
  app.saver().render(box);
  var form = find(box, 'form');
  assert.ok(form, 'the ask is a form');
  form.listeners.submit.forEach(function (f) { f({ preventDefault: function () {} }); });
  await settle();
  return box;
}

(async function () {
  // ---- F2: a type change after the lead is a new door; the first door is untouched ----------
  var a = door(make());
  a.pick('handle', 'Handle', 'Lever/Lever');
  a.savedToken = 'tokFirst';                       // the lead went through for the Single door
  var first = a.saver();
  assert.strictEqual(first.token(), 'tokFirst');
  a.go('type');
  a.select('Door Type', 'Stable Door');
  assert.strictEqual(first.token(), null, 'the first door\'s saver is disabled');
  assert.strictEqual(a.savedToken, null, 'the new door has no saved token');
  assert.strictEqual(a.known, true, 'the person is known');
  a.select('Door Design', a.styles()[0].label);
  a.pick('handle', 'Handle', a.previewLabels()[0] || 'Lever/Lever');
  a.pick('colour', 'Door Colour (External)', otherColour(a));
  await settle();
  assert.deepStrictEqual(a.store.updates.filter(function (u) { return u[0] === 'tokFirst'; }), [], 'no update is sent under the first door\'s token');
  assert.notStrictEqual(a.saver(), first, 'a new ask for the new door');
  var box = node('div');
  a.saver().render(box);
  assert.ok(!find(box, 'input') || find(box, 'input').name !== 'email', 'the ask is in known mode: no email box');
  assert.strictEqual(find(box, 'button').textContent, 'Add this door to my estimate');
  await submitAsk(a);
  assert.deepStrictEqual(a.store.added, ['Stable Door'], 'sending adds a door');
  assert.deepStrictEqual(a.store.leads, [], 'and is not a second lead');

  // A style change on the same type after the lead is an edit of the same door.
  var same = door(make());
  same.pick('handle', 'Handle', 'Lever/Lever');
  same.savedToken = 'tokSame';
  var sameSaver = same.saver();
  same.go('type');
  same.select('Door Type', 'Single Door');
  assert.strictEqual(sameSaver.token(), 'tokSame', 'the same type again keeps the door');

  // ---- F9: startDoor disables the old saver before dropping it ------------------------------
  var sd = door(make());
  sd.pick('handle', 'Handle', 'Lever/Lever');
  sd.savedToken = 'tokOld';
  var old = sd.saver();
  sd.startDoor();
  assert.strictEqual(old.token(), null, 'startDoor: the old saver has no token');
  await old.update();
  assert.deepStrictEqual(sd.store.updates, [], 'a late update from it sends nothing');

  // ---- F13: a restyle of a door that is a lead and has a handle is saved at once -------------
  var rs = door(make());
  rs.pick('handle', 'Handle', 'Lever/Lever');
  rs.savedToken = 'tokR';
  rs.go('style');
  rs.select('Door Design', 'Alto');
  await settle();
  assert.deepStrictEqual(rs.store.updates, [['tokR', 'Single Door']], 'the restyle is saved without waiting for the next pick');
  var rn = door(make());                           // not a lead yet: nothing to save
  rn.pick('handle', 'Handle', 'Lever/Lever');
  rn.go('style');
  rn.select('Door Design', 'Alto');
  await settle();
  assert.deepStrictEqual(rn.store.updates, [], 'no lead: a restyle sends nothing');

  // ---- F3: a bare ?design= link opens a copy: nothing saved, nothing added -------------------
  var src = door(make());
  src.pick('handle', 'Handle', 'Lever/Lever');
  var stored = JSON.stringify(src.design());
  var calls = [];
  function api(path, opts) { calls.push(path); return Promise.resolve({ ok: true, body: { design: JSON.parse(stored), kind: 'enquiry' } }); }
  var cp = make({ api: api });
  cp.loadCopy('tokC');
  await settle();
  assert.strictEqual(cp.screen, 'door', 'the copy opens on the door');
  assert.strictEqual(cp.design().Handle.label, 'Lever/Lever', 'with the stored design');
  assert.strictEqual(cp.savedToken, null, 'no saved token');
  assert.deepStrictEqual(cp.store.tokens, [], 'the token is not added to the session');
  assert.strictEqual(cp.previewDue, false, 'the handle preview does not play');
  cp.saver();                                      // the door screen draws the ask
  cp.pick('colour', 'Door Colour (External)', otherColour(cp));
  cp.pick('handle', 'Handle', '400mm Pull Handle');
  cp.go('style'); cp.select('Door Design', 'Alto');
  await settle();
  assert.deepStrictEqual(cp.store.updates, [], 'no d4/door/{token} update on any pick');
  assert.deepStrictEqual(calls.filter(function (p) { return /^d4\/door\//.test(p); }), [], 'no d4/door/{token} request');
  cp.store.mail = 'someone@example.com';         // even in a session that already knows an email
  var cbox = node('div');
  cp.saver().render(cbox);
  assert.ok(find(cbox, 'input') && find(cbox, 'input').name === 'email', 'the ask is the ordinary email box');
  // A design that cannot be loaded falls back to the type screen.
  var none = make({ api: function () { return Promise.resolve({ ok: false, status: 404 }); } });
  none.loadCopy('tokGone');
  await settle();
  assert.strictEqual(none.screen, 'type', 'a copy that cannot load: the type screen');

  // The My designs path still autosaves.
  var md = make({ api: api });
  md.store.listReply = { ok: true, body: { doors: [{ token: 'tokM', status: 'pending', frame: null, doorway: true }], missing: {} } };
  md.screen = 'designs';
  md.loadSaved('tokM', 'door');
  await settle();
  assert.strictEqual(md.savedToken, 'tokM');
  assert.ok(md.store.tokens.indexOf('tokM') !== -1);
  md.saver();                                      // the door screen draws the ask
  md.pick('colour', 'Door Colour (External)', otherColour(md));
  await settle();
  assert.deepStrictEqual(md.store.updates, [['tokM', 'Single Door']], 'a door opened from My designs autosaves');

  // ---- F12: Back from the doorway or details reached through My designs goes to My designs ---
  var bk = make({ api: api });
  bk.store.listReply = { ok: true, body: { doors: [{ token: 'tokB', status: 'pending', frame: null, doorway: true }], missing: {} } };
  bk.screen = 'designs';
  bk.loadSaved('tokB', 'doorway');
  await settle();
  assert.strictEqual(bk.screen, 'doorway');
  bk.back();
  assert.strictEqual(bk.screen, 'designs', 'Back from a doorway opened from My designs');
  bk.go('details');
  bk.back();
  assert.strictEqual(bk.screen, 'designs', 'Back from details opened from My designs');
  // In this visit's own journey, Back from those screens still goes to the door.
  var own = door(make());
  own.go('doorway'); own.back();
  assert.strictEqual(own.screen, 'door', 'Back from a doorway reached from the door');
  own.go('details'); own.back();
  assert.strictEqual(own.screen, 'door', 'Back from details reached from the door');
  // Opened from My designs at the door: the door's later screens go back to the door.
  var atDoor = make({ api: api });
  atDoor.store.listReply = bk.store.listReply;
  atDoor.screen = 'designs';
  atDoor.loadSaved('tokB', 'door');
  await settle();
  atDoor.go('doorway'); atDoor.back();
  assert.strictEqual(atDoor.screen, 'door', 'a doorway reached from the door screen goes back to it');

  console.log('d4-app-doors.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
