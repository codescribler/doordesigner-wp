// Designer 4's app: the door is left without a handle, the handle is required, the new screens
// are routed to. Screens are stubbed (as in d3-app.test.js); the state is the real wizard.
// `node tests/js/d4-app.test.js`
var assert = require('assert');

function node(tag) {
  var n = {
    tag: tag, className: '', textContent: '', children: [], attrs: {}, style: {},
    appendChild: function (c) { n.children.push(c); return c; },
    addEventListener: function () {}, setAttribute: function (k, v) { n.attrs[k] = v; },
    scrollIntoView: function () {}
  };
  Object.defineProperty(n, 'innerHTML', { set: function () { n.children = []; }, get: function () { return ''; } });
  return n;
}
global.document = { createElement: node };

var model = require('../../data/render-model.json');
var table = require('../../data/designer3-defaults.json');
var fx = require('./fixtures/customer-view.js');
var screens = [];
var clarity = [];
global.window = {
  HD_DD_CONFIG: { d3Defaults: table },
  HD_DD_StepConfig: require('../../assets/js/wizard/step-config.js'),
  HD_DD_Wizard: require('../../assets/js/wizard/wizard-controller.js'),
  HD_DD_Shared: require('../../assets/js/design-shared.js'),
  HD_DD_RenderModel: require('../../assets/js/render-model.js'),
  HD_DD_D3Defaults: require('../../assets/js/designer3/d3-defaults.js'),
  HD_DD_D3Hotspots: require('../../assets/js/designer3/d3-hotspots.js'),
  HD_DD_D3Nudge: require('../../assets/js/designer3/d3-nudge.js'),
  HD_DD_D3Frame: require('../../assets/js/designer3/d3-frame.js'),
  HD_DD_D3Screens: {
    type: function () { screens.push('type'); },
    style: function () { screens.push('style'); },
    door: function () { screens.push('d3door'); return { refresh: function () {} }; },
    placeholder: function () { screens.push('placeholder'); }
  },
  HD_DD_D4Door: { door: function () { screens.push('door'); return { refresh: function () { screens.push('refresh'); }, destroy: function () { screens.push('destroy'); } }; } },
  HD_DD_D4Steps: {},
  HD_DD_D4MyDesigns: {},
  clarity: function (kind, name) { clarity.push(name); }
};
window.HD_DD_D3Toolbox = require('../../assets/js/designer3/d3-toolbox.js');
window.HD_DD_D4Handle = require('../../assets/js/designer4/d4-handle.js');
window.HD_DD_D4Ask = require('../../assets/js/designer4/d4-ask.js');
require('../../assets/js/designer3/d3-app.js');
require('../../assets/js/designer4/d4-app.js');
var App = window.HD_DD_Designer4App;
var D3App = window.HD_DD_Designer3App;
var H = window.HD_DD_D4Handle;

function fakeStore(over) {
  var s = { tokens: [], owner: null, mail: '', listReply: { ok: true, body: { doors: [], missing: { name: true, postcode: true, phone: true } } } };
  s.addToken = function (t) { s.tokens.push(t); };
  s.setOwner = function (t, k) { s.owner = { token: t, k: k }; };
  s.auth = function () { return s.owner ? { token: s.owner.token, k: s.owner.k } : { tokens: s.tokens.slice() }; };
  s.email = function () { return s.mail; };
  s.list = function () { return Promise.resolve(s.listReply); };
  Object.keys(over || {}).forEach(function (k) { s[k] = over[k]; });
  return s;
}
function make(opts, cv, Ctor) {
  var log = [];
  var o = {
    api: function () { return Promise.resolve({ ok: false }); },
    funnel: { step: function (k, c) { log.push([k, c]); }, lead: function () { log.push(['LEAD()']); } },
    storage: null, store: fakeStore()
  };
  Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
  var app = new (Ctor || App)(node('div'), cv || fx.customerView(), model, null, o);
  app.log = log;
  return app;
}
function steps(app, key) { return app.log.filter(function (s) { return s[0] === key; }); }
function tick() { return new Promise(function (r) { setImmediate(r); }); }
function door(app, type, style) { app.select('Door Type', type || 'Single Door'); app.select('Door Design', style || 'Abbott'); return app; }

