// Shared stub DOM and harness for the Designer 4 step screens (d4-steps / d4-doorway-screen tests).
// Real Designer 3/4 app and wizard; the store is a recording fake.
var assert = require('assert');

function node(tag) {
  var n = {
    tag: tag, className: '', textContent: '', children: [], attrs: {}, listeners: {}, style: {}, parentNode: null, disabled: false, value: '', type: '', name: '', src: '', alt: null,
    appendChild: function (c) { if (c.parentNode) { c.parentNode.removeChild(c); } c.parentNode = n; n.children.push(c); return c; },
    removeChild: function (c) { n.children = n.children.filter(function (x) { return x !== c; }); c.parentNode = null; return c; },
    setAttribute: function (k, v) { n.attrs[k] = String(v); },
    getAttribute: function (k) { return k in n.attrs ? n.attrs[k] : null; },
    addEventListener: function (type, fn) { (n.listeners[type] = n.listeners[type] || []).push(fn); },
    focus: function () { document.activeElement = n; },
    scrollIntoView: function () {},
    classList: { contains: function (c) { return has(n, c); }, toggle: function () {}, add: function () {}, remove: function () {} }
  };
  Object.defineProperty(n, 'innerHTML', { set: function () { n.children.forEach(function (c) { c.parentNode = null; }); n.children = []; }, get: function () { return ''; } });
  return n;
}
function has(n, c) { return (' ' + n.className + ' ').indexOf(' ' + c + ' ') !== -1; }
global.document = { createElement: node, activeElement: null };
function all(n, test, out) { out = out || []; if (test(n)) { out.push(n); } n.children.forEach(function (c) { all(c, test, out); }); return out; }
function walk(n, test) { return all(n, test)[0] || null; }
function text(n) { return all(n, function () { return true; }).map(function (x) { return x.textContent; }).join(' '); }
function byCls(n, c) { return walk(n, function (x) { return has(x, c); }); }
function allCls(n, c) { return all(n, function (x) { return has(x, c); }); }
function byKey(n, k) { return walk(n, function (x) { return x.attrs['data-k'] === k; }); }
function byText(n, t) { return walk(n, function (x) { return (x.tag === 'button' || x.tag === 'a') && text(x).trim() === t; }); }
function input(n, name) { return walk(n, function (x) { return x.tag === 'input' && x.name === name; }); }
function fire(n, type) { assert.ok(n, 'element to ' + type); (n.listeners[type] || []).forEach(function (fn) { fn({ preventDefault: function () {} }); }); }
function tick() { return new Promise(function (r) { setImmediate(r); }); }
async function settle() { for (var i = 0; i < 6; i++) { await tick(); await new Promise(function (r) { setTimeout(r, 0); }); } }

var model = require('../../../data/render-model.json');
var fx = require('./customer-view.js');
global.window = {
  location: { origin: 'https://example.test', pathname: '/d/', search: '' },
  HD_DD_CONFIG: { restUrl: 'https://example.test/wp-json/hd/', pluginUrl: 'https://example.test/plugin', d3Defaults: require('../../../data/designer3-defaults.json') },
  HD_DD_StepConfig: require('../../../assets/js/wizard/step-config.js'),
  HD_DD_Wizard: require('../../../assets/js/wizard/wizard-controller.js'),
  HD_DD_Shared: require('../../../assets/js/design-shared.js'),
  HD_DD_RenderModel: require('../../../assets/js/render-model.js'),
  HD_DD_Enquiry: require('../../../assets/js/enquiry.js'),
  HD_DD_ReviewSave: require('../../../assets/js/swipe/review-save.js'),
  HD_DD_D3Defaults: require('../../../assets/js/designer3/d3-defaults.js'),
  HD_DD_D3Hotspots: require('../../../assets/js/designer3/d3-hotspots.js'),
  HD_DD_D3Nudge: require('../../../assets/js/designer3/d3-nudge.js'),
  HD_DD_D3Toolbox: require('../../../assets/js/designer3/d3-toolbox.js'),
  HD_DD_D3Frame: require('../../../assets/js/designer3/d3-frame.js'),
  HD_DD_D4Door: { door: function () { return {}; } },
  HD_DD_D4MyDesigns: {}
};
window.HD_DD_D4Handle = require('../../../assets/js/designer4/d4-handle.js');
window.HD_DD_D4Doorway = require('../../../assets/js/designer4/d4-doorway.js');
window.HD_DD_D4Ask = require('../../../assets/js/designer4/d4-ask.js');
require('../../../assets/js/designer3/d3-screens.js');
require('../../../assets/js/designer3/d3-frame-step.js');
require('../../../assets/js/designer3/d3-app.js');
require('../../../assets/js/designer4/d4-sideglass.js');
require('../../../assets/js/designer4/d4-doorway-screen.js');
require('../../../assets/js/designer4/d4-steps.js');
require('../../../assets/js/designer4/d4-app.js');
var Doorway = window.HD_DD_D4Doorway;

function fakeStore(h) {
  return {
    email: function () { return 'nicola@example.com'; },
    addToken: function () {}, auth: function () { return { tokens: ['tok1'] }; },
    update: function (t, b) { h.updates.push([t, b]); return Promise.resolve(h.updateReply || { ok: true, status: 200, body: { ok: true } }); },
    details: function (b) { h.details.push(b); return Promise.resolve(h.detailsReply || { ok: true, status: 200, body: { ok: true } }); },
    list: function () { return Promise.resolve({ ok: true, body: { doors: [] } }); }
  };
}
function harness(type, style) {
  var h = { steps: [], updates: [], details: [] };
  h.app = new window.HD_DD_Designer4App(node('div'), fx.customerView(), model, null, {
    api: function () { return Promise.resolve({ ok: false }); },
    funnel: { step: function (k, c) { h.steps.push([k, c]); }, lead: function () {} },
    storage: null, store: fakeStore(h)
  });
  h.app.select('Door Type', type || 'Single Door');
  h.app.select('Door Design', style || 'Abbott');
  var hs = h.app.stepFor('Handle');
  var real = hs.choices.filter(function (c) { return !/no handle/i.test(c.label); })[0];
  h.app.mine.Handle = real.label;
  h.app.select('Handle', real.label);
  h.app._token = 'tok1';     // as if the lead had just been sent
  h.app.saver();
  h.app._askKnown = false;
  h.of = function (k) { return h.steps.filter(function (s) { return s[0] === k; }); };
  h.shell = function () { return h.app.shell; };
  h.families = function () { var row = byCls(h.shell(), 'hd-d4-tiles--family'); return row ? allCls(row, 'hd-d4-tile') : []; };
  h.exacts = function () { var row = byCls(h.shell(), 'hd-d4-tiles--exact'); return row ? allCls(row, 'hd-d4-tile') : []; };
  h.tile = function (label) { return h.families().concat(h.exacts()).filter(function (t) { return text(t).trim() === label; })[0]; };
  h.next = function () { return byText(h.shell(), 'Next: your details'); };
  return h;
}


module.exports = { assert: assert, node: node, has: has, all: all, walk: walk, text: text, byCls: byCls, allCls: allCls, byKey: byKey,
  byText: byText, input: input, fire: fire, tick: tick, settle: settle, fx: fx, Doorway: Doorway, harness: harness };
