// Designer 4 doorway picture families. `node tests/js/d4-doorway.test.js`
var assert = require('assert');
global.window = { HD_DD_D3Frame: require('../../assets/js/designer3/d3-frame.js') };
var D = require('../../assets/js/designer4/d4-doorway.js');
var byType = require('./fixtures/customer-view.js').customerView().byType;

assert.deepStrictEqual(D.FAMILIES.map(function (f) { return f.key; }), ['door', 'above', 'oneside', 'bothsides', 'oneside_above', 'bothsides_above']);
assert.deepStrictEqual(D.FAMILIES.map(function (f) { return f.pic; }), [1, 11, 2, 8, 12, 18]);
assert.strictEqual(D.FAMILIES[2].label, 'Glass on one side (left or right)');

var seen = {};
D.FAMILIES.forEach(function (f) { f.ids.forEach(function (id) { seen[id] = (seen[id] || 0) + 1; }); });
assert.strictEqual(Object.keys(seen).length, 24);
Object.keys(seen).forEach(function (id) {
  assert.strictEqual(seen[id], 1, id + ' in exactly one family');
  assert.ok(D.CAPTIONS[id] && typeof D.CAPTIONS[id] === 'string', id + ' caption');
  assert.ok(/^assets\/img\/frames\/frame-.*\.png$/.test(D.drawing(id)), id + ' drawing');
});
assert.strictEqual(D.CAPTIONS[31], 'Left, top half, glass runs to the top');
assert.strictEqual(D.drawing(999), null);

assert.strictEqual(D.familyOf(31), 'oneside_above');
assert.strictEqual(D.familyOf('8'), 'bothsides');
assert.strictEqual(D.familyOf(99), null);

// Single door offers all 24; Double only id 1.
var all = D.families(byType['Single Door'].fields['Frame Design']);
assert.strictEqual(all.length, 6);
assert.strictEqual(all[4].ids.length, 8);
var dbl = D.families(byType['Double Door'].fields['Frame Design']);
assert.deepStrictEqual(dbl.map(function (f) { return f.key; }), ['door']);
assert.deepStrictEqual(D.families([{ id: 1 }, { id: 30 }, { id: 31 }]).map(function (f) { return f.ids.join(); }), ['1', '30', '31']);
assert.deepStrictEqual(D.families([]), []);
assert.deepStrictEqual(D.families(null), []);
// Does not mutate FAMILIES.
assert.strictEqual(D.FAMILIES[4].ids.length, 8);
console.log('d4-doorway ok');