assert.strictEqual(typeof App, 'function', 'HD_DD_Designer4App is defined');

// ---- choosing a style: no handle, the handle required, the preview due -------------------
var a = door(make());
assert.strictEqual(a.flow, 'designer4');
assert.ok(a instanceof D3App, 'a Designer 3 app underneath');
assert.strictEqual(a.screen, 'door');
assert.strictEqual(a.design().Handle.label, 'No Handle ', 'the catalogue\'s own No Handle choice');
assert.strictEqual(a.needHandle, true);
assert.strictEqual(a.previewDue, true);
assert.ok(!a.mine.Handle, 'No Handle is not one of the visitor\'s picks');
assert.strictEqual(steps(a, 'handle').length, 0, 'no handle funnel step');
assert.deepStrictEqual(a.log.map(function (s) { return s[0]; }), ['type', 'style', 'shown']);
assert.ok(a.design()['Door Colour (External)'] && a.design().Letterplate, 'colour and letterplate still pre-picked');

// settle() does not put a handle back
a.settle();
assert.strictEqual(a.design().Handle.label, 'No Handle ');
var colours = a.stepFor('Door Colour (External)').choices.map(function (c) { return c.label; });
a.pick('colour', 'Door Colour (External)', colours.filter(function (l) { return l !== a.design()['Door Colour (External)'].label; })[0]);
assert.strictEqual(a.design().Handle.label, 'No Handle ', 'a colour change leaves the handle off');
assert.strictEqual(a.needHandle, true);

// dots: the handle dot sits where a handle goes, not at the top-left
var hd = a.dots().filter(function (d) { return d.key === 'handle'; })[0];
assert.ok(hd, 'a handle dot');
assert.ok(hd.x > 0.1 && hd.y > 0.1, 'handle dot at ' + hd.x + ',' + hd.y);
var stand = H.withHandle(a.design(), a.previewLabels()[0]);
var want = window.HD_DD_D3Hotspots.display(model, 'Single Door', stand, a.OPTS, { knocker: !!a.stepFor('Knocker') }).filter(function (d) { return d.key === 'handle'; })[0];
assert.ok(Math.abs(hd.x - want.x) < 1e-9 && Math.abs(hd.y - want.y) < 1e-9, 'computed with a stand-in handle');

// picking a handle clears needHandle; picking No Handle sets it again
var lever = a.previewLabels()[0];
assert.strictEqual(lever, 'Lever/Lever');
a.pick('handle', 'Handle', lever);
assert.strictEqual(a.design().Handle.label, lever);
assert.strictEqual(a.needHandle, false);
assert.strictEqual(a.mine.Handle, lever);
assert.deepStrictEqual(steps(a, 'handle').pop(), ['handle', lever], 'a real pick reports');
a.pick('handle', 'Handle', 'No Handle ');
assert.strictEqual(a.needHandle, true);
a.pick('handle', 'Handle', lever);

// back on the grid with their own handle: a new style keeps it, no second preview
a.previewDue = false;
a.go('style');
a.select('Door Design', 'Alto');
assert.strictEqual(a.design().Handle.label, lever, 'their own handle survives a restyle');
assert.strictEqual(a.needHandle, false);
assert.strictEqual(a.previewDue, false, 'the preview plays once per new door');

// ---- a type whose Handle step has no "No Handle" keeps its default handle (Review Focus) ----
var cv = fx.customerView();
cv.byType['Single Door'].fields.Handle = cv.byType['Single Door'].fields.Handle.filter(function (c) { return !/^\s*no handle/i.test(c.label); });
var plain = door(make({}, cv));
assert.ok(H.hasHandle(plain.design()), 'default handle stays: ' + plain.design().Handle.label);
assert.strictEqual(plain.needHandle, false);
assert.strictEqual(plain.previewDue, false);

