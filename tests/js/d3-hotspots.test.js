// Run: node tests/js/d3-hotspots.test.js
var assert = require('assert');
var H = require('../../assets/js/designer3/d3-hotspots.js');
var RM = require('../../assets/js/render-model.js');
var model = require('../../data/render-model.json');
var T = model.types['Single Door'];

function d(style, extra) {
  var o = { 'Door Design': { label: style }, 'Door Glass': { label: 'Unglazed' }, Handle: { label: 'Lever/Pad' }, Knocker: { label: 'No Knocker' }, Letterplate: { label: 'Letterplate' } };
  for (var k in (extra || {})) { o[k] = { label: extra[k] }; }
  return o;
}
function by(list, key) { return list.filter(function (s) { return s.key === key; })[0]; }
function stageH(design, opts) { return H.stageOf(RM.assemble(model, 'Single Door', design, opts), T).height; }
function near(a, b, m) { assert(Math.abs(a - b) < 1e-9, m + ' ' + a + ' vs ' + b); }

// in range, in the stated order
var order = H.KEYS;
['Abbott', 'Ben Nevis', 'Alto'].forEach(function (style) {
  var design = d(style, { Knocker: Object.keys(T.knockers)[0], 'Door Glass': 'Clear' });
  [undefined, { toplights: true }].forEach(function (opts) {
    var s = H.spots(model, 'Single Door', design, opts);
    s.forEach(function (p) { assert(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, style + ' ' + p.key); });
    var idx = s.map(function (p) { return order.indexOf(p.key); });
    assert.deepStrictEqual(idx, idx.slice().sort(function (a, b) { return a - b; }), 'order ' + style);
  });
});

// letterplate y = cy / stage height; Bottom uses letterplateBottomCy
var ab = T.styles.Abbott;
var plain = d('Abbott');
near(by(H.spots(model, 'Single Door', plain), 'letterplate').y, ab.letterplateCy / stageH(plain), 'middle');
var bottom = d('Abbott', { 'Letterplate Position': 'Bottom' });
near(by(H.spots(model, 'Single Door', bottom), 'letterplate').y, ab.letterplateBottomCy / stageH(bottom), 'bottom');

// knocker: offered where the style has one (even with No Knocker); none for a style without
assert(by(H.spots(model, 'Single Door', plain), 'knocker'), 'Abbott offers a knocker');
assert.strictEqual(by(H.spots(model, 'Single Door', d('Alto')), 'knocker'), undefined, 'Alto has none');
var withK = d('Abbott', { Knocker: Object.keys(T.knockers)[0] });
near(by(H.spots(model, 'Single Door', withK), 'knocker').y, ab.knockerCy / stageH(withK), 'knocker y');

// an unglazed door still offers a glass dot
assert(by(H.spots(model, 'Single Door', plain), 'glass'));

// colour = slab at 0.8 of its height
var slab = RM.assemble(model, 'Single Door', plain).filter(function (l) { return l.slot === 'DoorBlanks'; })[0];
near(by(H.spots(model, 'Single Door', plain), 'colour').y, (slab.cy + 0.3 * slab.h) / stageH(plain), 'colour y');

// side lights: the door shifts right inside a wider stage, dots stay in range
var sl = d('Abbott');
sl['Frame Design'] = { label: 'Sidelight Left' };
var a = by(H.spots(model, 'Single Door', plain), 'colour'), b = by(H.spots(model, 'Single Door', sl), 'colour');
assert(b.x >= 0 && b.x <= 1);
assert.notStrictEqual(a.x, b.x, 'door moved with the sidelight');

assert.deepStrictEqual(H.spots(model, 'Nope', plain), []);
console.log('d3-hotspots ok');
