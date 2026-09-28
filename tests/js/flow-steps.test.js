// Plain-Node tests for HD_DD_FlowSteps — which swipe screens a door gets, in what order.
// `node tests/js/flow-steps.test.js`
var assert = require('assert');
var fx = require('./fixtures/customer-view.js');
var SC = require('../../assets/js/wizard/step-config.js');
var FS = require('../../assets/js/swipe/flow-steps.js');

var cv = fx.customerView();
function keys(type, design) {
  var d = Object.assign({ 'Door Type': { label: type } }, design || {});
  return FS.screens(cv.byType[type], d, SC).map(function (s) { return s.key; });
}
function screen(type, design, key) {
  var d = Object.assign({ 'Door Type': { label: type } }, design || {});
  return FS.screens(cv.byType[type], d, SC).filter(function (s) { return s.key === key; })[0];
}

// Single, glazed design with no knocker (Ketu) — side panels come last.
assert.deepStrictEqual(keys('Single Door', { 'Door Design': { label: 'Ketu' } }),
  ['type', 'colour', 'glazing', 'handle', 'letterplate', 'sides']);

// Solid design (Mayon): no glass step, but a knocker.
assert.deepStrictEqual(keys('Single Door', { 'Door Design': { label: 'Mayon' } }),
  ['type', 'colour', 'handle', 'letterplate', 'knocker', 'sides']);

// Double door: no side panels.
assert.ok(keys('Double Door', { 'Door Design': { label: 'Mayon' } }).indexOf('sides') === -1);

// Aluminium: single only, so the type screen becomes a hinge-side screen; no knocker.
var av = keys('Avantal', { 'Door Design': { label: 'Antares (Anthracite Grey Cassette)' } });
assert.deepStrictEqual(av.slice(0, 2), ['hinge', 'colour']);
assert.strictEqual(screen('Avantal', { 'Door Design': { label: 'Sirius' } }, 'hinge').main.key, 'hinge');
assert.ok(av.indexOf('knocker') === -1);
assert.ok(av.indexOf('type') === -1);

// Screens carry their sub-choices: hinge on the type screen, finish on the handle screen,
// inside colour on the colour screen.
var t = screen('Single Door', { 'Door Design': { label: 'Mayon' } }, 'type');
assert.deepStrictEqual(t.subs.map(function (s) { return s.key; }), ['hinge']);
var h = screen('Single Door', { 'Door Design': { label: 'Mayon' } }, 'handle');
assert.strictEqual(h.main.key, 'handle');
assert.deepStrictEqual(h.subs.map(function (s) { return s.key; }), ['hardware']);
var c = screen('Single Door', { 'Door Design': { label: 'Mayon' } }, 'colour');
assert.deepStrictEqual(c.subs.map(function (s) { return s.key; }), ['intColour']);
assert.strictEqual(screen('Avantal', { 'Door Design': { label: 'Sirius' } }, 'colour').subs.length, 0);

// Side panel sub-choices only appear once a sidelit frame (and glazed sides) is chosen.
var plain = screen('Single Door', { 'Door Design': { label: 'Mayon' }, 'Frame Design': { label: 'No Sidelights' } }, 'sides');
assert.deepStrictEqual(plain.subs.map(function (s) { return s.key; }), []);
var sided = screen('Single Door', { 'Door Design': { label: 'Mayon' }, 'Frame Design': { label: 'Double Sidelight' }, 'Sidelight Type': { label: 'Glazed' } }, 'sides');
assert.deepStrictEqual(sided.subs.map(function (s) { return s.key; }), ['sidelightType', 'sidelightGlass']);

// Every screen has helper copy and a short name for the next button.
FS.screens(cv.byType['Single Door'], { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Mayon' } }, SC)
  .forEach(function (s) { assert.ok(s.title && s.help && s.short, s.key + ' has copy'); });
assert.ok(FS.DESIGN_SCREEN.title && FS.DESIGN_SCREEN.help);

// Funnel keys: wizard step keys → door-designer-v2 keys, fired in canonical order.
assert.deepStrictEqual(FS.funnelEvents(h, { 'Handle': { label: 'Lever/Lever' }, 'Hardware Type': { label: 'Chrome' } }),
  [['hardware', 'Chrome'], ['handle', 'Lever/Lever']]);
assert.deepStrictEqual(FS.funnelEvents(t, { 'Door Type': { label: 'Single Door' }, 'Door Hinged On': { label: 'Hinges on Left' } }),
  [['type', 'Single Door'], ['hinge', 'Hinges on Left']]);
assert.deepStrictEqual(FS.funnelEvents(sided, { 'Frame Design': { label: 'Double Sidelight' }, 'Sidelight Type': { label: 'Glazed' }, 'Sidelight Glass': { label: 'Satin' } }),
  [['frame', 'Double Sidelight'], ['sidelighttype', 'Glazed'], ['sidelightglass', 'Satin']]);

console.log('flow-steps.test.js: all assertions passed');
