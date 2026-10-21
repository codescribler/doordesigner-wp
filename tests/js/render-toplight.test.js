// Plain-Node tests: Endurance top-light artwork, drawn only when asked ({toplights:true}).
// Classic never asks, so a Toplight design still renders as a plain door there.
// Run: node tests/js/render-toplight.test.js
var assert = require('assert');
var RM = require('../../assets/js/render-model.js');
var model = require('../../data/render-model.json');
var cat = require('../../data/endurance-catalogue-full.json');

function frameChoices(type) {
  function find(o) {
    if (!o || typeof o !== 'object') { return null; }
    if (o['Frame Design'] && o['Frame Design'].choices) { return o['Frame Design'].choices; }
    for (var k in o) { var r = find(o[k]); if (r) { return r; } }
    return null;
  }
  return find(cat[type]) || [];
}
function design(type, frame, extra) {
  var d = { 'Door Type': { label: type }, 'Door Design': { label: model.types[type].styles.Abbott ? 'Abbott' : Object.keys(model.types[type].styles)[0] }, 'Frame Colour': { label: 'Anthracite Grey/White' },
    'Door Hinged On': { label: 'Hinges on Left' }, 'Frame Design': frame };
  for (var k in extra || {}) { d[k] = extra[k]; }
  return d;
}
var TYPES = ['Single Door', 'Stable Door', 'Avantal'];
var TOP_IDS = ['11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '30', '31', '32', '33'];
var byId = function (type, id) { return frameChoices(type).filter(function (c) { return String(c.id) === id; })[0]; };
var slots = function (ls, s) { return ls.filter(function (l) { return l.slot === s; }); };

// classic assemble ignores toplights: every Toplight frame draws exactly the plain door.
TYPES.forEach(function (t) {
  frameChoices(t).filter(function (c) { return /toplight/i.test(c.label); }).forEach(function (c) {
    var d = design(t, c);
    var plain = design(t, { label: 'No Sidelights' });
    assert.deepStrictEqual(RM.assemble(model, t, d), RM.assemble(model, t, plain), 'classic ' + t + ' ' + c.id);
    assert.deepStrictEqual(RM.assemble(model, t, d, {}), RM.assemble(model, t, plain), 'empty opts ' + t + ' ' + c.id);
    assert.strictEqual(RM.shouldFlip(model, t, d), RM.shouldFlip(model, t, plain), 'classic flip ' + t + ' ' + c.id);
  });
});

// topShapes keyed by Frame Design id, never added to the label-keyed shapes.
TYPES.forEach(function (t) {
  var S = model.types[t].sidelights;
  assert.deepStrictEqual(Object.keys(S.topShapes).sort(), TOP_IDS.slice().sort(), t + ' topShapes ids');
  Object.keys(S.shapes).forEach(function (k) { assert.ok(!/toplight/i.test(k), t + ' shapes has no toplight ' + k); });
});

// With {toplights:true}: id 20 (Toplight with Half Flag Both) has a toplight layer and two side panels.
TYPES.forEach(function (t) {
  var ls = RM.assemble(model, t, design(t, byId(t, '20')), { toplights: true });
  assert.strictEqual(slots(ls, 'toplight').length, 1, t + ' 20 toplight layer');
  var side = slots(ls, 'Side');
  assert.ok(side.some(function (l) { return l.cx < 100; }) && side.some(function (l) { return l.cx > 200; }), t + ' 20 panels both sides');
  var fr = slots(ls, 'DoorFrames');
  assert.strictEqual(fr.length, 1);
  assert.ok(/DoorFrames\/SingleBothSidelightsHalfFlagTopLight\/[^/]+\.png$/.test(fr[0].url), t + ' frame variant ' + fr[0].url);
  assert.strictEqual(fr[0].h, 363);
  // the door drops below the top light and shifts right of the left side panel
  var blank = slots(ls, 'DoorBlanks')[0];
  assert.ok(Math.abs(blank.cy - 201.6) < 0.01, t + ' blank cy ' + blank.cy);
  assert.ok(Math.abs(blank.cx - require('../../data/endurance-toplights.json')[t]['20'].doorBlank.cx) < 0.01, t + ' blank cx');
  // the frame shape fixes the side: never mirrored
  assert.strictEqual(RM.shouldFlip(model, t, design(t, byId(t, '20')), { toplights: true }), false);
});

var S = 'Single Door';
// id 31 shares 14's label but has ONE tall side pane; 14 has two (top + half flag).
var p14 = slots(RM.assemble(model, S, design(S, byId(S, '14')), { toplights: true }), 'Side');
var p31 = slots(RM.assemble(model, S, design(S, byId(S, '31')), { toplights: true }), 'Side');
assert.strictEqual(byId(S, '14').label, byId(S, '31').label);
assert.strictEqual(p14.length, 2);
assert.strictEqual(p31.length, 1);
assert.ok(p31[0].h > 150);
// selected by id: a label alone draws nothing extra
assert.deepStrictEqual(RM.assemble(model, S, design(S, { label: byId(S, '14').label }), { toplights: true }),
  RM.assemble(model, S, design(S, { label: 'No Sidelights' })));

// id 11: just a top light over the door, no side panels; the plain door may still mirror.
var t11 = RM.assemble(model, S, design(S, byId(S, '11')), { toplights: true });
assert.strictEqual(slots(t11, 'toplight').length, 1);
assert.strictEqual(slots(t11, 'Side').length, 0);
assert.ok(/DoorFrames\/SingleTopLight\//.test(slots(t11, 'DoorFrames')[0].url));
assert.strictEqual(RM.shouldFlip(model, S, design(S, byId(S, '11')), { toplights: true }), true);

// toplight glass sits under the frame and over the door
var order = t11.map(function (l) { return l.slot; });
assert.ok(order.indexOf('toplight') < order.indexOf('DoorFrames') && order.indexOf('toplight') > order.indexOf('DoorBlanks'));

// Unglazed sidelights omit the side glass (like Classic sidelights); the top light stays.
var ung = RM.assemble(model, S, design(S, byId(S, '19'), { 'Sidelight Type': { label: 'Unglazed' } }), { toplights: true });
assert.strictEqual(slots(ung, 'Side').length, 0);
assert.strictEqual(slots(ung, 'toplight').length, 1);

// Non-toplight frames are unaffected by the option.
var sl = design(S, byId(S, '2') || { label: 'Sidelight Left' });
assert.deepStrictEqual(RM.assemble(model, S, sl, { toplights: true }), RM.assemble(model, S, sl));

console.log('render-toplight OK');