// ---- the ask: one per app, handle check, known --------------------------------------------
var s1 = a.saver();
assert.strictEqual(a.saver(), s1, 'one ask per app');
assert.strictEqual(typeof s1.render, 'function');
assert.strictEqual(typeof s1.update, 'function');

// ---- onLead: lead step then lead(), the doorway, or details when there is none --------------
var single = door(make());
single.pick('handle', 'Handle', 'Lever/Lever');
var before = single.log.length;
single.onLead({ ok: true, token: 'tokS' });
assert.deepStrictEqual(single.log.slice(before), [['lead', undefined], ['LEAD()']]);
assert.strictEqual(single.screen, 'doorway');
assert.ok(single.store.tokens.indexOf('tokS') !== -1, 'token stored');
assert.ok(clarity.indexOf('door_lead_submitted') !== -1, 'clarity event');
assert.strictEqual(clarity.indexOf('door_quote_submitted'), -1);
assert.strictEqual(screens[screens.length - 1], 'placeholder', 'the doorway shell is empty: placeholder');
var dbl2 = make();
dbl2.select('Door Type', 'Double Door');
dbl2.select('Door Design', dbl2.styles()[0].label);
dbl2.pick('handle', 'Handle', dbl2.previewLabels()[0] || 'Lever/Lever');
dbl2.onLead({ ok: true, token: 'tokD' });
assert.strictEqual(dbl2.screen, 'details', 'Double Door offers no doorway');
// again (the sent state's Next) and preview: no second lead
var n0 = single.log.length;
single.go('door');
single.onLead({ ok: true, token: 'tokS', again: true });
assert.strictEqual(single.log.slice(n0).filter(function (s) { return s[0] === 'lead' || s[0] === 'LEAD()'; }).length, 0);
assert.strictEqual(single.screen, 'doorway');

// a known person (from My designs) with nothing missing, on a type with no doorway: done
var known = make();
known.startDoor();
assert.strictEqual(known.screen, 'type');
assert.strictEqual(known.known, true);
known.missing = { name: false, postcode: false, phone: false };
known.select('Door Type', 'Double Door');
known.select('Door Design', known.styles()[0].label);
known.pick('handle', 'Handle', known.previewLabels()[0] || 'Lever/Lever');
var k0 = known.log.length;
known.onLead({ ok: true, token: 'tokK' });
assert.strictEqual(known.screen, 'done');
assert.deepStrictEqual(known.log.slice(k0), [['door_added', undefined]], 'an added door is not a second lead');

// ---- routing --------------------------------------------------------------------------------
var r = make();
var hits = [];
window.HD_DD_D4Steps = { doorway: function (app, shell) { hits.push(['doorway', app === r, !!shell]); } };
window.HD_DD_D4MyDesigns = { render: function (app) { hits.push(['designs', app === r]); } };
r.go('doorway');
r.go('details');
r.go('designs');
assert.deepStrictEqual(hits, [['doorway', true, true], ['designs', true]]);
assert.strictEqual(screens[screens.length - 2], 'placeholder', 'details falls back while its shell is empty');
['doorway', 'details', 'done', 'designs'].forEach(function (s) { r.screen = s; r.back(); assert.strictEqual(r.screen, 'type', 'no door yet: back goes to the start'); });
door(r);
['doorway', 'details', 'done', 'designs'].forEach(function (s) { r.go(s); r.back(); assert.strictEqual(r.screen, 'door', 'back from ' + s); });
r.back();
assert.strictEqual(r.screen, 'style');
window.HD_DD_D4Steps = {};
window.HD_DD_D4MyDesigns = {};

