// Designer 3: the door picture sent with a save update (and so in the business email) is the
// door on screen, never the one before. The preview draws asynchronously (as the real one loads
// images); the snapshot names what the canvas last drew.
// `node tests/js/d3-fresh-picture.test.js`
var assert = require('assert');

function node(tag) {
  var n = {
    tag: tag, className: '', textContent: '', children: [], attrs: {}, listeners: {}, style: {}, parentNode: null, hidden: false, disabled: false, value: '', type: '',
    appendChild: function (c) { if (c.parentNode) { c.parentNode.removeChild(c); } c.parentNode = n; n.children.push(c); return c; },
    removeChild: function (c) { n.children = n.children.filter(function (x) { return x !== c; }); c.parentNode = null; return c; },
    setAttribute: function (k, v) { n.attrs[k] = String(v); },
    getAttribute: function (k) { return k in n.attrs ? n.attrs[k] : null; },
    addEventListener: function (type, fn) { (n.listeners[type] = n.listeners[type] || []).push(fn); },
    focus: function () { document.activeElement = n; },
    scrollIntoView: function () {},
    querySelector: function () { return null; },
    classList: { contains: function (c) { return (' ' + n.className + ' ').indexOf(' ' + c + ' ') !== -1; }, toggle: function () {}, add: function () {}, remove: function () {} }
  };
  Object.defineProperty(n, 'innerHTML', { set: function () { n.children.forEach(function (c) { c.parentNode = null; }); n.children = []; }, get: function () { return ''; } });
  return n;
}
global.document = { createElement: node, activeElement: null };
function all(n, test, out) { out = out || []; if (test(n)) { out.push(n); } n.children.forEach(function (c) { all(c, test, out); }); return out; }
function walk(n, test) { return all(n, test)[0] || null; }
function byKey(n, k) { return walk(n, function (x) { return x.attrs['data-k'] === k; }); }
function byText(n, t) { return walk(n, function (x) { return (x.tag === 'button' || x.tag === 'a') && (x.textContent === t || x.children.some(function (c) { return c.textContent === t; })); }); }
function byTag(n, t) { return walk(n, function (x) { return x.tag === t; }); }
function input(n, name) { return walk(n, function (x) { return x.tag === 'input' && x.name === name; }); }
function fire(n, type) { assert.ok(n, 'element to ' + type); (n.listeners[type] || []).forEach(function (fn) { fn({ preventDefault: function () {} }); }); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// What a canvas shows: the frame id, the colour and the side panels of the design it drew.
function look(design) {
  return [design['Frame Design'] ? design['Frame Design'].id : '-', design['Door Colour (External)'] ? design['Door Colour (External)'].label : '-', design['Sidelight Type'] ? design['Sidelight Type'].label : '-'].join('|');
}
var PAINT_MS = 15;
var Enquiry = require('../../assets/js/enquiry.js');
Enquiry.snapshot = function (cv) { return cv && cv.drawn ? 'png:' + cv.drawn : null; };

var model = require('../../data/render-model.json');
var fx = require('./fixtures/customer-view.js');
global.window = {
  location: { origin: 'https://example.test', pathname: '/d/', search: '' },
  HD_DD_CONFIG: { restUrl: 'https://example.test/wp-json/hd/', pluginUrl: 'https://example.test/plugin/', d3Defaults: require('../../data/designer3-defaults.json'), trust: { guidePrice: 'G' } },
  HD_DD_StepConfig: require('../../assets/js/wizard/step-config.js'),
  HD_DD_Wizard: require('../../assets/js/wizard/wizard-controller.js'),
  HD_DD_Shared: require('../../assets/js/design-shared.js'),
  HD_DD_RenderModel: require('../../assets/js/render-model.js'),
  HD_DD_Enquiry: Enquiry,
  HD_DD_ReviewSave: require('../../assets/js/swipe/review-save.js'),
  HD_DD_Trust: require('../../assets/js/trust.js'),
  HD_DD_SwipeParts: require('../../assets/js/swipe/swipe-parts.js'),
  HD_DD_D3Defaults: require('../../assets/js/designer3/d3-defaults.js'),
  HD_DD_D3Hotspots: require('../../assets/js/designer3/d3-hotspots.js'),
  HD_DD_D3Nudge: require('../../assets/js/designer3/d3-nudge.js'),
  HD_DD_D3Save: require('../../assets/js/designer3/d3-save.js'),
  HD_DD_D3Toolbox: require('../../assets/js/designer3/d3-toolbox.js'),
  HD_DD_D3Frame: require('../../assets/js/designer3/d3-frame.js'),
  // An asynchronous preview, like the real one (it waits for its images).
  HD_DD_Preview: { create: function (canvas) {
    return { render: function (type, design) {
      var shows = look(design);
      return new Promise(function (r) { setTimeout(function () { canvas.drawn = shows; r(); }, PAINT_MS); });
    } };
  } }
};
require('../../assets/js/designer3/d3-screens.js');
require('../../assets/js/designer3/d3-callback.js');
require('../../assets/js/designer3/d3-frame-step.js');
require('../../assets/js/designer3/d3-after-save.js');
require('../../assets/js/designer3/d3-app.js');

function harness(replies) {
  var h = { calls: [] };
  h.api = function (path, o) {
    h.calls.push([path, o && o.body ? JSON.parse(o.body) : null]);
    var r = (replies || []).filter(function (x) { return x[0].test(path); })[0];
    return Promise.resolve(r ? r[1] : { ok: true, status: 200, body: { ok: true } });
  };
  h.app = new window.HD_DD_Designer3App(node('div'), fx.customerView(), model, null,
    { api: h.api, funnel: { step: function () {}, lead: function () {} }, flow: 'designer3', storage: null });
  h.app.select('Door Type', 'Single Door');
  h.app.select('Door Design', 'Abbott');
  h.app.savedToken = 'tok';
  h.app.go('saved');
  h.updates = function () { return h.calls.filter(function (c) { return c[0] === 'save/tok'; }); };
  h.last = function () { var u = h.updates(); return u[u.length - 1]; };
  h.index = function (path) { for (var i = h.calls.length - 1; i >= 0; i--) { if (h.calls[i][0] === path) { return i; } } return -1; };
  return h;
}
function shell(h) { return h.app.shell; }

(async function () {
  // ---- frame chips: the update carries the frame just chosen, drawn -----------------------
  var h = harness();
  await wait(PAINT_MS * 3);
  fire(byKey(shell(h), 'sides:left'), 'click');
  fire(byKey(shell(h), 'top:none'), 'click');
  fire(byKey(shell(h), 'panel:glass'), 'click');   // the last chip completes the layout: id 2
  await wait(PAINT_MS * 4);
  assert.strictEqual(h.last()[1].design['Frame Design'].id, 2);
  assert.strictEqual(h.last()[1].image, 'png:' + look(h.app.design()), 'the picture shows id 2, not the frame before');

  // ---- a side glass row ------------------------------------------------------------------
  fire(byKey(shell(h), 'opt:Sidelight Type:Unglazed'), 'click');
  await wait(PAINT_MS * 4);
  assert.strictEqual(h.last()[1].design['Sidelight Type'].label, 'Unglazed');
  assert.strictEqual(h.last()[1].image, 'png:' + look(h.app.design()), 'the picture shows the unglazed panels');

  // ---- "Just the door" then straight to a price: the record has the new picture first ------
  fire(byText(shell(h), 'Just the door'), 'click');
  fire(byText(shell(h), 'Get a no-obligation quote'), 'click');
  var f = byTag(shell(h), 'form');
  input(f, 'name').value = 'Ann'; input(f, 'postcode').value = 'AL1 1AA';
  fire(f, 'submit');                                // before the quote screen has even painted
  await wait(PAINT_MS * 6);
  var q = h.index('save/tok/quote');
  assert.ok(q !== -1, 'the quote was sent');
  var before = h.calls.slice(0, q).filter(function (c) { return c[0] === 'save/tok'; });
  var upd = before[before.length - 1];
  assert.strictEqual(upd[1].design['Frame Design'].label, 'No Sidelights', 'the update before the quote has the door as sent');
  assert.strictEqual(upd[1].image, 'png:' + look(h.app.design()), 'and its picture: no side glass');

  // ---- a door-screen pick (toolbox) ---------------------------------------------------------
  var d = harness();
  d.app.go('door');
  await wait(PAINT_MS * 3);
  var colours = d.app.stepFor('Door Colour (External)').choices.map(function (c) { return c.label; }).filter(function (l) { return l !== d.app.design()['Door Colour (External)'].label; });
  d.app.pick('colour', 'Door Colour (External)', colours[0]);
  await wait(PAINT_MS * 4);
  assert.strictEqual(d.last()[1].design['Door Colour (External)'].label, colours[0]);
  assert.strictEqual(d.last()[1].image, 'png:' + look(d.app.design()), 'the picture shows the new colour');

  // ---- call back straight after a frame change ------------------------------------------------
  var c = harness([[/\/callback$/, { ok: true, status: 201, body: { ok: true, reference: 'HD-2' } }]]);
  await wait(PAINT_MS * 3);
  fire(byKey(shell(c), 'sides:right'), 'click');
  fire(byKey(shell(c), 'top:none'), 'click');
  fire(byKey(shell(c), 'panel:glass'), 'click');
  c.app.go('callback');
  var cf = byTag(shell(c), 'form');
  input(cf, 'name').value = 'Bob'; input(cf, 'telephone').value = '01234 567890';
  fire(cf, 'submit');
  await wait(PAINT_MS * 6);
  var k = c.index('save/tok/callback');
  assert.ok(k !== -1, 'the call back was sent');
  var cb = c.calls.slice(0, k).filter(function (x) { return x[0] === 'save/tok'; });
  assert.strictEqual(cb[cb.length - 1][1].image, 'png:' + look(c.app.design()), 'the call back\'s record has the frame on screen');

  console.log('d3-fresh-picture.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
