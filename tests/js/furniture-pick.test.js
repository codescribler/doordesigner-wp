// Changing the hardware colour must never strand the customer on an unrelated handle.
// Replays the reported sequence: Lever/Lever in Chrome, step through every finish, back to
// Chrome. `node tests/js/furniture-pick.test.js`
var assert = require('assert');
var model = require('../../data/render-model.json');
var S = require('../../assets/js/design-shared.js');
var fx = require('./fixtures/customer-view.js');

var TYPE = 'Single Door';
var node = fx.customerView().byType[TYPE];
var handles = node.fields['Handle'];
var finishes = node.fields['Hardware Type'].map(function (c) { return c.label; });

// Minimal model of the swipe app's settle(): reset → pickFurniture → remember auto picks.
function run(sequence, userHandle) {
  var d = { 'Hardware Type': { label: 'Chrome' }, 'Handle': { label: userHandle || 'Lever/Lever' } };
  var mine = userHandle || '';
  var wanted = ''; // what was on the door before the first swap (the app's `wanted`)
  var auto = '';
  var trail = [];
  sequence.forEach(function (finish) {
    var before = d['Handle'] ? d['Handle'].label : '';
    d['Hardware Type'] = { label: finish };
    S.resetFurnitureIfIncompatible(model, TYPE, d);
    var cur = d['Handle'] ? d['Handle'].label : '';
    var dropped = before && !cur ? before : '';
    if (dropped && !mine && !wanted) { wanted = dropped; }
    var target = mine || wanted;
    var pick = S.pickFurniture(model, TYPE, d, 'handle', handles, cur, dropped, target, auto);
    if (pick) { d['Handle'] = { label: pick }; if (pick === target) { auto = ''; wanted = ''; } else { auto = pick; } }
    trail.push(finish + ':' + (d['Handle'] ? d['Handle'].label : '(none)'));
  });
  return trail;
}

// 1) Default Lever/Lever through every finish: never becomes a pull bar or traditional handle.
var trail = run(finishes.concat(['Chrome']));
trail.forEach(function (t) {
  var h = t.split(':')[1];
  assert.notStrictEqual(S.furnitureKind(h), 'pull', 'lever replaced by a pull bar: ' + t);
});
// …and back on Chrome it's the plain Lever/Lever again.
assert.strictEqual(trail[trail.length - 1], 'Chrome:Lever/Lever', trail.join(' | '));

// 2) The customer's own pick comes back when a finish offers it again.
var own = run(['Stainless Steel', 'Black', 'Chrome'], 'Architectural Lever/Lever');
assert.notStrictEqual(own[0].split(':')[1], 'Architectural Lever/Lever', 'not made in Stainless');
assert.strictEqual(own[own.length - 1], 'Chrome:Architectural Lever/Lever', own.join(' | '));

// 3) A pull-bar customer stays on pull bars.
var pull = run(finishes, '1200mm Pull Handle');
pull.forEach(function (t) { assert.strictEqual(S.furnitureKind(t.split(':')[1]), 'pull', t); });

// 4) Every finish always leaves SOME valid handle selected.
run(finishes).forEach(function (t) { assert.ok(t.split(':')[1] !== '(none)', t); });

// 5) Arriving at the step with nothing chosen and nothing removed: leave the default alone.
assert.strictEqual(S.pickFurniture(model, TYPE, { 'Hardware Type': { label: 'Chrome' } }, 'handle', handles, '', '', '', ''), '');

// 6) An odd one-off (Touch Key, kind 'other') falls back to a lever, not the first pull bar.
var odd = S.pickFurniture(model, TYPE, { 'Hardware Type': { label: 'Stainless Steel' } }, 'handle', handles, '', ' Touch Key Handle Chrome', '', '');
assert.strictEqual(S.furnitureKind(odd), 'lever', odd);

assert.strictEqual(S.furnitureKind('Forged Black Noble Handle'), 'traditional');
assert.strictEqual(S.furnitureKind('No Letterplate'), 'none');

console.log('furniture-pick.test.js: all assertions passed');