// loadDesigns: the owner pair, then My designs
var ld = make();
ld.loadDesigns('tokL', 'kkk');
assert.deepStrictEqual(ld.store.owner, { token: 'tokL', k: 'kkk' });
assert.strictEqual(ld.screen, 'designs');

// timers and matchMedia are injectable
var t = make({ timers: { set: 1, clear: 2 }, matchMedia: function () { return { matches: true }; } });
assert.deepStrictEqual(t.timers, { set: 1, clear: 2 });
assert.strictEqual(t.reducedMotion(), true);
assert.strictEqual(make({ matchMedia: function () { return { matches: false }; } }).reducedMotion(), false);
assert.strictEqual(typeof make().timers.set, 'function');

// ---- a pick during the preview: the option already on the door still redraws the real door ----
var pv = door(make());
var redraws = 0, live = true;
pv.doorView = { stopPreview: function () { var was = live; live = false; return was; }, refresh: function () { redraws++; } };
var curColour = pv.design()['Door Colour (External)'].label;
assert.strictEqual(pv.pick('colour', 'Door Colour (External)', curColour), false, 'not a change');
assert.strictEqual(redraws, 1, 'the stopped preview is replaced by the real door');
assert.strictEqual(pv.pick('colour', 'Door Colour (External)', curColour), false);
assert.strictEqual(redraws, 1, 'no preview playing: nothing to redraw');
live = true;
pv.pick('colour', 'Door Colour (External)', colours.filter(function (l) { return l !== curColour; })[0]);
assert.strictEqual(redraws, 2, 'a real change redraws once: Designer 3 does it');

// ---- a new door type is a new door: the preview plays again, nohandle may be reported again ----
var nt = door(make());
assert.strictEqual(nt.previewDue, true);
nt.previewDue = false;          // the door screen played it
nt.noHandleSent = true;         // and the visitor pressed the button with no handle
nt.go('type');
nt.select('Door Type', 'Single Door');
nt.select('Door Design', 'Abbott');
assert.strictEqual(nt.previewDue, false, 'the same type again: the same door');
assert.strictEqual(nt.noHandleSent, true);
nt.go('type');
nt.select('Door Type', 'Stable Door');
assert.strictEqual(nt.noHandleSent, false, 'a different type resets nohandle');
nt.select('Door Design', nt.styles()[0].label);
assert.strictEqual(nt.design().Handle.label.trim(), 'No Handle');
assert.strictEqual(nt.previewDue, true, 'a different type: the preview plays for the new door');
var sd = make();
sd.noHandleSent = true;
sd.startDoor();
assert.strictEqual(sd.noHandleSent, false, 'startDoor is a new door');
assert.strictEqual(make().noHandleSent, false);

// ---- loadSaved: the door (no preview), or My designs for a removed or closed door ------------
function opened(design, doors, screen, before) {
  var store = fakeStore();
  store.listReply = { ok: true, body: { doors: doors, missing: { name: false, postcode: true, phone: true } } };
  var o = make({ store: store, api: function () { return Promise.resolve({ ok: true, body: { design: JSON.parse(JSON.stringify(design)), kind: 'enquiry' } }); } });
  if (before) { before(o); }
  o.loadSaved('tok1', screen);
  return tick().then(tick).then(function () { return o; });
}
(async function () {
  var src = door(make());
  src.pick('handle', 'Handle', 'Lever/Lever');
  var live = await opened(src.design(), [{ token: 'tok1', status: 'pending' }]);
  assert.strictEqual(live.screen, 'door');
  assert.strictEqual(live.previewDue, false, 'loadSaved never sets previewDue');
  assert.strictEqual(live.design().Handle.label, 'Lever/Lever');
  assert.strictEqual(live.needHandle, false);
  assert.strictEqual(live.savedToken, 'tok1', 'the ask shows its sent state');
  assert.strictEqual(live.saver().saved(), true);
  assert.ok(live.store.tokens.indexOf('tok1') !== -1, 'token added to the store');
  assert.deepStrictEqual(live.missing, { name: false, postcode: true, phone: true });
  assert.strictEqual(live.log.filter(function (s) { return s[0] === 'handle_preview'; }).length, 0);
  live.back();
  live.select('Door Design', 'Alto');
  assert.strictEqual(live.previewDue, false, 'a reopened door never previews');

  var removed = await opened(src.design(), [{ token: 'other', status: 'pending' }]);
  assert.strictEqual(removed.screen, 'designs', 'a removed door opens My designs');
  var closed = await opened(src.design(), [{ token: 'tok1', status: 'closed' }]);
  assert.strictEqual(closed.screen, 'designs', 'a closed door opens My designs');
  assert.strictEqual(closed.previewDue, false);
  var closedAsked = await opened(src.design(), [{ token: 'tok1', status: 'closed' }], 'doorway');
  assert.strictEqual(closedAsked.screen, 'designs', 'a closed door never opens at the doorway');

  // From My designs: a target screen, and nothing carried over from the door that was open before
  var atDoorway = await opened(src.design(), [{ token: 'tok1', status: 'pending' }], 'doorway', function (o) {
    door(o); o.pick('handle', 'Handle', 'Lever/Lever');
    o.mine.Bogus = 'left over'; o.savedToken = 'tokOld'; o.saver(); o.d4steps = { fired: { doorway: true } };
  });
  assert.strictEqual(atDoorway.screen, 'doorway', 'loadSaved(token, "doorway") lands on the doorway');
  assert.strictEqual(atDoorway.previewDue, false);
  assert.strictEqual(atDoorway.savedToken, 'tok1');
  assert.strictEqual(atDoorway.mine.Bogus, undefined, 'the previous door\'s picks are dropped');
  assert.strictEqual(atDoorway.d4steps, null, 'per-door step state starts over');
  assert.strictEqual(atDoorway.design().Handle.label, 'Lever/Lever');
  var atDoor = await opened(src.design(), [{ token: 'tok1', status: 'pending' }], 'door');
  assert.strictEqual(atDoor.screen, 'door');

  // ---- after a lead, no autosave while the door has no handle; the next handle sends it --------
  window.HD_DD_CONFIG = { d3Defaults: table, restUrl: 'https://example.test/wp-json/hd/v1/' };
  var updates = [];
  var au = door(make({ store: fakeStore({ update: function (t, b) { updates.push([t, b.design.Handle.label]); return Promise.resolve({ ok: true }); } }) }));
  au.pick('handle', 'Handle', 'Lever/Lever');
  au.savedToken = 'tokA';               // the ask's lead went through
  assert.strictEqual(au.saver().saved(), true);
  au.pick('handle', 'Handle', 'No Handle ');
  await tick(); await tick();
  assert.deepStrictEqual(updates, [], 'nothing sent for a door with no handle');
  au.pick('colour', 'Door Colour (External)', colours.filter(function (l) { return l !== au.design()['Door Colour (External)'].label; })[0]);
  await tick(); await tick();
  assert.deepStrictEqual(updates, [], 'still nothing while the handle is missing');
  au.pick('handle', 'Handle', '400mm Pull Handle');
  await tick(); await tick();
  assert.deepStrictEqual(updates, [['tokA', '400mm Pull Handle']], 'the next handle pick sends the update');
  window.HD_DD_CONFIG = { d3Defaults: table };

  // ---- Designer 3 untouched in the same process -------------------------------------------
  var d3 = make({ flow: 'designer3' }, null, D3App);
  door(d3);
  assert.strictEqual(d3.flow, 'designer3');
  assert.ok(H.hasHandle(d3.design()), 'Designer 3 still pre-picks a handle: ' + d3.design().Handle.label);
  assert.strictEqual(d3.needHandle, undefined);
  console.log('d4-app.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
